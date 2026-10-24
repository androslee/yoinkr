import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFileSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tempDir, writeAsar, mockTransport } from './helpers.js';
import { CdpClient, wrapModSource, injectRenderers } from '../src/cdp.js';
import { validateManifest, satisfies, resolveModEntry } from '../src/manifest.js';
import { buildPlan, launch, waitForDevToolsUrl } from '../src/launcher.js';
import { emptyState, recordExit, planLaunch, loadState, saveState } from '../src/safemode.js';
import { readHeader, readEntryBuffer } from '../src/asar.js';
import { inspectInstall } from '../src/detect.js';
import { compareApps, inspectApp } from '../src/inspect.js';
import vm from 'node:vm';
const base = {
  schema: 1,
  id: 'review',
  name: 'Review',
  version: '0.1.0',
  entry: 'entry.js',
  targets: [{ app: '*', versions: '*' }],
  provenance: { source: 'test' }
};
const mod = () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'entry.js'), 'window.review=true;');
  return { dir, manifest: structuredClone(base) };
};
const app = { appId: 'fixture', version: '1.2.3', executable: '/fixture' };

test('manifest rejects malformed shapes, escaping entries and unsupported ranges', () => {
  for (const raw of [
    null,
    [],
    { ...base, targets: [null] },
    { ...base, entry: '../outside.js' },
    { ...base, entry: '/outside.js' },
    { ...base, entry: 'C:\\outside.js' },
    { ...base, conflicts_with: 'other' },
    { ...base, exclusive: 'false' },
    { ...base, targets: [{ app: 'x', versions: '~1.2.3' }] }
  ])
    assert.equal(validateManifest(raw).ok, false, JSON.stringify(raw));
});
test('zero-major caret ranges stop at their actual compatible boundary', () => {
  assert.equal(satisfies('0.3.0', '^0.2.1'), false);
  assert.equal(satisfies('0.2.9', '^0.2.1'), true);
  assert.equal(satisfies('0.0.2', '^0.0.1'), false);
  assert.equal(satisfies('garbage', '>=0.0.0'), false);
});
test('entry realpath containment rejects a symlink outside the mod', () => {
  const dir = tempDir(),
    outside = join(tempDir(), 'outside.js');
  writeFileSync(outside, 'x');
  symlinkSync(outside, join(dir, 'entry.js'));
  assert.throws(() => resolveModEntry(dir, 'entry.js'), /escapes/);
});
test('disabled conflicting mods do not block normal or safe-mode plans; duplicates do', async () => {
  const a = mod(),
    b = mod();
  b.manifest.id = 'other';
  b.manifest.conflicts_with = ['review'];
  const state = { disabled: { other: { reason: 'manual' } }, installOrder: [] };
  assert.equal((await buildPlan({ app, mods: [a, b], state })).blocked, false);
  assert.equal(
    (await buildPlan({ app, mods: [a, b], state: { disabled: {} }, opts: { safeMode: true } })).blocked,
    false
  );
  await assert.rejects(buildPlan({ app, mods: [a, a], state }), /duplicate/);
});
test('install order survives discovery reordering; late crashes break an early-crash streak', () => {
  const s = emptyState('fixture');
  s.installOrder = ['old', 'new'];
  assert.deepEqual(
    planLaunch(s, [{ id: 'new' }, { id: 'old' }]).enabled.map(x => x.id),
    ['old', 'new']
  );
  recordExit(s, [{ id: 'old' }, { id: 'new' }], { exitCode: 1, uptimeMs: 1 });
  recordExit(s, [], { exitCode: 1, uptimeMs: 30000 });
  recordExit(s, [{ id: 'old' }, { id: 'new' }], { exitCode: 1, uptimeMs: 1 });
  assert.deepEqual(s.disabled, {});
  const dir = join(tempDir(), 'nested');
  saveState(dir, s);
  assert.equal(loadState(dir, 'fixture').consecutiveCrashes, 1);
});
test('CDP timeouts, send failures and disconnects reject and clear pending calls', async () => {
  const t = mockTransport(() => null),
    c = new CdpClient(t, { timeoutMs: 10 });
  await assert.rejects(c.call('missing'), /timed out/);
  assert.equal(c.pending.size, 0);
  t.send = () => {
    throw Error('send failure');
  };
  await assert.rejects(c.call('broken'), /send failure/);
  assert.equal(c.pending.size, 0);
  t.send = () => {};
  const pending = c.call('later');
  t.close();
  await assert.rejects(pending, /closed/);
  await assert.rejects(c.call('after'), /closed/);
});
test('wrapped code is idempotent and reports failures without contaminating another mod', () => {
  const context = { window: {}, console: { error() {} } };
  vm.createContext(context);
  const source = wrapModSource('quoted"id', 'window.count=(window.count||0)+1;');
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  assert.equal(context.window.count, 1);
  vm.runInContext(wrapModSource('bad', "throw Error('boom')"), context);
  assert.match(context.window.__modkitErrors.bad, /boom/);
  vm.runInContext(wrapModSource('good', 'window.good=true'), context);
  assert.equal(context.window.good, true);
});
test('endpoint discovery accepts split stderr chunks and handles spawn failure', async () => {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  let p = waitForDevToolsUrl(child, 100);
  child.stderr.emit('data', 'DevTools list');
  child.stderr.emit('data', 'ening on ws://127.0.0.1:1234/devtools/browser/a\n');
  assert.match(await p, /1234/);
  assert.equal(child.listenerCount('exit'), 0);
  p = waitForDevToolsUrl(child, 100);
  child.emit('error', Error('ENOENT'));
  await assert.rejects(p, /ENOENT/);
});
test('safe mode starts without debug flags or a CDP connection', async () => {
  const result = await launch({
    app,
    mods: [mod()],
    state: emptyState('fixture'),
    persist: false,
    opts: { safeMode: true, stderr: false },
    log() {},
    spawnImpl: (_exe, args) => {
      assert.deepEqual(args, []);
      const c = new EventEmitter();
      c.stderr = new EventEmitter();
      setImmediate(() => c.emit('exit', 0, null));
      return c;
    },
    transportFactory() {
      throw Error('must not attach');
    }
  });
  assert.deepEqual(result.injected, []);
});
test('setup timeout stops only its spawned child and leaves no crash blame', async () => {
  let killed = false;
  const state = emptyState('fixture');
  await assert.rejects(
    launch({
      app,
      mods: [mod()],
      state,
      persist: false,
      opts: { attachTimeoutMs: 10, stderr: false },
      log() {},
      spawnImpl: () => {
        const c = new EventEmitter();
        c.stderr = new EventEmitter();
        c.kill = () => {
          killed = true;
        };
        return c;
      }
    }),
    /no DevTools/
  );
  assert.equal(killed, true);
  assert.deepEqual(state.disabled, {});
});
test('initial, reloaded and replacement window registration is targeted and bounded', async () => {
  let targets = [{ targetId: 'one', type: 'page', url: 'file:///fixture' }];
  const t = mockTransport(req => {
    if (req.method === 'Target.getTargets') return { result: { targetInfos: targets } };
    if (req.method === 'Target.attachToTarget') return { result: { sessionId: req.params.targetId } };
    if (req.method === 'Page.addScriptToEvaluateOnNewDocument') return { result: { identifier: req.sessionId } };
    return { result: { result: { value: true } } };
  });
  const c = new CdpClient(t),
    controller = await injectRenderers(c, [{ id: 'review', source: 'window.review=true' }], { intervalMs: 5 });
  assert.equal(t.sent.filter(x => x.method === 'Runtime.evaluate').length, 1);
  targets = [
    { targetId: 'two', type: 'page', url: 'file:///replacement' },
    { targetId: 'tools', type: 'page', url: 'devtools://ignored' }
  ];
  await new Promise(r => setTimeout(r, 25));
  assert.deepEqual([...controller.sessions.keys()], ['two']);
  assert.equal(t.sent.filter(x => x.method === 'Runtime.evaluate').length, 2);
  await controller.stop();
  c.close();
});
test('truncated archive data is rejected instead of returning zero-filled contents', () => {
  const dir = tempDir();
  const f = writeAsar(dir, [{ path: 'package.json', content: 'hello' }]);
  const data = readFileSync(f);
  writeFileSync(f, data.subarray(0, data.length - 1));
  assert.throws(() => readEntryBuffer(f, 'package.json'), /bounds/);
  writeFileSync(f, Buffer.alloc(3));
  assert.throws(() => readHeader(f), /truncated/);
});
test('inspection and comparison return evidence and unknowns without launching either app', () => {
  const fixture = (name, deps) => {
    const root = tempDir();
    mkdirSync(join(root, 'resources'));
    writeAsar(join(root, 'resources'), [
      { path: 'package.json', content: { name, version: '1.2.3', dependencies: deps } }
    ]);
    return inspectInstall(root);
  };
  const a = fixture('a', { react: '18.0.0', alpha: '1' }),
    b = fixture('b', { react: '19.0.0' });
  const d = inspectApp(a),
    comparison = compareApps(a, b);
  assert.equal(d.evidence.packaging, 'asar');
  assert.ok(d.unknowns.length);
  assert.deepEqual(comparison.sharedDeclaredDependencies, [
    { name: 'react', source: '18.0.0', target: '19.0.0', sameDeclaration: false }
  ]);
  assert.equal(comparison.verdict, 'needs-feature-analysis');
  const output = JSON.parse(
    execFileSync(process.execPath, ['src/cli.js', 'inspect', 'test-app', '--app-dir', a.installDir, '--json'], {
      encoding: 'utf8'
    })
  );
  assert.equal(output.app.id, 'test-app');
});

test('an unmodded safe-mode crash cannot carry blame into a later modded run', () => {
  const s = emptyState('fixture');
  s.consecutiveCrashes = 1;
  recordExit(s, [], { exitCode: 1, uptimeMs: 1 });
  assert.equal(s.consecutiveCrashes, 0);
  assert.deepEqual(s.disabled, {});
  recordExit(s, [{ id: 'review' }], { exitCode: 1, uptimeMs: 1 });
  assert.deepEqual(s.disabled, {});
});
test('macOS Resources and hyphenated executable layouts are detected in fixtures', () => {
  const dir = join(tempDir(), 'Test-App.app');
  mkdirSync(join(dir, 'Contents', 'Resources'), { recursive: true });
  mkdirSync(join(dir, 'Contents', 'MacOS'));
  writeAsar(join(dir, 'Contents', 'Resources'), [
    { path: 'package.json', content: { name: 'Test-App', version: '1.2.3' } }
  ]);
  const executable = join(dir, 'Contents', 'MacOS', 'Test-App');
  writeFileSync(executable, 'fixture', { mode: 0o755 });
  const found = inspectInstall(dir);
  assert.equal(found.appId, 'Test-App');
  assert.equal(found.executable, executable);
  assert.equal(found.version, '1.2.3');
});
