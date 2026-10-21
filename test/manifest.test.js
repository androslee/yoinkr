import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, satisfies, matchesTarget, detectConflicts } from '../src/manifest.js';

const base = {
  schema: 1, id: 'a', name: 'A', version: '0.1.0', entry: 'entry.js',
  targets: [{ app: 'fixture-app', versions: '^1.2.0', tested: ['1.2.3'] }],
  touches: { dom: ['#x'] },
  provenance: { source: 'test' },
};

test('accepts a well-formed manifest', () => {
  const res = validateManifest(structuredClone(base));
  assert.equal(res.ok, true, res.errors.join('; '));
  assert.equal(res.warnings.length, 0);
});

test('reports missing required fields', () => {
  const bad = structuredClone(base);
  delete bad.id;
  delete bad.entry;
  bad.targets = [];
  const res = validateManifest(bad);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('.id')));
  assert.ok(res.errors.some((e) => e.includes('.entry')));
  assert.ok(res.errors.some((e) => e.includes('.targets')));
});

test('warns on untested targets and missing provenance', () => {
  const m = structuredClone(base);
  m.targets[0].tested = [];
  delete m.provenance;
  const res = validateManifest(m);
  assert.equal(res.ok, true);
  assert.equal(res.warnings.length, 2);
});

test('version ranges', () => {
  assert.equal(satisfies('1.2.3', '*'), true);
  assert.equal(satisfies('1.2.3', '>=1.0.0'), true);
  assert.equal(satisfies('0.9.9', '>=1.0.0'), false);
  assert.equal(satisfies('1.9.0', '^1.2.0'), true);
  assert.equal(satisfies('2.0.0', '^1.2.0'), false);
  assert.equal(satisfies('1.2.3', '1.2.3'), true);
});

test('a tested version matches even when the range would not', () => {
  const m = { ...base, targets: [{ app: 'fixture-app', versions: '^2.0.0', tested: ['1.2.3'] }] };
  assert.equal(matchesTarget(m, 'fixture-app', '1.2.3'), true);
  assert.equal(matchesTarget(m, 'other-app', '1.2.3'), false);
  assert.equal(matchesTarget({ ...base, targets: [{ app: '*', versions: '*' }] }, 'anything', '9.9.9'), true);
});

test('conflict detection: overlap warns, declarations and exclusivity error', () => {
  const a = structuredClone(base);
  const b = { ...structuredClone(base), id: 'b', touches: { dom: ['#x'] } };
  let conflicts = detectConflicts([a, b]);
  assert.deepEqual(conflicts.map((c) => c.kind).sort(), ['touch_overlap']);

  b.conflicts_with = ['a'];
  conflicts = detectConflicts([a, b]);
  assert.ok(conflicts.some((c) => c.kind === 'declared' && c.severity === 'error'));

  const c = { ...structuredClone(base), id: 'c', touches: {}, exclusive: true };
  conflicts = detectConflicts([a, c]);
  assert.ok(conflicts.some((c2) => c2.kind === 'exclusive' && c2.severity === 'error'));

  assert.deepEqual(detectConflicts([a]), []);
});
