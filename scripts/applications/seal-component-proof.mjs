import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { saveJson, containedFile, sha256 } from '../../src/workspace.js';
if (process.argv.length !== 3) throw Error('Use seal-component-proof.mjs <completed component proof>');
const root = await realpath(process.argv[2]),
  files = [];
async function walk(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      e.name === 'INTEGRITY.json' ||
      e.name.endsWith('-session') ||
      e.name === 'retained-profile' ||
      e.name === 'session' ||
      e.name === 'changed-package'
    )
      continue;
    const name = prefix + e.name;
    if (e.isDirectory()) await walk(join(dir, e.name), name + '/');
    else {
      const p = await containedFile(root, name),
        size = (await lstat(p)).size;
      if (size > 32 * 1024 * 1024) throw Error('Proof file exceeds 32 MiB');
      const b = await readFile(p);
      files.push({ path: name, sha256: sha256(b), bytes: b.length });
    }
  }
}
await walk(root);
if (files.length > 1024) throw Error('Proof exceeds 1024 files');
await saveJson(join(root, 'INTEGRITY.json'), {
  schema: 1,
  files,
  scope:
    'Post-run append-only integrity index; transient app session/profile directories are excluded. Native results, lifecycle/fault records and method snapshots are included. Deliberately modified negative-test packages and app profiles are excluded.'
});
console.log('Indexed', files.length, 'files');
