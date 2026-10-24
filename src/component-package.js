import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { nativeComponentStatus, nativeEvidenceSummary } from './native-component.js';
import { saveJson, newDestination } from './workspace.js';
import pkg from './component-package.cjs';
export const { verifyComponentPackage } = pkg;
export async function buildComponentPackage(workspace, out) {
  const status = await nativeComponentStatus(workspace);
  if (!status.clean) throw Error('Native source workspace drift');
  const root = await realpath(workspace),
    state = JSON.parse(await readFile(join(root, '.native/workspace.json'))),
    evidence = JSON.parse(await readFile(join(root, '.native/evidence/elf.json')));
  nativeEvidenceSummary(evidence.data, state.librarySha256);
  if (
    state.artifacts.some(
      f =>
        ![
          '.native/recipe.json',
          '.native/evidence/elf.json',
          '.native/evidence/elf.json.stderr.log',
          '.native/inputs/libz.so',
          '.native/inputs/zlib.h',
          '.native/inputs/zconf.h',
          '.native/inputs/LICENSE.txt',
          'recipient/libz.so',
          'recipient/host.py'
        ].includes(f.path)
    )
  )
    throw Error('Unsupported registered zlib layout');
  const dest = await newDestination(out, [root]);
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest);
  const files = [];
  for (const path of ['.native/workspace.json', ...state.artifacts.map(f => f.path), 'bridge/worker.py']) {
    const b = await readFile(
      path === 'bridge/worker.py' ? new URL('./component-runtime/zlib-worker.py', import.meta.url) : join(root, path)
    );
    await mkdir(dirname(join(dest, path)), { recursive: true });
    await writeFile(join(dest, path), b, { flag: 'wx' });
    files.push({
      path,
      sha256: pkg.hash(b),
      bytes: b.length,
      role:
        path === 'bridge/worker.py'
          ? 'new-protocol-adapter'
          : path.includes('libz.so')
            ? 'recovered-library'
            : 'retained-provenance'
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const identity = {
    schema: 1,
    kind: 'component-process-package',
    id: 'zlib-crc32',
    profile: 'zlib-crc32-stdio-v1',
    protocol: 1,
    librarySha256: state.librarySha256,
    zlibVersion: state.headerVersion,
    operation: 'crc32',
    inputPolicy:
      'At most 1 MiB of bytes plus uint32 seed. No file paths or executable/function names in worker requests.',
    scope:
      'Original compiled zlib library and provenance retained unchanged; framed Python/ctypes worker is newly written. libc/Python remain host dependencies. Not a hostile-code sandbox.',
    files
  };
  await saveJson(join(dest, 'COMPONENT.json'), { ...identity, digest: pkg.hash(pkg.canonical(identity)) });
  return verifyComponentPackage(dest);
}
