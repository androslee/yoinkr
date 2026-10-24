import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateSharedSuite,
  normalizeFeatureObservation,
  checkObservation,
  differences,
  percentile,
  evaluateLifecycle,
  replaySharedFeatureSuite,
  compareFeatureRuns
} from '../src/feature-verify.js';
const suite = JSON.parse(await readFile(new URL('../recipes/mqtt-shared-acceptance/suite.json', import.meta.url))),
  policy = suite.performance;
const block = text => ({
  font: 'monospace',
  fontSize: '12px',
  lineHeight: 'normal',
  lines: [{ text, kind: 'unchanged', background: 'rgba(0, 0, 0, 0)', height: 16, tokens: [] }],
  counts: null
});
const raw = () => ({
  schema: 1,
  mode: 'raw',
  blocks: [block('new')],
  history: [{ value: 'new' }, { value: 'old' }],
  controls: [
    { visible: true, width: 40, height: 36 },
    { visible: true, width: 40, height: 36 }
  ],
  selectionIncludesCurrent: true,
  selection: 'new',
  clipboard: 'new'
});
const metrics = () => ({
  toolWindows: 0,
  ipcListeners: 10,
  appListeners: 20,
  timeouts: 1,
  heapUsed: 20 * 1024 * 1024,
  processCount: 4,
  forcedGc: true
});
test('strict common scenario schema rejects code, duplicate points, missing coverage and oversized UTF8 inputs', () => {
  assert.equal(validateSharedSuite(suite).scenarios.length, 9);
  const add = structuredClone(suite);
  add.scenarios[0].steps.push({ action: 'execute', code: '0' });
  assert.throws(() => validateSharedSuite(add));
  const duplicate = structuredClone(suite);
  duplicate.scenarios[0].steps.push(duplicate.scenarios[0].steps[1]);
  assert.throws(() => validateSharedSuite(duplicate), /Duplicate/);
  const coverage = structuredClone(suite);
  coverage.coverage.push(coverage.coverage[0]);
  assert.throws(() => validateSharedSuite(coverage), /Duplicate/);
  const huge = structuredClone(suite);
  huge.scenarios[0].steps = [{ action: 'input', topic: 'a', messages: ['雪'.repeat(50000)] }];
  assert.throws(() => validateSharedSuite(huge), /128 KiB/);
});
test('normalization excludes host metadata without hiding value, style or history ordering', () => {
  const a = raw(),
    b = raw();
  a.url = 'donor';
  b.url = 'recipient';
  a.history[0].title = 'timestamp';
  b.history[0].title = 'Message 2';
  assert.deepEqual(normalizeFeatureObservation(a), normalizeFeatureObservation(b));
  b.history.reverse();
  assert.ok(
    differences(normalizeFeatureObservation(a), normalizeFeatureObservation(b)).some(d => d.path.startsWith('history'))
  );
  b.blocks[0].fontSize = '13px';
  assert.ok(
    differences(normalizeFeatureObservation(a), normalizeFeatureObservation(b)).some(d => d.path.includes('fontSize'))
  );
});
test('empty container adaptation never removes nonempty broken content', () => {
  const a = raw();
  a.blocks = [block('')];
  assert.equal(normalizeFeatureObservation(a, { empty: true }).view, 'empty');
  a.blocks = [block('BROKEN')];
  assert.equal(normalizeFeatureObservation(a, { empty: true }).view, 'value');
  assert.ok(checkObservation(a, { messages: [], mode: 'raw' }, { empty: true }).length);
});
test('independent assertions reject stale current values, wrong counts, missing CSS and wrong clipboard', () => {
  const state = { messages: ['old', 'new'], mode: 'raw' };
  assert.deepEqual(checkObservation(raw(), state, {}), []);
  const a = raw();
  a.blocks[0].lines[0].text = 'old';
  assert.ok(checkObservation(a, state, {}).some(f => f.includes('Current rendered')));
  a.blocks[0].fontSize = '13px';
  assert.ok(checkObservation(a, state, {}).some(f => f.includes('styles')));
  a.clipboard = 'bad';
  assert.ok(checkObservation(a, state, { clipboard: true }).some(f => f.includes('Clipboard')));
  assert.ok(
    checkObservation(raw(), state, { counts: { added: 9, removed: 3, against: 'previous' } }).some(f =>
      f.includes('counts')
    )
  );
});
test('history assertion detects the real oldest-first transfer defect', () => {
  const a = raw();
  a.history.reverse();
  assert.ok(checkObservation(a, { messages: ['old', 'new'], mode: 'raw' }, {}).some(f => f.includes('newest-first')));
});
test('CPU percentile inputs cannot silently accept failed or NaN measurements', () => {
  assert.equal(percentile([4, 1, 2, 3]), 4);
  for (const v of [[], [NaN], [Infinity], [-1]]) assert.throws(() => percentile(v), /samples/);
});
test('lifecycle gates detect subscription, timer, window, process and retained-heap growth', () => {
  const before = metrics();
  assert.equal(evaluateLifecycle(before, metrics(), policy).passed, true);
  for (const change of [
    { ipcListeners: 11 },
    { appListeners: 21 },
    { timeouts: 2 },
    { toolWindows: 1 },
    { processCount: 7 },
    { heapUsed: 50 * 1024 * 1024 },
    { forcedGc: false }
  ])
    assert.equal(evaluateLifecycle(before, { ...metrics(), ...change }, policy).passed, false);
  assert.throws(() => evaluateLifecycle(before, { ...metrics(), heapUsed: NaN }, policy), /Invalid/);
});
async function runFixture(t, { broken = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mk-shared-verify-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const small = {
    ...suite,
    coverage: [{ baseline: 'json-previous', shared: 'json-previous' }],
    scenarios: [
      {
        id: 'json-previous',
        steps: [
          { action: 'input', topic: 'sample', messages: ['old', 'new'] },
          { action: 'mode', value: 'raw' },
          { action: 'observe', id: 'current' }
        ]
      }
    ]
  };
  const driver = {
    identity: { id: 'test-driver-v1', version: 1 },
    input: async () => {},
    mode: async () => {},
    showHistory: async () => {},
    observe: async () => {
      const v = raw();
      if (broken) v.blocks[0].lines[0].text = 'BROKEN';
      return v;
    }
  };
  const run = await replaySharedFeatureSuite(driver, small, join(root, 'run'));
  return { root, run };
}
test('failed assertions remain a failed driver run even when execution finishes successfully', async t => {
  const x = await runFixture(t, { broken: true });
  assert.equal(x.run.status, 'failed');
  assert.ok(x.run.files.some(f => f.path === 'current.raw.json'));
  const comparison = await compareFeatureRuns(x.run.directory, x.run.directory);
  assert.equal(comparison.status, 'failed');
  assert.equal(comparison.differences.length, 0);
});
test('comparison requires same scenario identity and hash checked raw/normalized artifacts', async t => {
  const a = await runFixture(t),
    b = await runFixture(t);
  assert.equal((await compareFeatureRuns(a.run.directory, b.run.directory)).status, 'passed');
  await writeFile(join(b.run.directory, 'current.normalized.json'), '{}');
  await assert.rejects(compareFeatureRuns(a.run.directory, b.run.directory), /artifact changed/);
});
