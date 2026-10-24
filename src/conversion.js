import { readFile, writeFile, mkdir, lstat, realpath, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRelative } from './research.js';
import { sha256, inside, newDestination, saveJson } from './workspace.js';
import { converterKinds, converterVersion, convertAsset } from './converters.js';
import { conversionPreview } from './conversion-preview.js';
const digest = /^[a-f0-9]{64}$/;
const id = x => typeof x === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(x);
function exact(o, fields) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !fields.includes(k)))
    throw Error('unsupported conversion fields');
}
function pathName(s) {
  safeRelative(s);
  if (s.length > 600 || s.includes('\0')) throw Error('invalid conversion path');
  return s;
}
function unique(names) {
  const seen = [];
  for (const n of names) {
    pathName(n);
    if (seen.some(p => p === n || p.startsWith(n + '/') || n.startsWith(p + '/')))
      throw Error('duplicate or overlapping conversion paths');
    seen.push(n);
  }
}
export function validateConversionRecipe(r) {
  exact(r, ['schema', 'kind', 'id', 'inputs', 'transforms']);
  if (r.schema !== 1 || r.kind !== 'asset-conversion' || !id(r.id))
    throw Error('expected schema 1 asset-conversion with id');
  if (!Array.isArray(r.inputs) || !r.inputs.length || r.inputs.length > 32)
    throw Error('conversion requires 1–32 pinned inputs');
  for (const f of r.inputs) {
    exact(f, ['file', 'sha256', 'role']);
    pathName(f.file);
    if (!digest.test(f.sha256) || !['source', 'license', 'metadata'].includes(f.role))
      throw Error('input requires hash and source/license/metadata role');
  }
  unique(r.inputs.map(f => f.file));
  if (!Array.isArray(r.transforms) || !r.transforms.length || r.transforms.length > 16)
    throw Error('conversion requires 1–16 transforms');
  const ids = new Set();
  for (const t of r.transforms) {
    exact(t, ['id', 'kind', 'input', 'output']);
    if (!id(t.id) || ids.has(t.id) || !converterKinds.includes(t.kind)) throw Error('unsupported/duplicate converter');
    ids.add(t.id);
    pathName(t.input);
    pathName(t.output);
    if (!r.inputs.some(f => f.file === t.input && f.role === 'source'))
      throw Error('transform needs a pinned source input');
    if (!t.output.endsWith(t.kind === 'vscode-theme-css' ? '.css' : '.json'))
      throw Error('converter output extension differs');
  }
  unique(r.transforms.map(t => t.output));
  return r;
}
async function ordinary(root, name, maxBytes = 4 * 1024 * 1024) {
  pathName(name);
  let file = root;
  const pieces = name.split('/');
  for (let i = 0; i < pieces.length; i++) {
    file = join(file, pieces[i]);
    const s = await lstat(file);
    if (s.isSymbolicLink() || (i < pieces.length - 1 ? !s.isDirectory() : !s.isFile()))
      throw Error('non-ordinary conversion file: ' + name);
    if (i === pieces.length - 1 && s.size > maxBytes) throw Error('conversion file exceeds size limit');
  }
  return readFile(file);
}
async function implementation() {
  const files = ['converters.js', 'conversion.js', 'conversion-preview.js'],
    result = [];
  for (const file of files)
    result.push({ file, sha256: sha256(await readFile(fileURLToPath(new URL(file, import.meta.url)))) });
  return { version: converterVersion, files: result };
}
async function prepare(recipeFile, inputRoot) {
  const file = await realpath(resolve(recipeFile)),
    source = await realpath(resolve(inputRoot));
  if (!(await lstat(source)).isDirectory()) throw Error('input root must be a directory');
  const recipeBytes = await ordinary(dirname(file), basename(file)),
    recipe = validateConversionRecipe(JSON.parse(recipeBytes));
  const retained = [],
    inputs = new Map();
  let total = 0;
  for (const f of recipe.inputs) {
    const bytes = await ordinary(source, f.file);
    if (sha256(bytes) !== f.sha256) throw Error('source hash differs: ' + f.file);
    total += bytes.length;
    if (total > 16 * 1024 * 1024) throw Error('conversion inputs exceed 16 MiB');
    retained.push({ ...f, bytes });
    if (f.role === 'source') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      inputs.set(f.file, text);
    }
  }
  const outputs = [];
  total = 0;
  for (const t of recipe.transforms) {
    const result = convertAsset(t.kind, t.input, inputs);
    total += result.bytes.length;
    if (result.bytes.length > 4 * 1024 * 1024 || total > 16 * 1024 * 1024)
      throw Error('converted outputs exceed limit');
    outputs.push({
      ...t,
      ...result,
      path: 'outputs/' + t.output,
      sha256: sha256(result.bytes),
      inputHashes: result.dependencies.map(file => ({ file, sha256: recipe.inputs.find(f => f.file === file).sha256 }))
    });
  }
  const preview = conversionPreview(recipe.id, outputs);
  if (preview.length > 8 * 1024 * 1024) throw Error('recipient preview exceeds 8 MiB');
  return { file, source, recipe, recipeBytes, retained, outputs, preview, converter: await implementation() };
}
function plan(x) {
  return {
    schema: 1,
    kind: 'asset-conversion-plan',
    id: x.recipe.id,
    source: x.source,
    recipeSha256: sha256(x.recipeBytes),
    converter: x.converter,
    inputs: x.retained.map(({ bytes, ...f }) => ({ ...f, bytes: bytes.length })),
    outputs: x.outputs.map(({ bytes, ...o }) => ({ ...o, bytes: bytes.length })),
    unusedInputs: x.retained
      .filter(f => f.role === 'source' && !x.outputs.some(o => o.dependencies.includes(f.file)))
      .map(f => f.file),
    preview: { path: 'preview.html', sha256: sha256(x.preview), bytes: x.preview.length },
    executesDonorCode: false
  };
}
export async function planConversion(recipeFile, inputRoot) {
  return plan(await prepare(recipeFile, inputRoot));
}
export async function runConversion(recipeFile, inputRoot, out) {
  const x = await prepare(recipeFile, inputRoot),
    dest = await newDestination(out, [x.source, dirname(x.file)]);
  if (inside(dest, x.source) || inside(dest, x.file)) throw Error('conversion output cannot contain inputs');
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest, { mode: 0o700 });
  try {
    const artifacts = [];
    const save = async (path, bytes, role) => {
      await mkdir(dirname(join(dest, path)), { recursive: true });
      await writeFile(join(dest, path), bytes, { flag: 'wx', mode: 0o600 });
      artifacts.push({ path, role, sha256: sha256(bytes), bytes: bytes.length });
    };
    await save('recipe.json', x.recipeBytes, 'recipe');
    for (const f of x.retained) await save('inputs/' + f.file, f.bytes, f.role);
    for (const o of x.outputs) await save(o.path, o.bytes, 'output');
    await save('preview.html', x.preview, 'recipient-preview');
    const report = {
      ...plan(x),
      kind: 'asset-conversion-run',
      createdAt: new Date().toISOString(),
      directory: dest,
      artifacts
    };
    if (Buffer.byteLength(JSON.stringify(report, null, 2) + '\n') > 4 * 1024 * 1024)
      throw Error('conversion metadata exceeds 4 MiB');
    await saveJson(join(dest, 'CONVERSION.json'), report);
    return report;
  } catch (e) {
    await rm(dest, { recursive: true, force: true });
    throw e;
  }
}
export async function conversionStatus(directory) {
  const root = await realpath(resolve(directory)),
    bytes = await ordinary(root, 'CONVERSION.json'),
    report = JSON.parse(bytes);
  if (
    report.schema !== 1 ||
    report.kind !== 'asset-conversion-run' ||
    !Array.isArray(report.artifacts) ||
    report.artifacts.length > 64 ||
    !report.artifacts.length
  )
    throw Error('invalid conversion run');
  const recipeBytes = await ordinary(root, 'recipe.json'),
    recipe = validateConversionRecipe(JSON.parse(recipeBytes));
  if (sha256(recipeBytes) !== report.recipeSha256 || recipe.id !== report.id)
    throw Error('retained conversion recipe differs');
  const expected = new Map([
    ['recipe.json', 'recipe'],
    ['preview.html', 'recipient-preview'],
    ...recipe.inputs.map(f => ['inputs/' + f.file, f.role]),
    ...recipe.transforms.map(t => ['outputs/' + t.output, 'output'])
  ]);
  if (expected.size !== report.artifacts.length) throw Error('conversion artifact list differs');
  const files = [];
  for (const f of report.artifacts) {
    if (!expected.has(f.path) || f.role !== expected.get(f.path) || !digest.test(f.sha256))
      throw Error('invalid conversion artifact record');
    expected.delete(f.path);
    let actual = null;
    try {
      actual = sha256(await ordinary(root, f.path, f.path === 'preview.html' ? 8 * 1024 * 1024 : 4 * 1024 * 1024));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const input = recipe.inputs.find(i => 'inputs/' + i.file === f.path),
      bound =
        input?.sha256 ??
        (f.path === 'recipe.json'
          ? report.recipeSha256
          : f.path === 'preview.html'
            ? report.preview?.sha256
            : report.outputs?.find(o => o.path === f.path)?.sha256);
    if (bound !== f.sha256) throw Error('conversion provenance differs');
    files.push({ path: f.path, expected: f.sha256, actual, clean: actual === f.sha256 });
  }
  return { directory: root, id: report.id, clean: files.every(f => f.clean), files };
}
