import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  nativeHeaderContract,
  crc32Reference,
  validateNativeCases,
  validateNativeRecipe,
  nativeEvidenceSummary,
  nativeComponentStatus,
  runNativeHost,
  nativeProfile
} from '../src/native-component.js';
import { sha256 } from '../src/workspace.js';
import { linuxX64, verifiedLane } from './helpers.js';
const hex = 'a'.repeat(64),
  cases = [{ name: 'check', chunks: [Buffer.from('123456789').toString('base64')], seed: 0, expected: 0xcbf43926 }];
const recipe = () => ({
  schema: 1,
  kind: 'native-component',
  id: 'fixture',
  profile: nativeProfile,
  inputs: ['library', 'header', 'types', 'license'].map(role => ({ role, file: role, sha256: hex })),
  cases: structuredClone(cases)
});
const evidence = () => ({
  operation: 'inspect_binary_layout',
  evidence_id: 'unit-synthetic-evidence',
  provider: { id: 'pwntools-elf' },
  subject: { digest: { sha256: hex } },
  normalized_result: {
    artifact: { sha256: hex },
    format: 'elf',
    image_type: 'ET_DYN',
    architecture: { machine: 'EM_X86_64', bits: 64, byte_order: 'little' },
    symbols: ['crc32', 'zlibVersion'].map(display => ({
      name: { display },
      type: 'STT_FUNC',
      binding: 'STB_GLOBAL',
      visibility: 'STV_DEFAULT',
      section_index: 15,
      value_meaning: 'linked-virtual-address',
      value: '0x100'
    })),
    linkage: { needed_libraries: [{ display: 'libc.so.6', unknown_reason: null }] },
    diagnostics: { stderr: 'A retained provider limitation' },
    limitations: []
  }
});
async function temp(t) {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('independent CRC32 agrees with the published check vector, streaming and seeded empty input', () => {
  assert.equal(crc32Reference([Buffer.from('123456789')]), 0xcbf43926);
  assert.equal(crc32Reference([Buffer.from('123'), Buffer.from('456789')]), 0xcbf43926);
  assert.equal(crc32Reference([Buffer.alloc(0)]), 0);
  assert.equal(crc32Reference([Buffer.alloc(0)], 0x12345678), 0x12345678);
  const a = Buffer.from([0, 255, 128, 42]);
  assert.equal(crc32Reference([a.subarray(2)], crc32Reference([a.subarray(0, 2)])), crc32Reference([a]));
});
test('native cases reject ambiguous base64, invalid seeds, empty cases and oversized work', () => {
  for (const patch of [
    { seed: -1 },
    { seed: 2 ** 32 },
    { seed: 0.5 },
    { chunks: ['%%%'] },
    { chunks: ['YQ'] },
    { chunks: [] },
    { expected: NaN },
    { chunks: [Buffer.alloc(65537).toString('base64')] }
  ])
    assert.throws(() => validateNativeCases([{ ...cases[0], ...patch }]));
  assert.throws(() => validateNativeCases([]));
  assert.throws(
    () =>
      validateNativeCases(
        Array.from({ length: 17 }, (_, i) => ({
          name: '' + i,
          seed: 0,
          chunks: [Buffer.alloc(65536).toString('base64')]
        }))
      ),
    /1 MiB/
  );
});
test('profile is explicit and inputs are pinned without traversal, duplicate roles or executable hooks', () => {
  assert.equal(validateNativeRecipe(recipe()).profile, nativeProfile);
  for (const change of [
    r => (r.profile = 'generic-call'),
    r => (r.inputs[0].file = '../escape'),
    r => (r.inputs[0].sha256 = '*'),
    r => (r.inputs[1].role = 'library'),
    r => (r.hook = 'arbitrary'),
    r => r.inputs.pop(),
    r => (r.inputs[1].file = 'library/child')
  ]) {
    const r = recipe();
    change(r);
    assert.throws(() => validateNativeRecipe(r));
  }
});
test('REA adapter checks export, ABI, digest and dependencies while retaining provider caveats', () => {
  const e = evidence(),
    s = nativeEvidenceSummary(e, hex);
  assert.equal(s.exports.length, 2);
  assert.equal(s.diagnostics.stderr, 'A retained provider limitation');
  assert.match(s.limitations.at(-1), /not runtime call addresses/);
  for (const change of [
    e => (e.provider.id = 'other'),
    e => (e.subject.digest.sha256 = '0'.repeat(64)),
    e => (e.normalized_result.architecture.bits = 32),
    e => (e.normalized_result.image_type = 'ET_EXEC'),
    e => e.normalized_result.linkage.needed_libraries.push({ display: 'libunknown.so' }),
    e => e.normalized_result.symbols.pop(),
    e => (e.normalized_result.symbols[0].section_index = 'SHN_UNDEF'),
    e => (e.normalized_result.symbols[0].binding = 'STB_LOCAL')
  ]) {
    const x = evidence();
    change(x);
    assert.throws(() => nativeEvidenceSummary(x, hex));
  }
});
test('bounded owned worker records failures and stops timeout/output floods', async t => {
  const root = await temp(t),
    sleep = join(root, 'sleep.py'),
    flood = join(root, 'flood.py');
  await writeFile(sleep, 'import time\ntime.sleep(5)\n');
  await writeFile(flood, 'print("x"*400000)\n');
  const timeout = await runNativeHost('/usr/bin/python3', sleep, {}, { timeoutMs: 100 });
  assert.match(timeout.failure, /timed out/);
  const output = await runNativeHost('/usr/bin/python3', flood, {}, { timeoutMs: 3000 });
  assert.match(output.failure, /output exceeds/);
  await assert.rejects(runNativeHost('python3', sleep, {}), /absolute/);
  await assert.rejects(runNativeHost('/usr/bin/python3', sleep, {}, { timeoutMs: 0 }), /deadline/);
});
test('native host rejects invalid requests before loading a library', verifiedLane, async t => {
  const root = await temp(t),
    library = join(root, 'not-a-library.so');
  await writeFile(library, 'invalid ELF bytes');
  const script = fileURLToPath(new URL('../src/native/zlib-host.py', import.meta.url)),
    job = { library, sha256: sha256('invalid ELF bytes'), cases: [{ seed: -1, chunks: [''] }] },
    worker = await runNativeHost('/usr/bin/python3', script, job);
  assert.equal(worker.result.kind, 'failure');
  assert.match(worker.result.message, /invalid checksum case/);
});
async function statusFixture(t) {
  const root = await temp(t),
    r = recipe(),
    artifacts = [];
  const save = async (path, bytes) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), bytes);
    artifacts.push({ path, sha256: sha256(bytes) });
  };
  for (const f of r.inputs) {
    const bytes = Buffer.from('synthetic ' + f.role);
    f.sha256 = sha256(bytes);
    await save('.native/inputs/' + f.file, bytes);
  }
  const bytes = Buffer.from(JSON.stringify(r));
  await save('.native/recipe.json', bytes);
  await save('.native/evidence/elf.json', 'synthetic status-only fixture, never used for native execution');
  await save('.native/evidence/elf.json.stderr.log', '');
  await save('recipient/libz.so', 'synthetic library');
  await save('recipient/host.py', 'synthetic host');
  await writeFile(
    join(root, '.native/workspace.json'),
    JSON.stringify({
      schema: 1,
      kind: 'native-component-workspace',
      id: r.id,
      profile: nativeProfile,
      recipeSha256: sha256(bytes),
      librarySha256: r.inputs[0].sha256,
      artifacts
    })
  );
  return root;
}
test('tracked native status detects drift and refuses redirected paths', async t => {
  const root = await statusFixture(t);
  assert.equal((await nativeComponentStatus(root)).clean, true);
  await writeFile(join(root, 'recipient/libz.so'), 'changed');
  assert.equal((await nativeComponentStatus(root)).clean, false);
  await rm(join(root, 'recipient/host.py'));
  await symlink(join(root, 'recipient/libz.so'), join(root, 'recipient/host.py'));
  await assert.rejects(nativeComponentStatus(root), /non-ordinary/);
});

test('header guards require both export declarations and the retained byte/integer typedefs', () => {
  const h =
      '#define ZLIB_VERSION "1.3"\nconst char * ZEXPORT zlibVersion(void);\nuLong crc32(uLong crc, const Bytef *buf, uInt len);',
    t = 'typedef unsigned long uLong; typedef unsigned int uInt; typedef unsigned char Byte; typedef Byte FAR Bytef;';
  assert.equal(nativeHeaderContract(h, t), '1.3');
  assert.throws(() => nativeHeaderContract(h.replace('zlibVersion', 'other'), t), /headers/);
  assert.throws(() => nativeHeaderContract(h, t.replace('unsigned char', 'signed char')), /headers/);
});
