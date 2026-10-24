import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeRelative } from '../../src/research.js';
import { parseJSONC } from '../../src/converters.js';
import { planConversion, runConversion } from '../../src/conversion.js';
import { sha256, newDestination, saveJson, containedFile } from '../../src/workspace.js';
const args = process.argv.slice(2),
  get = k => {
    const i = args.indexOf(k);
    return i < 0 ? null : args[i + 1];
  };
if (!get('--out')) throw Error('use --out <new-directory> [--source /usr/share/code/resources/app]');
const source = await realpath(resolve(get('--source') ?? '/usr/share/code/resources/app')),
  out = await newDestination(get('--out'), [source]);
await mkdir(out, { mode: 0o700 });
await mkdir(join(out, 'recipe'));
const pkg = JSON.parse(await readFile(join(source, 'package.json'))),
  inputs = new Map();
async function retain(file, role) {
  if (inputs.has(file)) return;
  safeRelative(file);
  if (inputs.size >= 32) throw Error('example exceeds 32 inputs');
  const bytes = await readFile(await containedFile(source, file));
  inputs.set(file, { file, sha256: sha256(bytes), role });
}
async function theme(file, stack = new Set()) {
  if (stack.size > 8) throw Error('example theme include depth exceeds 8');
  if (stack.has(file)) throw Error('example theme cycle');
  stack.add(file);
  await retain(file, 'source');
  const data = parseJSONC(await readFile(await containedFile(source, file), 'utf8'));
  if (data.include) await theme(posix.normalize(posix.join(posix.dirname(file), data.include)), stack);
  stack.delete(file);
}
const dark = 'extensions/theme-defaults/themes/dark_modern.json',
  light = 'extensions/theme-defaults/themes/light_modern.json',
  snippets = 'extensions/javascript/snippets/javascript.code-snippets';
await theme(dark);
await theme(light);
await retain(snippets, 'source');
await retain('package.json', 'metadata');
await retain('LICENSE.rtf', 'license');
const recipe = {
  schema: 1,
  kind: 'asset-conversion',
  id: 'vscode-assets-to-scratchpad',
  inputs: [...inputs.values()],
  transforms: [
    { id: 'dark-modern', kind: 'vscode-theme-css', input: dark, output: 'themes/dark-modern.css' },
    { id: 'light-modern', kind: 'vscode-theme-css', input: light, output: 'themes/light-modern.css' },
    { id: 'javascript-templates', kind: 'vscode-snippets-json', input: snippets, output: 'templates/javascript.json' }
  ]
};
const file = join(out, 'recipe/conversion.json');
await saveJson(file, recipe);
await saveJson(join(out, 'PLAN.json'), await planConversion(file, source));
const run = await runConversion(file, source, join(out, 'run'));
await saveJson(join(out, 'SHOWCASE.json'), {
  version: '0.15.0',
  donor: { name: pkg.name, version: pkg.version, path: source, license: 'run/inputs/LICENSE.rtf' },
  recipe: file,
  run: run.directory,
  preview: join(run.directory, 'preview.html'),
  scope:
    'Local format conversion of original installed VS Code assets into a newly written standalone recipient scratchpad. No extension, VS Code code execution, TextMate engine, or snippet expansion is used.'
});
await writeFile(
  join(out, 'open-preview.sh'),
  '#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec xdg-open "$ROOT/run/preview.html"\n',
  { mode: 0o755 }
);
console.log('Prepared converter showcase:', out);
console.log('Open:', pathToFileURL(join(run.directory, 'preview.html')).href);
