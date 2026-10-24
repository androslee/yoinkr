import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateVsCodeAdapter,
  patchVsCodeWorkbench,
  selectionMarker,
  themeMarker,
  probeVsCodeAdapter,
  planVsCodeAdapter
} from '../src/host-adapters/vscode.js';
import { hostAdapterCatalog, planHostAdapter } from '../src/host-adapters/index.js';
import { validateElectronPlaybook } from '../src/electron-playbook.js';
import { sha256 } from '../src/workspace.js';
import { linuxX64, verifiedLane } from './helpers.js';
const recipe = JSON.parse(await readFile(new URL('../recipes/vscode-raw-diff/adapter.json', import.meta.url)));
test('adapter catalog names a bounded verified runtime and explicit host capabilities', () => {
  const c = hostAdapterCatalog();
  assert.equal(new Set(c.map(x => x.id)).size, c.length);
  assert.ok(c.some(x => x.id === 'vscode-element-search-linux-x64-v1'));
  assert.equal(c[0].version, '1.142.0');
  assert.ok(c[0].capabilities.includes('editor.selection'));
  assert.equal(c[0].extensionsUsed, false);
});
test('adapter recipe rejects unsupported runtime, duplicate pins and traversal', () => {
  assert.equal(validateVsCodeAdapter(recipe).target.version, '1.142.0');
  assert.throws(() => validateVsCodeAdapter({ ...recipe, target: { ...recipe.target, version: 'future' } }));
  assert.throws(
    () => validateVsCodeAdapter({ ...recipe, files: [recipe.files[0], ...recipe.files.slice(0, 5)] }),
    /distinct/
  );
  assert.throws(() =>
    validateVsCodeAdapter({
      ...recipe,
      files: [{ path: '../outside', sha256: 'a'.repeat(64) }, ...recipe.files.slice(1)]
    })
  );
  assert.throws(() => validateVsCodeAdapter({ ...recipe, extensionsUsed: true }));
});
test('hook requires unique selection handler and surrounding theme bindings', () => {
  for (const text of [
    '',
    selectionMarker,
    themeMarker,
    selectionMarker + selectionMarker + themeMarker,
    selectionMarker + themeMarker + themeMarker
  ])
    assert.throws(() => patchVsCodeWorkbench(text), /missing or ambiguous/);
  const original = selectionMarker + 'originalHandler();' + themeMarker + 'rest();',
    patched = patchVsCodeWorkbench(original);
  assert.ok(patched.includes('getValueInRange'));
  assert.ok(patched.includes('onDidColorThemeChange'));
  assert.ok(patched.includes('originalHandler();'));
  assert.ok(patched.endsWith('rest();'));
  assert.ok(!patched.includes('clipboardCopyAction'));
  assert.ok(!patched.includes('acquireVsCodeApi'));
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-vscode-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'code');
  await mkdir(source);
  const r = structuredClone(recipe);
  for (const f of r.files) {
    const file = join(source, f.path);
    await mkdir(join(file, '..'), { recursive: true });
    const text = f.path.endsWith('package.json')
      ? JSON.stringify(recipe.target)
      : f.path.endsWith('workbench.desktop.main.js')
        ? selectionMarker + 'originalHandler();' + themeMarker
        : 'fixture';
    await writeFile(file, text);
    f.sha256 = sha256(text);
  }
  const recipePath = join(root, 'adapter.json');
  await writeFile(recipePath, JSON.stringify(r));
  return { root, source, r, recipePath };
}
test('read-only probe binds actual package and hook bytes and creates no installation', verifiedLane, async t => {
  const f = await fixture(t),
    r = await probeVsCodeAdapter(f.source, f.recipePath);
  assert.equal(r.identity.version, '1.142.0');
  assert.notEqual(r.hook.beforeSha256, r.hook.afterSha256);
  await assert.rejects(stat(join(f.root, 'workspace')), { code: 'ENOENT' });
});
test('recipient drift is refused before mounting any feature', verifiedLane, async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'resources/app/out/main.js'), 'changed');
  await assert.rejects(probeVsCodeAdapter(f.source, f.recipePath), /Unsupported\/changed VS Code input/);
});
test('even a rehashed incompatible package cannot bypass identity checks', verifiedLane, async t => {
  const f = await fixture(t),
    text = JSON.stringify({ ...recipe.target, version: 'future' });
  await writeFile(join(f.source, 'resources/app/package.json'), text);
  f.r.files.find(p => p.path === 'resources/app/package.json').sha256 = sha256(text);
  await writeFile(f.recipePath, JSON.stringify(f.r));
  await assert.rejects(probeVsCodeAdapter(f.source, f.recipePath), /identity differs/);
});
test('feature must be supplied and hash checked before application', verifiedLane, async t => {
  const f = await fixture(t);
  await assert.rejects(planVsCodeAdapter(f.source, join(f.root, 'missing-feature'), f.recipePath), /ENOENT/);
});
test('unknown adapter is refused through shared operation registry', async t => {
  const f = await fixture(t);
  await writeFile(f.recipePath, JSON.stringify({ ...f.r, id: 'unknown' }));
  await assert.rejects(
    planHostAdapter(f.recipePath, { runtime: f.source, featurePackage: 'unused' }),
    /Unsupported host adapter/
  );
});
test('playbooks bound larger immutable packages at 256 distinct operations', () => {
  const p = {
    schema: 1,
    kind: 'electron-playbook',
    id: 'feature-package',
    target: { app: 'resources/app', name: 'Code', version: '1.142.0', main: './out/main.js', type: 'module' },
    files: Array.from({ length: 256 }, (_, i) => ({
      role: 'asset',
      file: 'feature/' + i,
      payload: String(i),
      beforeSha256: null,
      afterSha256: 'a'.repeat(64)
    }))
  };
  assert.equal(validateElectronPlaybook(p).files.length, 256);
  p.files.push({ ...p.files[0], file: 'feature/256' });
  assert.throws(() => validateElectronPlaybook(p), /1–256/);
});
test(
  'probe refuses a runtime outside the verified Linux x86-64 lane',
  { skip: linuxX64 && 'runs on the verified lane' },
  async t => {
    const f = await fixture(t);
    await assert.rejects(probeVsCodeAdapter(f.source, f.recipePath), /verified only on Linux x86-64/);
  }
);
