// Source-only comparison: does not execute the Firefox extension or grant APIs.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { verificationOutput } from '../../scripts/general/verification-output.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const recipe = JSON.parse(await readFile(join(root, 'recipe.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function archive(name, expected) {
  const bytes = await readFile(join(root, '.local/upstream', name));
  if (hash(bytes) !== expected) throw Error('Archive integrity mismatch: ' + name);
  return unzipSync(bytes);
}
const chromium = await archive('uBlock.zip', recipe.sha256);
const firefox = await archive('ublock-firefox.zip', recipe.firefoxAudit.sha256);
const files = [
  'js/static-net-filtering.js',
  'js/cosmetic-filtering.js',
  'js/scriptlet-filtering.js',
  'js/html-filtering.js'
];
const comparison = files.map(file => ({
  file,
  chromium: hash(chromium['uBlock0.chromium/' + file]),
  firefox: hash(firefox[file]),
  identical: hash(chromium['uBlock0.chromium/' + file]) === hash(firefox[file])
}));
const manifest = archive => JSON.parse(Buffer.from(archive).toString());
const c = manifest(chromium['uBlock0.chromium/manifest.json']),
  f = manifest(firefox['manifest.json']);
const out = await verificationOutput('firefox-ublock-audit', process.argv[2]);
const result = {
  schema: 1,
  kind: 'source-audit-only',
  version: recipe.version,
  comparison,
  firefoxOnlyManifestPermissions: f.permissions.filter(p => !c.permissions.includes(p)),
  browserApiGaps: [
    {
      api: 'dns.resolve',
      status: 'not implemented in Yoinkr',
      requires: 'Host DNS/CNAME/IP resolution with bounded cache and consistent browser resolver policy'
    },
    {
      api: 'webRequest.filterResponseData',
      status: 'not implemented in Yoinkr',
      requires:
        'Response interception before parsing, request-identity mapping, StreamFilter lifecycle and bounded streaming'
    },
    {
      api: 'Firefox environment/browser API conventions',
      status: 'not ported',
      requires: 'Real API adaptation and cross-engine native acceptance; a manifest edit cannot supply this'
    }
  ],
  conclusions: [
    'The current demo uses original uBlock Origin MV2, not uBlock Origin Lite.',
    'Identical source files do not establish identical browser behavior.',
    'The Firefox package has not been loaded or verified in Chromium by this audit.'
  ]
};
await writeFile(join(out, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n');
for (const entry of comparison) console.log(`${entry.identical ? 'IDENTICAL' : 'DIFFERENT'} ${entry.file}`);
console.log('Firefox-specific APIs remain unimplemented. Source audit: ' + out);
