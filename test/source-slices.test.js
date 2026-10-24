import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceRecipe, buildSourceSlice, verifySourceSlice } from '../src/feature-slices.js';
import { hostAdapterCatalog, planHostAdapter } from '../src/host-adapters/index.js';
test('new donor recipes pin exact source bytes and disclose GUI limits', async () => {
  for (const id of ['element-search', 'gimp-smoothing']) {
    const r = await sourceRecipe(id);
    assert.match(r.commit, /^[0-9a-f]{40}$/);
    assert.ok(r.inputs.length >= 2);
    for (const f of r.inputs) assert.match(f.sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.scope.includes(id === 'element-search' ? 'original app acceptance' : 'GTK widgets'));
  }
  await assert.rejects(sourceRecipe('../arbitrary'));
});
test('source recovery refuses changed donors before creating a feature package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-slice-'));
  try {
    await mkdir(join(root, 'source/apps/web/src'), { recursive: true });
    await writeFile(join(root, 'source/apps/web/src/HtmlUtils.tsx'), 'modified');
    await assert.rejects(
      buildSourceSlice('element-search', join(root, 'source'), join(root, 'output')),
      /Pinned donor changed/
    );
    await assert.rejects(verifySourceSlice(join(root, 'output'), 'element-search'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Element adapter is explicitly cataloged and fails closed on another host binding', async () => {
  const r = hostAdapterCatalog().find(r => r.id === 'vscode-element-search-linux-x64-v1');
  assert.equal(r.extensionsUsed, false);
  assert.equal(r.platform, 'linux');
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-slice-binding-'));
  try {
    const file = join(root, 'binding.json');
    await writeFile(file, JSON.stringify({ kind: 'feature-host-adapter', id: r.id }));
    await assert.rejects(planHostAdapter(file, { runtime: root, featurePackage: root }), /Unsupported/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
