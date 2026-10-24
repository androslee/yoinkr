import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { verifySourceSlice } from '../../src/feature-slices.js';
import { newDestination, saveJson, sha256 } from '../../src/workspace.js';
const [feature, out, ...extra] = process.argv.slice(2);
if (!out || extra.length) throw Error('Use <built gimp-smoothing package> <new OBS source output>');
const slice = await verifySourceSlice(feature, 'gimp-smoothing'),
  root = await newDestination(out, [slice.root]);
await mkdir(dirname(root), { recursive: true });
await mkdir(root, { mode: 0o700 });
const records = [];
for (const name of ['annotation.cpp', 'CMakeLists.txt', 'smoothing.c', 'smoothing.h']) {
  const bytes = await readFile(
    ['smoothing.c', 'smoothing.h'].includes(name)
      ? join(slice.root, 'payload', name)
      : new URL('../../src/example-runtime/obs/' + name, import.meta.url)
  );
  await writeFile(join(root, name), bytes, { flag: 'wx' });
  records.push({ path: name, sha256: sha256(bytes) });
}
for (const f of [...slice.files, { path: 'FEATURE.json' }]) {
  const bytes = await readFile(join(slice.root, f.path));
  if (f.sha256 && sha256(bytes) !== f.sha256) throw Error('Changed donor package');
  const path = 'donor/' + f.path;
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes, { flag: 'wx' });
  records.push({ path, sha256: sha256(bytes) });
}
await saveJson(join(root, 'RECIPIENT.json'), {
  schema: 1,
  kind: 'experimental-obs-recipient-source',
  donorDigest: slice.digest,
  donorPackage: 'donor',
  files: records,
  compiled: false,
  nativeObsAcceptance: 'not-run',
  gtkWidgetAcceptance: 'not-run',
  requires: ['CMake >=3.22', 'C/C++ compiler', 'OBS Studio development SDK with frontend API', 'Qt 6 Widgets SDK'],
  notes: [
    'Build with cmake -S . -B build, then cmake --build build.',
    'Install only into an isolated OBS profile/plugin directory. Native acceptance and rollback are still required.',
    'This is native OBS module source, not an installed OBS plugin or a GTK widget transplant.'
  ]
});
console.log(root);
