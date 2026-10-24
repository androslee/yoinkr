import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile, mkdir, readFile, symlink } from 'node:fs/promises';
import { tempDir } from './helpers.js';
import { safeRelative, investigate, applicationRoot, exportFeature } from '../src/research.js';
import { runRea, reaInfo } from '../src/rea.js';
const value = {
  schema: 1,
  evidenceHashes: {},
  donor: { files: [] },
  trace: { files: [] },
  route: { selected: 'direct' }
};
test('artifact paths reject traversal, absolute paths and cross-platform drive paths', () => {
  for (const p of ['../x', '/x', 'C:/x', 'C:\\x', 'x//y', 'x/./y', 'x/../y', '']) assert.throws(() => safeRelative(p));
  assert.equal(safeRelative('images/icon.svg'), 'images/icon.svg');
});
test('investigation requires explicit feature and a supported route before any backend call', async () => {
  for (const args of [{}, { feature: 'x', seed: 'x', route: 'magic' }])
    await assert.rejects(
      investigate(args, () => {
        throw Error('backend must not run');
      }),
      /feature|route/
    );
});
test('application roots recognize installed Electron resources without executing code', async () => {
  const dir = tempDir();
  await mkdir(join(dir, 'resources', 'app'), { recursive: true });
  assert.equal(await applicationRoot(dir), join(dir, 'resources', 'app'));
});
test('case output inside an input or an existing directory is refused', async () => {
  const donor = tempDir(),
    recipient = tempDir(),
    args = { donor, recipient, feature: 'x', seed: 'module.js' };
  await assert.rejects(investigate({ ...args, out: join(donor, 'case') }), /outside/);
  await assert.rejects(investigate({ ...args, out: tempDir() }), /EEXIST/);
});
test('export preserves provenance for a selected asset, refuses traversal and source symlinks', async () => {
  const dir = tempDir(),
    donor = tempDir(),
    outside = tempDir();
  await writeFile(join(donor, 'asset.txt'), 'original');
  await writeFile(join(outside, 'secret.txt'), 'not selected');
  await symlink(join(outside, 'secret.txt'), join(donor, 'escape.txt'));
  await writeFile(join(dir, 'case.json'), JSON.stringify({ ...value, id: 'case', donor: { path: donor, files: [] } }));
  const exported = await exportFeature(dir, { files: ['asset.txt'] });
  assert.equal(await readFile(join(exported.directory, 'files', 'asset.txt'), 'utf8'), 'original');
  assert.equal(exported.files[0].analysisBound, false);
  assert.equal(exported.status, 'extracted-not-integrated');
  await assert.rejects(exportFeature(dir, { files: ['../secret.txt'] }), /relative/);
  await assert.rejects(exportFeature(dir, { files: ['escape.txt'] }), /escapes/);
});
test('changed evidence and an escaping private directory block export', async () => {
  const dir = tempDir(),
    donor = tempDir();
  await writeFile(join(donor, 'x'), 'x');
  await mkdir(join(dir, 'evidence'));
  await writeFile(join(dir, 'evidence', 'donor.json'), 'changed');
  const record = { ...value, donor: { path: donor, files: [] }, evidenceHashes: { 'donor.json': '0'.repeat(64) } };
  await writeFile(join(dir, 'case.json'), JSON.stringify(record));
  await assert.rejects(exportFeature(dir, { files: ['x'] }), /Evidence changed/);
  record.evidenceHashes = {};
  await writeFile(join(dir, 'case.json'), JSON.stringify(record));
  await symlink(tempDir(), join(dir, 'private'));
  await assert.rejects(exportFeature(dir, { files: ['x'] }), /escaped/);
});
test('real REA backend is installed locally and never overwrites existing evidence output', async () => {
  assert.equal(reaInfo().version, '6.7.0');
  const output = join(tempDir(), 'evidence.json');
  await writeFile(output, 'preserved');
  await assert.rejects(runRea(['--help'], output), /EEXIST/);
  assert.equal(await readFile(output, 'utf8'), 'preserved');
});
