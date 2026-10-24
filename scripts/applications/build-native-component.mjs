import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { renderNativeReport } from '../../src/native-report.js';
import { prepareNativeComponent, verifyNativeComponent, nativeChecksum } from '../../src/native-component.js';
import { saveJson, sha256, newDestination } from '../../src/workspace.js';
const args = process.argv.slice(2),
  get = k => {
    const i = args.indexOf(k);
    return i < 0 ? null : args[i + 1];
  };
if (!get('--out') || !get('--python')) throw Error('use --out <new-showcase> --python <absolute-provider-python>');
const sourceFiles = {
    library: '/lib/x86_64-linux-gnu/libz.so.1',
    header: '/usr/include/zlib.h',
    types: '/usr/include/zconf.h',
    license: '/usr/share/doc/zlib1g/copyright'
  },
  names = { library: 'libz.so', header: 'zlib.h', types: 'zconf.h', license: 'LICENSE.txt' },
  sources = [];
for (const [role, path] of Object.entries(sourceFiles)) {
  const canonical = await realpath(path),
    bytes = await readFile(canonical);
  sources.push({ role, path, canonical, sha256: sha256(bytes), bytes });
}
const out = await newDestination(
  get('--out'),
  sources.map(s => s.canonical)
);
await mkdir(out, { mode: 0o700 });
for (const name of ['source', 'recipe', 'assets', 'acceptance']) await mkdir(join(out, name));
for (const s of sources) await writeFile(join(out, 'source', names[s.role]), s.bytes, { flag: 'wx', mode: 0o600 });
await saveJson(join(out, 'SOURCE.json'), {
  schema: 1,
  description:
    'Exact local zlib library, matching ABI headers and supplied license; source paths resolved before copying.',
  files: sources.map(({ bytes, ...s }) => ({ ...s, bytes: bytes.length, snapshot: 'source/' + names[s.role] }))
});
const b = s => Buffer.from(s).toString('base64'),
  cases = [
    { name: 'empty', chunks: [''], seed: 0, expected: 0 },
    { name: 'CRC-32/ISO-HDLC check vector', chunks: [b('123456789')], seed: 0, expected: 0xcbf43926 },
    { name: 'same vector streamed', chunks: [b('123'), b('456'), b('789')], seed: 0, expected: 0xcbf43926 },
    {
      name: 'binary bytes including NUL',
      chunks: [Buffer.from(Array.from({ length: 256 }, (_, i) => i)).toString('base64')],
      seed: 0
    },
    { name: 'UTF-8 text', chunks: [b('Yoinkr · café · 日本語')], seed: 0 },
    { name: 'seeded incremental state', chunks: [b('assets'), '', b('/entry.json')], seed: 0xffffffff },
    { name: 'zero buffer', chunks: [Buffer.alloc(65536).toString('base64')], seed: 0 },
    {
      name: 'max-sized patterned buffer',
      chunks: [Buffer.from(Array.from({ length: 65536 }, (_, i) => (i * 17) & 255)).toString('base64')],
      seed: 0
    },
    { name: 'empty preserves seed', chunks: [''], seed: 0x12345678, expected: 0x12345678 }
  ];
for (let i = 0; i < 7; i++)
  cases.push({
    name: 'deterministic binary ' + i,
    chunks: [Buffer.from(Array.from({ length: 31 + i * 173 }, (_, j) => (j * 31 + i * 43) & 255)).toString('base64')],
    seed: (i * 0x1234567) >>> 0
  });
const recipe = {
    schema: 1,
    kind: 'native-component',
    id: 'zlib-native-integrity',
    profile: 'zlib-crc32-linux-x64-v1',
    inputs: sources.map(s => ({ file: names[s.role], role: s.role, sha256: s.sha256 })),
    cases
  },
  recipeFile = join(out, 'recipe/native.json');
await saveJson(recipeFile, recipe);
await prepareNativeComponent(recipeFile, join(out, 'source'), { out: join(out, 'workspace'), python: get('--python') });
const verification = await verifyNativeComponent(join(out, 'workspace'), { python: get('--python') });
await saveJson(join(out, 'acceptance/VERIFICATION.json'), verification);
if (!verification.passed) throw Error('native verification failed; inspect retained report');
await writeFile(
  join(out, 'assets/scene.json'),
  JSON.stringify(
    { name: 'Example recipient asset pack', entries: ['textures/wall', 'audio/impact'], format: 1 },
    null,
    2
  )
);
await writeFile(join(out, 'assets/readme.txt'), 'Recipient files checked through the copied native zlib component.\n');
await writeFile(join(out, 'assets/binary.dat'), Buffer.from([0, 1, 2, 0, 255, 128, 64]));
const checksums = await nativeChecksum(join(out, 'workspace'), {
  python: get('--python'),
  inputRoot: join(out, 'assets'),
  files: ['scene.json', 'readme.txt', 'binary.dat'],
  out: join(out, 'asset-checksums.json')
});
await writeFile(
  join(out, 'native-report.html'),
  renderNativeReport(
    JSON.parse(await readFile(join(out, 'workspace/.native/workspace.json'))),
    verification,
    checksums
  ),
  { flag: 'wx' }
);
await saveJson(join(out, 'SHOWCASE.json'), {
  version: '0.16.0',
  workspace: join(out, 'workspace'),
  recipe: recipeFile,
  python: get('--python'),
  verificationPath: verification.reportPath,
  assetManifest: checksums.reportPath,
  report: join(out, 'native-report.html'),
  cases: verification.cases.length,
  sourceChanged: false,
  scope: verification.scope
});
console.log('Prepared native component showcase:', out);
console.log('Verified native cases:', verification.cases.length);
console.log('Recipient assets:', checksums.files.length);
