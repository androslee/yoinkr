import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { planElectronPlaybook, applyElectronPlaybook } from '../../src/electron-playbook.js';
import { containedFile, newDestination, sha256, saveJson } from '../../src/workspace.js';
const root = dirname(fileURLToPath(import.meta.url));
const [input, output, ...extra] = process.argv.slice(2);
if (!input || extra.length) throw Error('Use: node build.mjs <VS Code runtime directory> [new output directory]');
if (process.platform !== 'linux' || process.arch !== 'x64')
  throw Error('This first native binding targets Linux x86-64');
const runtime = await import('node:fs/promises').then(fs => fs.realpath(resolve(input)));
const dest = await newDestination(output || join(root, '.local/plugin-browser'), [runtime]);
const pkgBytes = await readFile(await containedFile(runtime, 'resources/app/package.json'));
const pkg = JSON.parse(pkgBytes);
if (
  pkg.name !== 'Code' ||
  pkg.type !== 'module' ||
  !/^\.\/[a-zA-Z0-9_./-]+\.m?js$/.test(pkg.main) ||
  pkg.main.includes('..')
)
  throw Error('Expected a VS Code Linux runtime with a relative ESM entry point');
const recipe = JSON.parse(await readFile(join(root, 'recipe.json')));
const archive = await readFile(join(root, '.local/upstream/uBlock.zip')).catch(() => {
  throw Error('Run npm run acquire in this example first');
});
if (sha256(archive) !== recipe.sha256) throw Error('uBlock source integrity mismatch');
const addonArchives = [];
for (const addon of recipe.extensions) {
  const bytes = await readFile(join(root, '.local/upstream', addon.key + '.zip'));
  if (sha256(bytes) !== addon.sha256) throw Error(addon.name + ' source integrity mismatch');
  addonArchives.push([addon.key, bytes]);
}
const fingerprints = {};
for (const name of [
  'code',
  'resources/app/package.json',
  'resources/app/product.json',
  'resources/app/' + pkg.main.slice(2)
])
  fingerprints[name] = sha256(await readFile(await containedFile(runtime, name)));
await mkdir(dest, { recursive: true });
const book = join(dest, 'playbook');
await mkdir(book);
const files = [];
async function add(file, bytes, role = 'asset', beforeSha256 = null) {
  const payload = String(files.length);
  await writeFile(join(book, payload), bytes, { flag: 'wx' });
  files.push({ file, payload, role, beforeSha256, afterSha256: sha256(bytes) });
}
await add(
  'package.json',
  Buffer.from(JSON.stringify({ ...pkg, main: './yoinkr-browser-bootstrap.mjs' }, null, 2) + '\n'),
  'main',
  sha256(pkgBytes)
);
await add(
  'yoinkr-browser-bootstrap.mjs',
  Buffer.from(`import './yoinkr-browser/main.cjs';\nawait import(${JSON.stringify(pkg.main)});\n`),
  'main'
);
for (const [source, role] of [
  ['main.cjs', 'main'],
  ['preload.cjs', 'preload']
]) {
  const result = await build({
    entryPoints: [join(root, 'runtime', source)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'electron-chrome-extensions/preload'],
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    legalComments: 'eof'
  });
  await add('yoinkr-browser/' + source, result.outputFiles[0].contents, role);
}
for (const name of [
  'browser.html',
  'browser.css',
  'browser.js',
  'res-context.js',
  'native-headers-prefix.cjs',
  'blocked-tab-preload.cjs'
])
  await add(
    'yoinkr-browser/' + name,
    await readFile(join(root, 'runtime', name)),
    name.endsWith('.js') ? 'renderer' : 'asset'
  );
const compatibilityPreload = await readFile(
  join(root, 'node_modules/electron-chrome-extensions/dist/chrome-extension-api.preload.js')
);
await add(
  'yoinkr-browser/chrome-extension-api.preload.js',
  Buffer.concat([
    await readFile(join(root, 'runtime/native-headers-prefix.cjs')),
    Buffer.from('\n'),
    compatibilityPreload,
    Buffer.from('\n'),
    await readFile(join(root, 'runtime/blocked-tab-preload.cjs'))
  ]),
  'preload'
);
await add('yoinkr-browser/source/compatibility-preload.original.js', compatibilityPreload);
await add('yoinkr-browser/uBlock.zip', archive);
for (const [key, bytes] of addonArchives) await add('yoinkr-browser/' + key + '.zip', bytes);
await add('yoinkr-browser/THIRD_PARTY_NOTICES.md', await readFile(join(root, 'THIRD_PARTY_NOTICES.md')));
for (const name of [
  'main.cjs',
  'preload.cjs',
  'policy.cjs',
  'session-store.cjs',
  'res-context.js',
  'native-headers-prefix.cjs',
  'blocked-tab-preload.cjs',
  'browser.html',
  'browser.css',
  'browser.js'
])
  await add('yoinkr-browser/source/runtime/' + name, await readFile(join(root, 'runtime', name)));
for (const name of [
  'recipe.json',
  'package.json',
  'package-lock.json',
  'build.mjs',
  'acquire.mjs',
  'verify.mjs',
  'verify-plugins.mjs',
  'audit-firefox.mjs',
  'README.md',
  'FIREFOX_UBLOCK_PLAN.md',
  'THIRD_PARTY_NOTICES.md'
])
  await add('yoinkr-browser/source/' + name, await readFile(join(root, name)));
await add('yoinkr-browser/source/LICENSE', await readFile(join(root, '../../LICENSE')));
for (const name of ['debug', 'ms'])
  await add(
    'yoinkr-browser/' + name + '-LICENSE',
    await readFile(join(root, 'node_modules', name, name === 'ms' ? 'license.md' : 'LICENSE'))
  );
for (const name of ['LICENSE.md', 'LICENSE-GPL'])
  await add(
    'yoinkr-browser/compatibility-' + name,
    await readFile(join(root, 'node_modules/electron-chrome-extensions', name))
  );
await add('yoinkr-browser/fflate-LICENSE', await readFile(join(root, 'node_modules/fflate/LICENSE')));
const playbook = {
  schema: 1,
  kind: 'electron-playbook',
  id: recipe.id,
  target: { app: 'resources/app', name: pkg.name, version: pkg.version, main: pkg.main, type: pkg.type },
  files
};
await saveJson(join(book, 'playbook.json'), playbook);
await saveJson(join(dest, 'PLAN.json'), await planElectronPlaybook(runtime, join(book, 'playbook.json')));
await applyElectronPlaybook(runtime, join(book, 'playbook.json'), join(dest, 'workspace'));
const outputs = { ...fingerprints };
for (const file of files) outputs['resources/app/' + file.file] = file.afterSha256;
await saveJson(join(dest, 'BUILD.json'), {
  schema: 1,
  marker: recipe.id,
  recipe,
  hostVersion: pkg.version,
  input: runtime,
  inputFingerprints: fingerprints,
  outputs,
  verification: 'not-run'
});
await writeFile(join(dest, 'launch.mjs'), await readFile(join(root, 'launch-generated.mjs')), { flag: 'wx' });
await writeFile(
  join(dest, 'launch-code.sh'),
  '#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$ROOT/launch.mjs" "$@"\n',
  { flag: 'wx', mode: 0o755 }
);
console.log(
  `Built a separate VS Code ${pkg.version} copy with original uBlock Origin ${recipe.version}.\n${join(dest, 'launch-code.sh')}\nOpen Yoinkr browser → Open research browser (Ctrl+Alt+R).`
);
