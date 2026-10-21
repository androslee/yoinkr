import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, writeAsar, mockTransport } from './helpers.js';
import { loadManifest } from '../src/manifest.js';
import { buildPlan, launch } from '../src/launcher.js';

const appDir = tempDir('app-');
const asarPath = writeAsar(appDir, [{ path: 'package.json', content: { name: 'fixture-app', version: '1.2.3' } }]);
const app = { appId: 'fixture-app', installDir: appDir, asarPath, unpackedDir: null, version: '1.2.3', executable: '/bin/true' };

function makeMod(id, targets, touches = {}) {
  const dir = tempDir('mod-');
  writeFileSync(join(dir, 'mod.json'), JSON.stringify({ schema: 1, id, name: id, version: '0.1.0', entry: 'entry.js', targets, touches, provenance: { source: 'test' } }));
  writeFileSync(join(dir, 'entry.js'), `window.__m = ${JSON.stringify(id)};`);
  return { dir, manifest: loadManifest(dir).manifest };
}

const modA = makeMod('a', [{ app: 'fixture-app', versions: '*', tested: ['1.2.3'] }], { dom: ['#a'] });
const modB = makeMod('b', [{ app: 'other-app', versions: '*' }]);
const modC = makeMod('c', [{ app: '*', versions: '*' }], { dom: ['#a'] });

const quiet = () => {};

test('plan: skips mods that do not target this app, warns on overlap', async () => {
  const plan = await buildPlan({ app, mods: [modA, modB, modC], state: { disabled: {} }, opts: {} });
  assert.deepEqual(plan.enabled.map((m) => m.id), ['a', 'c']);
  assert.deepEqual(plan.skipped, ['b: not targeting fixture-app@1.2.3']);
  assert.deepEqual(plan.conflicts.map((c) => [c.kind, c.mods]), [['touch_overlap', ['a', 'c']]]);
  assert.equal(plan.blocked, false);
});

test('plan: a declared conflict blocks the launch', async () => {
  const modD = makeMod('d', [{ app: '*', versions: '*' }]);
  modD.manifest.conflicts_with = ['a'];
  const plan = await buildPlan({ app, mods: [modA, modD], state: { disabled: {} }, opts: {} });
  assert.equal(plan.blocked, true);
  await assert.rejects(launch({ app, mods: [modA, modD], state: { disabled: {} }, stateDir: tempDir(), opts: {}, log: quiet }), /blocked/);
});

test('plan: drift against a pin blocks unless the policy allows it', async () => {
  const pin = { schema: 1, pinnedAt: 'x', mods: ['a'], appVersion: '1.2.3', asarSha256: 'f'.repeat(64), entries: {} };
  assert.equal((await buildPlan({ app, mods: [modA], state: { disabled: {} }, opts: { pin } })).blocked, true);
  assert.equal((await buildPlan({ app, mods: [modA], state: { disabled: {} }, opts: { pin, onDrift: 'warn' } })).blocked, false);
});

function fakeSpawn(exitCode = 0) {
  return () => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.stderr.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')));
    setTimeout(() => child.emit('exit', exitCode, null), 40);
    return child;
  };
}

const transportFactory = (urls) => (url) => {
  urls.push(url);
  return mockTransport((req) => {
    if (req.method === 'Target.getTargets') return { result: { targetInfos: [{ targetId: 'T1', type: 'page', url: 'file:///a' }] } };
    if (req.method === 'Target.attachToTarget') return { result: { sessionId: 'S1' } };
    if (req.method === 'Page.addScriptToEvaluateOnNewDocument') return { result: { identifier: 'I1' } };
    if(req.method==='Page.enable')return{result:{}};
    if(req.method==='Runtime.evaluate')return{result:{result:{value:true}}};
    return null;
  });
};

test('launch: injects the enabled mod over CDP and records a clean exit', async () => {
  const urls = [];
  const stateDir = tempDir();
  const out = await launch({ app, mods: [modA], state: { disabled: {} }, stateDir, opts: {}, spawnImpl: fakeSpawn(0), transportFactory: transportFactory(urls), log: quiet });
  assert.deepEqual(urls, ['ws://127.0.0.1:9222/devtools/browser/abc']);
  assert.equal(out.injected.length, 1);
  assert.equal(out.exit.code, 0);
  const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8'));
  assert.equal(state.lastLaunch.abnormal, false);
});

test('launch: two early crashes disable the most recently added mod', async () => {
  const factory = transportFactory([]);
  const stateDir = tempDir();
  const state = { disabled: {} };
  await launch({ app, mods: [modA, modC], state, stateDir, opts: {}, spawnImpl: fakeSpawn(1), transportFactory: factory, log: quiet });
  assert.deepEqual(Object.keys(state.disabled), []);
  await launch({ app, mods: [modA, modC], state, stateDir, opts: {}, spawnImpl: fakeSpawn(1), transportFactory: factory, log: quiet });
  assert.deepEqual(Object.keys(state.disabled), ['c']);
  const plan = await buildPlan({ app, mods: [modA, modC], state, opts: {} });
  assert.deepEqual(plan.enabled.map((m) => m.id), ['a']);
  const persisted = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8'));
  assert.deepEqual(Object.keys(persisted.disabled), ['c'], 'the decision must survive the process');
});
