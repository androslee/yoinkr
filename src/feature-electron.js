import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { inspectFeatureSession, replayFeatureSession } from './feature-session.js';
import { containedFile, sha256, saveJson, writeState } from './workspace.js';
import { runRea } from './rea.js';

export async function verifyFeatureDonor(root) {
  const bytes = await readFile(await containedFile(root, 'MODKIT-DONOR-BUILD.json')),
    build = JSON.parse(bytes);
  let total = 0;
  for (const file of [...build.sources, ...build.outputs]) {
    const path = await containedFile(root, file.path),
      s = await stat(path);
    total += s.size;
    if (total > 768 * 1024 * 1024) throw Error('donor snapshot exceeds read limit');
    if (s.size !== file.bytes || sha256(await readFile(path)) !== file.sha256)
      throw Error('donor input changed before launch: ' + file.path);
  }
  const executable = await containedFile(root, build.runtime.relativeExecutable);
  if (sha256(await readFile(executable)) !== build.runtime.sha256) throw Error('Electron runtime changed');
  return { build, executable, sha256: sha256(bytes) };
}
export async function runOriginalFeatureBaseline(
  sessionPath,
  {
    playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright',
    publish,
    variables = {},
    display = process.env.DISPLAY,
    signal,
    observe = true
  } = {}
) {
  const session = await inspectFeatureSession(sessionPath),
    { root, record, recipe } = session;
  if (record.status !== 'prepared') throw Error('prepare a fresh feature session before launching');
  const verified = await verifyFeatureDonor(record.donorRoot);
  if (verified.sha256 !== record.buildSha256) throw Error('donor build binding changed');
  let port;
  const { _electron } = await import(playwrightModule),
    profile = join(root, 'profile'),
    logs = [],
    pageErrors = [],
    consoleErrors = [];
  let app, replayResult, error, cdp;
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_RUNTIME_DIR']
      .filter(k => process.env[k] !== undefined)
      .map(k => [k, process.env[k]])
  );
  if (display) env.DISPLAY = display;
  const started = performance.now(),
    close = async () => {
      if (!app) return;
      const process = app.process();
      await Promise.race([app.close().catch(() => {}), new Promise(r => setTimeout(r, 5000).unref())]);
      if (process.exitCode === null) {
        process.kill('SIGTERM');
        await new Promise(r => {
          if (process.exitCode !== null) return r();
          const timer = setTimeout(() => {
            process.kill('SIGKILL');
            r();
          }, 1000);
          process.once('exit', () => {
            clearTimeout(timer);
            r();
          });
        });
      }
    };
  const cancel = () => {
    close().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const capture = async name => {
    const listed = await runRea(
      ['list-electron-targets', 'http://127.0.0.1:' + port],
      join(root, name + '-targets.json'),
      { maxBytes: 8 * 1024 * 1024, timeoutMs: 30000 }
    );
    const entries = listed.normalized_result?.targets ?? listed.normalized_result?.pages ?? [];
    const target = entries.find(x => (x.url ?? x.file_path ?? x.file_url ?? '').endsWith(recipe.donor.pageSuffix));
    if (!target) throw Error('owned donor target missing from REA target inventory');
    const evidence = await runRea(
      ['inspect-electron-page', 'http://127.0.0.1:' + port, target.target_id ?? target.id, '--observation-ms', '100'],
      join(root, name + '-runtime.json'),
      { maxBytes: 16 * 1024 * 1024, timeoutMs: 30000 }
    );
    await saveJson(join(root, name + '-RUNTIME.json'), {
      schema: 1,
      sessionId: record.id,
      parentCaseSha256: record.parentCaseSha256,
      buildSha256: record.buildSha256,
      evidenceId: evidence.evidence_id,
      evidenceSha256: sha256(await readFile(join(root, name + '-runtime.json'))),
      scope:
        'Passive REA DOM/script inventory around declared actions. Correlation only; no handler/execution causality or static/runtime module identity is inferred.'
    });
  };
  let pid;
  try {
    signal?.throwIfAborted();
    app = await _electron.launch({
      executablePath: verified.executable,
      args: [
        record.donorRoot,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--user-data-dir=' + profile,
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=0'
      ],
      cwd: record.donorRoot,
      env,
      timeout: 30000
    });
    pid = app.process().pid;
    signal?.throwIfAborted();
    const log = b => {
      logs.push(b.toString());
      while (logs.join('').length > 1000000) logs.shift();
    };
    app.process().stdout?.on('data', log);
    app.process().stderr?.on('data', log);
    const page = await app.firstWindow({ timeout: 15000 });
    page.setDefaultTimeout(recipe.stepTimeoutMs);
    page.on('pageerror', e => {
      if (pageErrors.length < 32) pageErrors.push(e.message.slice(0, 2000));
    });
    page.on('console', m => {
      if (m.type() === 'error' && consoleErrors.length < 32) consoleErrors.push(m.text().slice(0, 2000));
    });
    await page.waitForURL('**' + recipe.donor.pageSuffix, { timeout: 15000 });
    await page.locator('body').waitFor();
    const readyMs = Math.round(performance.now() - started);
    if (observe) {
      const endpoint = await readFile(await containedFile(root, 'profile/DevToolsActivePort'), 'utf8');
      port = Number(endpoint.split('\n')[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('owned app debugging port unavailable');
      await capture('before');
    }
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const beforeMetrics = await cdp.send('Performance.getMetrics');
    replayResult = await replayFeatureSession(root, {
      page,
      publish,
      readClipboard: () => app.evaluate(({ clipboard }) => clipboard.readText()),
      variables,
      signal
    });
    const afterMetrics = await cdp.send('Performance.getMetrics');
    if (observe && !signal?.aborted) await capture('after');
    await saveJson(join(root, 'PERFORMANCE.json'), {
      schema: 1,
      readyMs,
      before: beforeMetrics.metrics,
      after: afterMetrics.metrics,
      actionDurationsMs: JSON.parse(await readFile(join(root, 'OBSERVATIONS.json'))).actions.map(a => ({
        scenarioId: a.scenarioId,
        index: a.index,
        durationMs: a.durationMs
      })),
      scope:
        'Single original-app development-build baseline. Not a p95 benchmark, leak test or recipient performance result.'
    });
    if (pageErrors.length) throw Error('original donor page raised runtime errors; inspect CONSOLE.json');
    if (!replayResult.passed) throw Error('original donor scenario failed; inspect OBSERVATIONS.json');
  } catch (e) {
    error = e;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await cdp?.detach().catch(() => {});
    await close();
    let running = false;
    if (pid)
      try {
        process.kill(pid, 0);
        running = true;
      } catch {}
    const cleanup = {
      schema: 1,
      pid: pid ?? null,
      applicationExited: !running,
      signalAborted: signal?.aborted ?? false,
      profile,
      ownedTarget: 'original donor only'
    };
    await saveJson(join(root, 'CLEANUP.json'), cleanup);
    await writeFile(join(root, 'application.log'), logs.join(''), { flag: 'wx', mode: 0o600 });
    await saveJson(join(root, 'CONSOLE.json'), {
      pageErrors,
      consoleErrors,
      scope:
        'Original donor warnings retained; console warnings are not suppressed or reclassified as transferred-feature failures.'
    });
    const latest = JSON.parse(await readFile(join(root, 'SESSION.json')));
    latest.cleanup = cleanup;
    latest.status = signal?.aborted ? 'cancelled' : error || running ? 'failed' : 'captured';
    latest.passed = !error && !running && !signal?.aborted;
    latest.finishedAt = new Date().toISOString();
    if (error) latest.error = error.message;
    await writeState(join(root, 'SESSION.json'), latest);
  }
  if (error) throw error;
  return inspectFeatureSession(root);
}
