import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkg from '../src/component-package.cjs';
import { patchVsCodeWorkbench, selectionMarker, validateVsCodeBridge } from '../src/host-adapters/vscode-bridge.js';
import { readFile } from 'node:fs/promises';
test('component checksum adapter pins disk-path capability without copying editor data', async () => {
  const r = JSON.parse(await readFile(new URL('../recipes/vscode-zlib-bridge/adapter.json', import.meta.url)));
  assert.equal(validateVsCodeBridge(r).feature.id, 'zlib-crc32');
  const patched = patchVsCodeWorkbench(selectionMarker + 'original();');
  assert.match(patched, /uri.fsPath/);
  assert.ok(!patched.includes('getValueInRange'));
  assert.throws(() => patchVsCodeWorkbench('unknown version'), /missing or ambiguous/);
  assert.throws(() => patchVsCodeWorkbench(selectionMarker + selectionMarker), /ambiguous/);
  assert.throws(() => validateVsCodeBridge({ ...r, capabilities: ['shell'] }));
});
test('component identity canonicalization is stable across object key order', () => {
  assert.equal(
    pkg.hash(pkg.canonical({ z: 1, a: { c: 2, b: [3, 4] } })),
    pkg.hash(pkg.canonical({ a: { b: [3, 4], c: 2 }, z: 1 }))
  );
  assert.notEqual(pkg.hash(pkg.canonical({ a: 1 })), pkg.hash(pkg.canonical({ a: 2 })));
});
test('component verifier rejects unknown profiles before loading code', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mk-component-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'COMPONENT.json'),
    JSON.stringify({
      schema: 1,
      kind: 'component-process-package',
      id: 'zlib-crc32',
      profile: 'unregistered',
      protocol: 1,
      files: []
    })
  );
  await assert.rejects(pkg.verifyComponentPackage(root), /registered component/);
});
test('component verifier binds expected digest before reading any payload', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mk-component-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const names = [
      '.native/workspace.json',
      '.native/recipe.json',
      '.native/evidence/elf.json',
      '.native/evidence/elf.json.stderr.log',
      '.native/inputs/libz.so',
      '.native/inputs/zlib.h',
      '.native/inputs/zconf.h',
      '.native/inputs/LICENSE.txt',
      'recipient/libz.so',
      'recipient/host.py',
      'bridge/worker.py'
    ],
    identity = {
      schema: 1,
      kind: 'component-process-package',
      id: 'zlib-crc32',
      profile: 'zlib-crc32-stdio-v1',
      protocol: 1,
      files: names.map(path => ({ path, sha256: 'a'.repeat(64), bytes: 0 }))
    };
  await writeFile(
    join(root, 'COMPONENT.json'),
    JSON.stringify({ ...identity, digest: pkg.hash(pkg.canonical(identity)) })
  );
  await assert.rejects(pkg.verifyComponentPackage(root, '0'.repeat(64)), /digest differs/);
});
