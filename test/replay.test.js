import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { validateReplay } from '../src/replay-input.js';
import { verifyWorkspace, workspaceStatus } from '../src/verify.js';
import { readReplayRuns } from '../src/replay.js';
import { readExamples } from '../src/examples.js';
import { replayFixture } from './replay-fixture.js';
import { tempDir } from './helpers.js';
test('replay inputs require finite bounded JSON and exactly one explicit expected value or exception', () => {
  for (const input of [
    { args: [], expected: null },
    { args: [0, false], expected: false },
    { args: [-1], expectedError: { name: 'RangeError', message: 'negative' } }
  ])
    assert.equal(validateReplay(input), input);
  const deep = Array.from({ length: 20 }).reduce(v => [v], 0);
  for (const value of [
    { args: [] },
    { args: [], expected: 1, expectedError: {} },
    { args: 'bad', expected: 1 },
    { args: [Infinity], expected: 1 },
    { args: [() => 1], expected: 1 },
    { args: [deep], expected: 1 },
    { args: [], expectedError: null },
    { args: [], expectedError: { name: 4, message: 'x' } },
    { args: [], expected: undefined },
    { args: [], expected: 'x'.repeat(16001) },
    { args: [], expected: 1, exec: 'sh' }
  ])
    assert.throws(() => validateReplay(value));
});
test('selected examples replay values and declared exceptions with retained case/hash bindings', async () => {
  const f = await replayFixture(),
    a = await f.make({ args: [0], expected: '0%' }, 'Zero'),
    b = await f.make({ args: [-1], expectedError: { name: 'RangeError', message: 'negative' } }, 'Negative');
  const before = await readFile(join(f.casePath, 'case.json'), 'utf8');
  const r = await verifyWorkspace(f.workspace, { exampleIds: [a.id, b.id] });
  assert.equal(r.passed, true);
  assert.equal(r.selection, 'examples');
  assert.equal(r.cases.length, 2);
  assert.equal(
    r.exampleBindings[0].exampleSha256,
    (await readExamples(f.casePath)).items.find(e => e.id === a.id).provenance.exampleSha256
  );
  assert.equal((await workspaceStatus(f.workspace)).acceptance.status, 'passed-selected-examples');
  assert.equal(await readFile(join(f.casePath, 'case.json'), 'utf8'), before);
  assert.equal((await readExamples(f.casePath)).items[0].outcome, 'planned');
  const retained = await readReplayRuns(f.casePath);
  assert.equal(retained.items[0].passed, true);
  assert.equal(retained.warnings.length, 0);
});
test('different recipient output and matching-but-wrong expected values cannot pass', async () => {
  const f = await replayFixture(),
    e = await f.make({ args: [20], expected: '20%' });
  const good = await verifyWorkspace(f.workspace, { exampleIds: [e.id] });
  assert.equal(good.passed, true);
  await writeFile(join(f.workspace, 'app/host.js'), 'export function display(){return "wrong";}');
  const bad = await verifyWorkspace(f.workspace, { exampleIds: [e.id] });
  assert.equal(bad.passed, false);
  assert.notDeepEqual(bad.cases[0].donor, bad.cases[0].recipient);
  assert.equal((await readReplayRuns(f.casePath)).items.length, 2);
  const b = await replayFixture(),
    wrong = await b.make({ args: [20], expected: 'wrong' });
  const equal = await verifyWorkspace(b.workspace, { exampleIds: [wrong.id] });
  assert.deepEqual(equal.cases[0].donor, equal.cases[0].recipient);
  assert.equal(equal.passed, false);
});
test('missing, prose-only, duplicate, changed or wrong-case examples are rejected before modules run', async () => {
  const f = await replayFixture(),
    manual = await f.make(undefined),
    e = await f.make({ args: [1], expected: '1%' });
  for (const ids of [[], ['missing'], [manual.id], [e.id, e.id], ['../outside']])
    await assert.rejects(verifyWorkspace(f.workspace, { exampleIds: ids }));
  await writeFile(join(e.directory, 'example.json'), '{}');
  await assert.rejects(verifyWorkspace(f.workspace, { exampleIds: [e.id] }), /missing or invalid/);
  const metadata = join(f.workspace, '.modkit/workspace.json'),
    w = await workspaceStatus(f.workspace);
  await writeFile(metadata, JSON.stringify({ ...w, caseId: 'another' }));
  await assert.rejects(verifyWorkspace(f.workspace, { exampleIds: [manual.id] }), /different case/);
  await assert.rejects(stat(join(f.workspace, '.modkit/runs')), /ENOENT/);
});
test('corrupted saved run bytes become report warnings, and escaped run outputs are refused', async () => {
  const f = await replayFixture(),
    e = await f.make({ args: [1], expected: '1%' }),
    r = await verifyWorkspace(f.workspace, { exampleIds: [e.id] });
  await writeFile(join(f.casePath, 'checks', r.id, 'verification.json'), '{}');
  const checked = await readReplayRuns(f.casePath);
  assert.equal(checked.items.length, 0);
  assert.equal(checked.warnings.length, 1);
  const b = await replayFixture(),
    test = await b.make({ args: [2], expected: '2%' }),
    outside = tempDir();
  await symlink(outside, join(b.casePath, 'checks'));
  await assert.rejects(verifyWorkspace(b.workspace, { exampleIds: [test.id] }), /escaped/);
  await assert.rejects(readReplayRuns(b.casePath), /escaped/);
});
test('a hung recipient remains a bounded failed example and retains worker diagnostics', async () => {
  const f = await replayFixture(),
    e = await f.make({ args: [1], expected: '1%' });
  await writeFile(join(f.workspace, 'app/host.js'), 'export function display(){while(true){}}');
  const report = await verifyWorkspace(f.workspace, { exampleIds: [e.id], timeoutMs: 150 });
  assert.equal(report.passed, false);
  assert.match(report.workers[1].failure, /timed out/);
  assert.equal((await readReplayRuns(f.casePath)).items[0].passed, false);
});
test('verification output directories cannot redirect writes outside the registered workspace', async () => {
  const f = await replayFixture(),
    e = await f.make({ args: [1], expected: '1%' }),
    outside = tempDir();
  await symlink(outside, join(f.workspace, '.modkit/runs'));
  await assert.rejects(verifyWorkspace(f.workspace, { exampleIds: [e.id] }), /escaped workspace/);
});
