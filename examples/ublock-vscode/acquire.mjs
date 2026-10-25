import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const recipe = JSON.parse(await readFile(join(root, 'recipe.json')));
const digest = b => createHash('sha256').update(b).digest('hex');
const inputs = [{ ...recipe, key: 'uBlock', name: 'uBlock Origin' }, ...recipe.extensions];
if (process.argv.includes('--firefox-audit'))
  inputs.push({ ...recipe.firefoxAudit, key: 'ublock-firefox', name: 'uBlock Firefox audit input' });
for (const input of inputs) {
  const target = join(root, '.local/upstream', input.key + '.zip');
  let valid = false;
  try {
    valid = digest(await readFile(target)) === input.sha256;
  } catch {}
  if (!valid) {
    const response = await fetch(input.archive, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`${input.name} download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== input.sha256) throw Error(`${input.name} archive integrity mismatch`);
    await mkdir(dirname(target), { recursive: true });
    const temporary = target + '.download';
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  console.log(`Verified original ${input.name} ${input.version}: ${target}`);
}
