import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { Script } from 'node:vm';
import { CdpClient, wrapModSource, injectRenderers } from './cdp.js';
import { wsTransport } from './transport.js';
import { computeState, checkDrift } from './drift.js';
import { detectConflicts, matchesTarget, validateManifest, resolveModEntry } from './manifest.js';
import { planLaunch as planSafeMode, recordExit, recordInstall, saveState } from './safemode.js';

export async function buildPlan({ app, mods, state, opts = {} }) {
  if (!['refuse', 'warn', 'continue'].includes(opts.onDrift ?? 'refuse'))
    throw new Error('onDrift must be refuse, warn or continue; use pin to rebaseline explicitly');
  const ids = new Set();
  const loaded = mods.map(m => {
    const check = validateManifest(m.manifest);
    if (!check.ok) throw new Error(check.errors.join('; '));
    if (ids.has(m.manifest.id)) throw new Error(`duplicate mod id: ${m.manifest.id}`);
    ids.add(m.manifest.id);
    return { ...m, id: m.manifest.id };
  });
  const eligible = loaded.filter(m => matchesTarget(m.manifest, app.appId, app.version ?? '0.0.0'));
  const safe = planSafeMode(state, eligible, opts),
    conflicts = detectConflicts(safe.enabled.map(m => m.manifest));
  const drift =
    safe.enabled.length && app.asarPath
      ? checkDrift(opts.pin ?? null, await computeState(app), opts.onDrift ?? 'refuse')
      : { verdict: 'unpinned', action: 'warn' };
  return {
    app,
    enabled: safe.enabled,
    skipped: loaded
      .filter(m => !eligible.includes(m))
      .map(m => `${m.id}: not targeting ${app.appId}@${app.version ?? '?'}`),
    notes: safe.notes,
    conflicts,
    drift,
    blocked: safe.enabled.length > 0 && (drift.action === 'refuse' || conflicts.some(c => c.severity === 'error'))
  };
}

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

export function waitForDevToolsUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let text = '';
    const finish = (err, url) => {
      clearTimeout(timer);
      child.stderr?.off('data', data);
      child.off('exit', exit);
      child.off('error', error);
      err ? reject(err) : resolve(url);
    };
    const data = chunk => {
      text = (text + chunk.toString()).slice(-16384);
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(text);
      if (m) {
        try {
          const u = new URL(m[1]);
          if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
            throw Error('DevTools endpoint must be loopback');
          finish(null, u.href);
        } catch (e) {
          finish(e);
        }
      }
    };
    const exit = () => finish(new Error('app exited before opening a DevTools port; it may already be running'));
    const error = e => finish(e),
      timer = setTimeout(
        () =>
          finish(
            new Error(`no DevTools URL within ${timeoutMs}ms; app may reject remote debugging or already be running`)
          ),
        timeoutMs
      );
    child.stderr?.on('data', data);
    child.once('exit', exit);
    child.once('error', error);
  });
}

export async function launch({
  app,
  mods,
  state,
  stateDir,
  opts = {},
  persist = true,
  spawnImpl = spawn,
  transportFactory = wsTransport,
  log = console.log
}) {
  const plan = await buildPlan({ app, mods, state, opts });
  for (const s of plan.skipped) log(`  skipped: ${s}`);
  for (const n of plan.notes) log(`  note: ${n}`);
  for (const c of plan.conflicts) log(`  conflict(${c.severity}): ${c.detail} [${c.mods.join(', ')}]`);
  if (plan.drift.verdict === 'drift')
    log(`  drift: pinned ${plan.drift.pinnedVersion} -> current ${plan.drift.currentVersion}`);
  if (plan.blocked && !opts.force) throw Error('launch blocked by drift/conflict policy (use --force to override)');
  if (opts.dryRun) return { plan, injected: [], exit: null };
  if (!app.executable) throw Error(`no executable found for ${app.appId}; specify --executable`);
  const sources = plan.enabled.map(mod => {
    const entry = resolveModEntry(mod.dir, mod.manifest.entry);
    if (statSync(entry).size > 1024 * 1024) throw Error(`mod entry exceeds 1 MiB: ${mod.id}`);
    const source = readFileSync(entry, 'utf8');
    new Script(wrapModSource(mod.id, source), { filename: entry });
    return { id: mod.id, source };
  });
  state.installOrder ??= [];
  state.disabled ??= {};
  for (const m of plan.enabled) if (!state.installOrder.includes(m.id)) recordInstall(state, m.id);
  const startedAt = Date.now(),
    child = spawnImpl(
      app.executable,
      sources.length ? ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] : [],
      { stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env } }
    );
  let ended = false;
  const exitPromise = new Promise(resolve => {
    child.once('exit', (code, signal) => {
      ended = true;
      resolve({ code, signal, uptimeMs: Date.now() - startedAt });
    });
    child.once('error', error => {
      ended = true;
      resolve({ error, code: null, signal: null, uptimeMs: Date.now() - startedAt });
    });
  });
  const injected = [];
  let transport, cdp, controller;
  // Keep consuming stderr for the entire child lifetime (including safe mode).
  const stderr = chunk => {
    if (opts.stderr !== false) process.stderr.write(chunk);
  };
  child.stderr?.on('data', stderr);
  try {
    if (sources.length) {
      const timeout = opts.attachTimeoutMs ?? 20_000,
        url = await waitForDevToolsUrl(child, timeout);
      transport = transportFactory(url);
      await deadline(
        Promise.race([
          transport.ready,
          exitPromise.then(() => {
            throw Error('app exited during debugger connection');
          })
        ]),
        timeout,
        'debugger connection'
      );
      cdp = new CdpClient(transport, { timeoutMs: opts.rpcTimeoutMs ?? 5000 });
      controller = await injectRenderers(cdp, sources, {
        intervalMs: opts.pollIntervalMs ?? 250,
        onInjected: (id, target) => {
          injected.push({ id, target });
          log(`  registered: ${id} [${target}]`);
        },
        onError: err => log(`  injection error: ${err.message}`)
      });
      if (controller.sessions.size === 0) {
        const target = await cdp.waitForTarget(t => t.type === 'page', { timeoutMs: timeout });
        if (!target) throw Error('no page target to attach to');
      }
    }
    const exit = await exitPromise;
    if (exit.error) throw exit.error;
    const ran = plan.enabled.filter(m => injected.some(i => i.id === m.id));
    const actions = recordExit(state, ran, {
      exitCode: exit.code,
      signal: exit.signal,
      uptimeMs: exit.uptimeMs,
      at: new Date().toISOString()
    });
    for (const a of actions) log(`  ${a.action}: ${a.detail}`);
    if (persist && stateDir) saveState(stateDir, state);
    return { plan, injected, exit, actions };
  } finally {
    // Never leave an orphan app after setup failure; kill only our own child.
    cdp?.close();
    if (!cdp) transport?.close();
    await controller?.stop();
    if (!ended) child.kill?.('SIGTERM');
    child.stderr?.off('data', stderr);
  }
}
