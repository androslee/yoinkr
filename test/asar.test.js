import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, writeAsar } from './helpers.js';
import { readHeader, findEntry, readEntryBuffer, readEntryJson, sha256File } from '../src/asar.js';

const dir = tempDir();
const asar = writeAsar(dir, [
  { path: 'package.json', content: { name: 'fixture-app', version: '1.2.3' } },
  { path: 'dist/main.js', content: 'console.log(1);\n' },
]);

test('reads header and locates entries', () => {
  const { header, dataOffset } = readHeader(asar);
  assert.ok(header.files['package.json']);
  assert.equal(findEntry(header, 'dist/main.js').offset, '40');
  assert.ok(dataOffset > 8);
});

test('round-trips entry contents', () => {
  assert.equal(readEntryBuffer(asar, 'dist/main.js').toString('utf8'), 'console.log(1);\n');
  assert.deepEqual(readEntryJson(asar, 'package.json'), { name: 'fixture-app', version: '1.2.3' });
  assert.equal(readEntryJson(asar, 'nope.txt'), null);
});

test('rejects a garbage header size instead of reading the world', () => {
  const bad = join(dir, 'bad.asar');
  writeFileSync(bad, Buffer.concat([Buffer.alloc(4), Buffer.from([0xff, 0xff, 0xff, 0xff])]));
  assert.throws(() => readHeader(bad), /out of range/);
});

test('hashes the whole file', async () => {
  const hash = await sha256File(asar);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await sha256File(asar));
});
