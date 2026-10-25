/** Pinned source slices. Generated donor code stays in private build outputs. */
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse } from '@babel/parser';
import { sha256, containedFile, newDestination, saveJson } from './workspace.js';
const canonical = x => JSON.stringify(x);
const recipeURL = id => new URL('../recipes/' + id + '/recovery.json', import.meta.url);
export async function sourceRecipe(id) {
  if (!['element-search', 'gimp-smoothing'].includes(id)) throw Error('Unknown source slice');
  return JSON.parse(await readFile(recipeURL(id)));
}
async function walk(root, base = '') {
  const result = [];
  for (const e of await readdir(join(root, base), { withFileTypes: true })) {
    const p = base ? base + '/' + e.name : e.name,
      s = await lstat(join(root, p));
    if (s.isSymbolicLink()) throw Error('Slice symlink refused');
    if (s.isDirectory()) result.push(...(await walk(root, p)));
    else if (s.isFile()) result.push(p);
    else throw Error('Non-ordinary slice entry');
    if (result.length > 100) throw Error('Slice file limit');
  }
  return result.sort();
}
export async function verifySourceSlice(directory, id) {
  const root = await realpath(directory),
    raw = await readFile(await containedFile(root, 'FEATURE.json'));
  if (raw.length > 128 * 1024) throw Error('Manifest too large');
  const m = JSON.parse(raw),
    { digest, ...semantic } = m;
  if (
    m.schema !== 1 ||
    m.kind !== 'modkit-source-slice' ||
    m.id !== id ||
    !Array.isArray(m.files) ||
    m.files.length > 100 ||
    sha256(canonical(semantic)) !== digest
  )
    throw Error('Invalid slice manifest');
  const files = new Set();
  let size = 0;
  for (const f of m.files) {
    if (files.has(f.path) || f.path === 'FEATURE.json') throw Error('Duplicate/reserved slice path');
    files.add(f.path);
    const b = await readFile(await containedFile(root, f.path));
    size += b.length;
    if (size > 4 * 1024 * 1024 || b.length !== f.bytes || sha256(b) !== f.sha256)
      throw Error('Changed slice file: ' + f.path);
  }
  const actual = await walk(root);
  if (actual.length !== files.size + 1 || actual.some(p => p !== 'FEATURE.json' && !files.has(p)))
    throw Error('Untracked/missing slice file');
  const recipe = await sourceRecipe(id);
  if (canonical(m.donor) !== canonical(recipe)) throw Error('Unrecognized donor revision');
  for (const f of recipe.inputs) {
    const b = await readFile(await containedFile(root, 'originals/' + f.path));
    if (sha256(b) !== f.sha256) throw Error('Donor source pin mismatch');
  }
  return { root, ...m };
}
export async function buildSourceSlice(id, source, out) {
  const donor = await realpath(source),
    recipe = await sourceRecipe(id),
    inputs = new Map();
  for (const f of recipe.inputs) {
    const s = await lstat(await containedFile(donor, f.path));
    if (s.size > 1024 * 1024) throw Error('Donor file too large');
    const b = await readFile(await containedFile(donor, f.path));
    if (sha256(b) !== f.sha256) throw Error('Pinned donor changed: ' + f.path);
    inputs.set(f.path, b);
  }
  const root = await newDestination(out, [donor]);
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root, { mode: 0o700 });
  const write = async (p, b) => {
    await mkdir(dirname(join(root, p)), { recursive: true });
    await writeFile(join(root, p), b, { flag: 'wx', mode: 0o600 });
  };
  const transforms = [];
  for (const [p, b] of inputs) await write('originals/' + p, b);
  if (id === 'element-search') {
    const path = recipe.inputs[0].path,
      source = inputs.get(path).toString('utf8'),
      ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }),
      parts = [];
    for (const name of recipe.symbols) {
      const n = ast.program.body.find(n => n.type === 'ClassDeclaration' && n.id.name === name);
      if (!n) throw Error('Missing donor class ' + name);
      const text = source.slice(n.start, n.end);
      parts.push(text);
      transforms.push({
        path,
        symbol: name,
        start: n.start,
        end: n.end,
        sha256: sha256(text),
        operation: 'exact class slice; TypeScript types erased by esbuild'
      });
    }
    const copyright = source.match(/^\/\*[\s\S]*?\*\//)?.[0];
    if (!copyright?.includes('SPDX-License-Identifier:'))
      throw Error('Missing original Element copyright/license header');
    const excerpt = copyright + '\n' + parts.join('\n\n') + '\nexport {BaseHighlighter,HtmlHighlighter};\n';
    await write('transformed/highlighter.ts', excerpt);
    const { transform } = await import('esbuild');
    const compiled = await transform(excerpt, { loader: 'ts', format: 'esm', target: 'es2022', minify: false });
    await write('payload/highlighter.js', copyright + '\n' + compiled.code);
    for (const name of ['search.js', 'panel.html', 'style.css', 'renderer.js', 'sample.json'])
      await write('payload/' + name, await readFile(new URL('./example-runtime/element/' + name, import.meta.url)));
  } else {
    const path = recipe.inputs[0].path,
      source = inputs.get(path).toString('utf8');
    const marker = 'void\ngimp_paint_core_smooth_coords (';
    const start = source.indexOf(marker);
    if (start < 0 || source.indexOf(marker, start + 1) >= 0) throw Error('GIMP function missing/ambiguous');
    const body = source.indexOf('{', start);
    let depth = 1,
      end = body + 1;
    while (depth && end < source.length) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
      end++;
    }
    if (depth) throw Error('Incomplete GIMP function');
    const excerpt = source.slice(start, end);
    transforms.push({
      path,
      symbol: recipe.symbols[0],
      start,
      end,
      sha256: sha256(excerpt),
      operation: 'exact C function slice; bounded compatibility structs/macros supplied separately'
    });
    await write('transformed/original-function.c', excerpt + '\n');
    const prefix = await readFile(new URL('./example-runtime/obs/smoothing-prefix.c', import.meta.url), 'utf8'),
      suffix = await readFile(new URL('./example-runtime/obs/smoothing-suffix.c', import.meta.url), 'utf8');
    await write(
      'payload/smoothing.c',
      '/* GPL-3.0-or-later: contains GNOME GIMP code. See originals/COPYING and TRANSFORMS.json. */\n' +
        prefix +
        '\n' +
        excerpt +
        '\n' +
        suffix
    );
    for (const name of ['smoothing.h', 'replay.c'])
      await write('payload/' + name, await readFile(new URL('./example-runtime/obs/' + name, import.meta.url)));
  }
  await write('TRANSFORMS.json', JSON.stringify(transforms, null, 2) + '\n');
  await write(
    'NOTICE.md',
    `# ${id}\n\nDonor: ${recipe.repository}, commit ${recipe.commit}.\n\n${recipe.scope}\n\nComplete acquired source and license are under originals/. Extracted source is under transformed/. Generated wrappers are Yoinkr additions. ${id === 'element-search' ? 'The original source explicitly offers AGPL-3.0-only OR GPL-3.0-only OR a commercial license. This example selects the GPL-3.0-only alternative; both acquired open-source license texts and the complete original copyright header are retained. ' : ''}Donor licensing applies to derived output; the generated package is not declared MIT. No original desktop application was executed by this build.\n`
  );
  const records = [];
  for (const p of await walk(root)) {
    const b = await readFile(join(root, p));
    records.push({ path: p, bytes: b.length, sha256: sha256(b) });
  }
  const semantic = {
    schema: 1,
    kind: 'modkit-source-slice',
    id,
    donor: recipe,
    files: records,
    originalAppAcceptance: 'not-run',
    gtkWidgetAcceptance: 'not-run',
    qtObsAcceptance: 'not-run'
  };
  await saveJson(join(root, 'FEATURE.json'), { ...semantic, digest: sha256(canonical(semantic)) });
  return verifySourceSlice(root, id);
}
