import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, symlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verificationOutput} from '../scripts/general/verification-output.mjs';

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-output-test-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  return root;
}

test('default suite reruns replace only their owned output at a stable path', async t => {
  const root = await project(t), out = await verificationOutput('browser', undefined, root);
  await writeFile(join(out, 'previous.json'), '{}');
  const other = await verificationOutput('agent', undefined, root);
  await writeFile(join(other, 'retained.json'), '{}');
  assert.equal(await verificationOutput('browser', undefined, root), out);
  await assert.rejects(readFile(join(out, 'previous.json')), {code:'ENOENT'});
  assert.equal(await readFile(join(other, 'retained.json'), 'utf8'), '{}');
});

test('unmarked default directories and their contents are preserved', async t => {
  const root = await project(t), out = join(root, '.local/verification/browser');
  await mkdir(out, {recursive:true});
  await writeFile(join(out, 'mine.txt'), 'keep');
  await assert.rejects(verificationOutput('browser', undefined, root), /unowned/);
  assert.equal(await readFile(join(out, 'mine.txt'), 'utf8'), 'keep');
});

test('explicit output overrides are never created or cleared', async t => {
  const root = await project(t), out = join(root, 'custom');
  assert.equal(await verificationOutput('browser', out, root), out);
  await assert.rejects(readFile(out), {code:'ENOENT'});
  await mkdir(out); await writeFile(join(out, 'mine.txt'), 'keep');
  assert.equal(await verificationOutput('browser', out, root), out);
  assert.equal(await readFile(join(out, 'mine.txt'), 'utf8'), 'keep');
});

test('symlink destinations, bases and path traversal are refused', async t => {
  const root = await project(t), target = join(root, 'target');
  await mkdir(target); await writeFile(join(target, 'mine.txt'), 'keep');
  await mkdir(join(root, '.local/verification'), {recursive:true});
  await symlink(target, join(root, '.local/verification/browser'));
  await assert.rejects(verificationOutput('browser', undefined, root), /non-directory/);
  await assert.rejects(verificationOutput('../target', undefined, root), /Invalid/);
  await rm(join(root, '.local'), {recursive:true});
  await symlink(target, join(root, '.local'));
  await assert.rejects(verificationOutput('browser', undefined, root), /symlinks/);
  assert.equal(await readFile(join(target, 'mine.txt'), 'utf8'), 'keep');
});
