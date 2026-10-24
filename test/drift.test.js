import test from 'node:test';
import assert from 'node:assert/strict';
import { tempDir, writeAsar } from './helpers.js';
import { computeState, makePin, checkDrift, diffEntryCounts, countEntries } from '../src/drift.js';

const dir = tempDir();
const asar = writeAsar(dir, [
  { path: 'package.json', content: { name: 'fixture-app', version: '1.2.3' } },
  { path: 'dist/a.js', content: 'a' },
  { path: 'dist/b.js', content: 'b' }
]);

test('counts entries per top-level directory', () => {
  const counts = countEntries({
    files: {
      'package.json': { offset: '0', size: '1' },
      dist: { files: { a: { offset: '1', size: '1' }, b: { offset: '2', size: '1' } } }
    }
  });
  assert.deepEqual(counts, { '(root)': 1, dist: 2 });
});

test('diff of entry counts', () => {
  assert.deepEqual(diffEntryCounts({ dist: 2 }, { dist: 3 }), { dist: { pinned: 2, current: 3 } });
  assert.equal(diffEntryCounts({ dist: 2 }, { dist: 2 }), null);
});

test('pin matches itself', async () => {
  const state = await computeState({ appId: 'fixture-app', asarPath: asar });
  assert.equal(state.appVersion, '1.2.3');
  const pin = makePin(state, ['demo-hello']);
  assert.deepEqual(checkDrift(pin, state, 'refuse'), { verdict: 'match', action: 'continue', changed: null });
});

test('a changed asar is drift, and the policy decides the action', async () => {
  const before = await computeState({ appId: 'fixture-app', asarPath: asar });
  const pin = makePin(before, ['demo-hello']);

  const asar2 = writeAsar(dir, [
    { path: 'package.json', content: { name: 'fixture-app', version: '1.3.0' } },
    { path: 'dist/a.js', content: 'a' },
    { path: 'dist/b.js', content: 'b' },
    { path: 'dist/c.js', content: 'c' }
  ]);
  const after = await computeState({ appId: 'fixture-app', asarPath: asar2 });

  const refused = checkDrift(pin, after, 'refuse');
  assert.equal(refused.verdict, 'drift');
  assert.equal(refused.action, 'refuse');
  assert.deepEqual(refused.changed, { dist: { pinned: 2, current: 3 } });
  assert.equal(checkDrift(pin, after, 'warn').action, 'warn');
  assert.equal(checkDrift(pin, after, 'continue').action, 'continue');
  assert.equal(checkDrift(null, after, 'refuse').verdict, 'unpinned');
});
