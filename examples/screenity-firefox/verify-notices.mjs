// Inspect actual generated notices, rather than relying on a README assertion.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const demo = join(root, '.local/demo');
const same = async (built, original) =>
  assert.deepEqual(await readFile(join(demo, built)), await readFile(original), built);
await same('extension/FABRIC-LICENSE.txt', join(root, 'node_modules/fabric/LICENSE'));
await same('source/yoinkr/FABRIC-LICENSE.txt', join(root, 'node_modules/fabric/LICENSE'));
await same('source/yoinkr/LICENSE', join(root, '../../LICENSE'));
await same('extension/LICENSE', join(root, '.local/upstream/LICENSE'));
await same('extension/THIRD_PARTY_NOTICES.md', join(root, '.local/upstream/THIRD_PARTY_NOTICES.md'));
await same('extension/YOINKR-NOTICES.md', join(root, 'THIRD_PARTY_NOTICES.md'));
const receipt = JSON.parse(await readFile(join(demo, 'PROVENANCE.json')));
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'FABRIC-LICENSE.txt', 'YOINKR-NOTICES.md'])
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(demo, 'extension', file)))
      .digest('hex'),
    receipt.outputHashes[file],
    file + ' covered by launch integrity'
  );
console.log('PASS original GPL notices, Fabric MIT notice, host license and generated integrity coverage');
