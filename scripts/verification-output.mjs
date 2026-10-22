import {mkdir, lstat, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Only a script-owned default directory may be replaced. Explicit destinations
// keep their caller's existing behavior and are never cleared by this helper.
export async function verificationOutput(suite, override, project = fileURLToPath(new URL('..', import.meta.url))) {
  if (override !== undefined) return resolve(override);
  if (!/^[a-z][a-z0-9-]*$/.test(suite)) throw Error('Invalid verification suite name');
  const projectRoot = await realpath(project);
  const base = join(projectRoot, '.local', 'verification');
  await mkdir(base, {recursive: true});
  if (await realpath(base) !== base) throw Error('Verification base must not traverse symlinks');
  const out = join(base, suite), marker = join(out, '.yoinkr-generated');
  const owner = `yoinkr-verification:${suite}\n`;
  let existing;
  try { existing = await lstat(out); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw Error('Refusing to replace non-directory verification output');
    const owned = await lstat(marker).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!owned?.isFile() || owned.isSymbolicLink() || await readFile(marker, 'utf8') !== owner)
      throw Error('Refusing to replace unowned verification output: ' + out);
    await rm(out, {recursive: true});
  }
  await mkdir(out, {mode: 0o700});
  await writeFile(marker, owner, {flag: 'wx'});
  return out;
}
