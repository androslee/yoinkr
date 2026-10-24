import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateJoplinAdapter,
  patchJoplinWorkbench,
  patchJoplinMain,
  startupMarker,
  ipcProfileMarker,
  probeJoplinAdapter
} from '../src/host-adapters/joplin.js';
import { sha256 } from '../src/workspace.js';
import { hostAdapterCatalog } from '../src/host-adapters/index.js';
import { linuxX64, verifiedLane } from './helpers.js';
const recipe = JSON.parse(await readFile(new URL('../recipes/joplin-raw-diff/adapter.json', import.meta.url)));
test('second recipient pins same recovered package with distinct note capabilities', () => {
  assert.equal(validateJoplinAdapter(recipe).target.version, '3.7.21');
  const c = hostAdapterCatalog().find(x => x.recipient === 'Joplin');
  assert.ok(c.capabilities.includes('note.selection'));
  assert.equal(c.extensionsUsed, false);
});
test('Joplin recipe refuses version, platform, duplicate pins and path escape', () => {
  for (const value of [
    { ...recipe, target: { ...recipe.target, version: 'future' } },
    { ...recipe, platform: 'win32' },
    { ...recipe, files: recipe.files.map(() => recipe.files[0]) },
    { ...recipe, files: [{ path: '../escape', sha256: 'a'.repeat(64) }, ...recipe.files.slice(1)] }
  ])
    assert.throws(() => validateJoplinAdapter(value));
});
test('Joplin hooks require unique exact command/settings and IPC profile locations', () => {
  for (const fn of [patchJoplinWorkbench, patchJoplinMain])
    assert.throws(() => fn('unknown version'), /missing or ambiguous/);
  assert.throws(() => patchJoplinWorkbench(startupMarker + startupMarker), /ambiguous/);
  assert.throws(() => patchJoplinMain(ipcProfileMarker + ipcProfileMarker), /ambiguous/);
  assert.ok(patchJoplinWorkbench(startupMarker + 'original();').endsWith('original();'));
  assert.ok(patchJoplinMain(ipcProfileMarker).includes('YOINKR_JOPLIN_PROFILE'));
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mk-joplin-binding-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const r = structuredClone(recipe),
    source = join(root, 'runtime');
  for (const f of r.files) {
    const file = join(source, f.path);
    await mkdir(join(file, '..'), { recursive: true });
    const text = f.path.endsWith('/package.json')
      ? JSON.stringify({ name: recipe.target.name, version: recipe.target.version, main: recipe.target.main })
      : f.path.endsWith('main-html.bundle.js')
        ? startupMarker + 'original();'
        : f.path.endsWith('main.bundle.js')
          ? ipcProfileMarker
          : 'fixture';
    await writeFile(file, text);
    f.sha256 = sha256(text);
  }
  const path = join(root, 'adapter.json');
  await writeFile(path, JSON.stringify(r));
  return { source, r, path };
}
test('Joplin probe permits implicit CommonJS package type and remains read-only', verifiedLane, async t => {
  const f = await fixture(t),
    result = await probeJoplinAdapter(f.source, f.path);
  assert.equal(result.identity.name, '@joplin/app-desktop');
  assert.notEqual(result.hook.beforeSha256, result.hook.afterSha256);
});
test('Joplin probe refuses main or renderer drift before application execution', verifiedLane, async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'resources/app/main.bundle.js'), 'changed');
  await assert.rejects(probeJoplinAdapter(f.source, f.path), /Unsupported\/changed Joplin input/);
});
test('both recipient recipes require the identical package digest', async () => {
  const first = JSON.parse(await readFile(new URL('../recipes/vscode-raw-diff/adapter.json', import.meta.url)));
  assert.equal(recipe.feature.digest, first.feature.digest);
  assert.equal(recipe.feature.digest, '175458a5e1277738fea13466c274b316cc7d1c97ca60bb10dafb6437a07e1187');
});
test(
  'Joplin probe refuses a runtime outside the verified Linux x86-64 lane',
  { skip: linuxX64 && 'runs on the verified lane' },
  async t => {
    const f = await fixture(t);
    await assert.rejects(probeJoplinAdapter(f.source, f.path), /verified only on Linux x86-64/);
  }
);
