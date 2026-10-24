/** Explicit source acquisition, separate from offline feature builds. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sourceRecipe } from '../../src/feature-slices.js';
import { sha256, newDestination, saveJson } from '../../src/workspace.js';
const [id, out, ...extra] = process.argv.slice(2);
if (!id || !out || extra.length) throw Error('Use <element-search|gimp-smoothing> <new source directory>');
const recipe = await sourceRecipe(id),
  root = await newDestination(out, []);
await mkdir(dirname(root), { recursive: true });
await mkdir(root, { mode: 0o700 });
for (const f of recipe.inputs) {
  const repo = recipe.repository.replace('https://github.com/', ''),
    url = `https://raw.githubusercontent.com/${repo}/${recipe.commit}/${f.path}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('Source acquisition failed ' + r.status);
  const chunks = [];
  let total = 0;
  for await (const chunk of r.body) {
    total += chunk.length;
    if (total > 1024 * 1024) throw Error('Source exceeds size limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length > 1024 * 1024 || sha256(bytes) !== f.sha256) throw Error('Source integrity mismatch: ' + f.path);
  await mkdir(dirname(join(root, f.path)), { recursive: true });
  await writeFile(join(root, f.path), bytes, { flag: 'wx' });
}
await saveJson(join(root, 'ACQUIRED.json'), recipe);
console.log(root);
