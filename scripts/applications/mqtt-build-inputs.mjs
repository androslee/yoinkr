// Only source-map source URL identities are normalized; module code is never executed.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../src/workspace.js';
const calls = /\beval\(("(?:[^"\\]|\\.)*")\);/g;
const maps = /^\/\/# sourceMappingURL=data:application\/json[^,\n]*,([A-Za-z0-9+/=]+)$/gm;
export function normalizeSourceMapIdentities(text, identities) {
  if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw Error('Bundle exceeds normalization limit');
  let changes = 0;
  const output = text.replace(calls, (call, literal) => {
    const body = JSON.parse(literal);
    const normalized = body.replace(maps, (line, encoded) => {
      const map = JSON.parse(Buffer.from(encoded, 'base64').toString());
      if (!Array.isArray(map.sources) || map.sources.length > 64) throw Error('Invalid source map');
      map.sources = map.sources.map(source => {
        if (typeof source !== 'string') throw Error('Invalid source URL');
        const key = source.replace(/\?[a-f0-9]+$/, '');
        const expected = Object.hasOwn(identities, key) && identities[key];
        if (typeof expected !== 'string' || expected.replace(/\?[a-f0-9]+$/, '') !== key)
          throw Error('Unknown or invalid source-map identity: ' + key);
        if (source !== expected) changes++;
        return expected;
      });
      return line.slice(0, -encoded.length) + Buffer.from(JSON.stringify(map)).toString('base64');
    });
    return normalized === body ? call : 'eval(' + JSON.stringify(normalized) + ');';
  });
  return { output, changes };
}
export async function normalizeMqttBuild(directory, reference, recipe) {
  const file = join(reference, 'source-map-identities.json');
  const bytes = await readFile(file);
  if (bytes.length > 512 * 1024) throw Error('Source-map identity metadata exceeds limit');
  const metadata = JSON.parse(bytes);
  if (
    metadata.schema !== 1 ||
    metadata.revision !== recipe.revision ||
    !metadata.sources ||
    Object.keys(metadata.sources).length > 2000
  )
    throw Error('Invalid source-map identity metadata');
  const records = [],
    writes = [];
  for (const name of recipe.bundleFiles) {
    const path = join(directory, name),
      before = await readFile(path);
    const { output, changes } = normalizeSourceMapIdentities(before.toString('utf8'), metadata.sources);
    const expected = recipe.inputs.find(f => f.path === name)?.sha256;
    if (!expected || sha256(output) !== expected)
      throw Error('Normalized donor bundle still differs from frozen recipe: ' + name);
    writes.push([path, output]);
    records.push({ path: name, beforeSha256: sha256(before), afterSha256: sha256(output), sourceUrlChanges: changes });
  }
  // Validate every bundle before writing either one. Frozen hashes are never repinned.
  for (const [path, output] of writes) await writeFile(path, output);
  return { kind: 'source-map-url-identity-only', metadataSha256: sha256(bytes), records };
}
