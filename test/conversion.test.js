import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseJSONC, convertAsset } from '../src/converters.js';
import { planConversion, runConversion, conversionStatus, validateConversionRecipe } from '../src/conversion.js';
import { sha256 } from '../src/workspace.js';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'yoinkr-convert-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source'),
    book = join(dir, 'book'),
    out = join(dir, 'run');
  await mkdir(source);
  await mkdir(book);
  const raw = {
    'base.json': JSON.stringify({
      colors: { 'editor.background': '#123456', 'editor.foreground': '#abc', focusBorder: '#246' }
    }),
    'theme.json': '{"include":"./base.json","colors":{"button.background":"#fedcba"},}',
    'snippets.json': JSON.stringify({
      'Unsafe <script>': {
        prefix: ['log', 'print'],
        body: ['// literal $0', 'console.log("<script>");'],
        description: 'Template'
      }
    }),
    'LICENSE.txt': 'example license'
  };
  const recipe = {
    schema: 1,
    kind: 'asset-conversion',
    id: 'fixture',
    inputs: [],
    transforms: [
      { id: 'theme', kind: 'vscode-theme-css', input: 'theme.json', output: 'theme.css' },
      { id: 'templates', kind: 'vscode-snippets-json', input: 'snippets.json', output: 'templates.json' }
    ]
  };
  for (const [file, text] of Object.entries(raw)) {
    await writeFile(join(source, file), text);
    recipe.inputs.push({ file, sha256: sha256(text), role: file === 'LICENSE.txt' ? 'license' : 'source' });
  }
  const file = join(book, 'recipe.json'),
    save = () => writeFile(file, JSON.stringify(recipe));
  await save();
  return { dir, source, book, out, raw, recipe, file, save };
}
test('JSONC supports BOM, comments and trailing commas while preserving comment-like string content', () => {
  assert.deepEqual(
    parseJSONC('\ufeff{/* hello */"url":"https://x//y",//comment\n"s":"/* not comment */", "array":[1,2,],}'),
    { url: 'https://x//y', s: '/* not comment */', array: [1, 2] }
  );
  for (const text of ['{/*missing', '{"a":1,,}', '{"s":"unterminated}', '[1 2]']) assert.throws(() => parseJSONC(text));
});
test('theme includes are pinned, inherited and attributed; unknown tokens and fallbacks are explicit', () => {
  const inputs = new Map([
    ['base.json', '{"colors":{"editor.background":"#ABCDEF","editor.foreground":"#FFF","unused":"red"}}'],
    ['child.json', '{"include":"./base.json","colors":{"editor.foreground":"#123"}}']
  ]);
  const r = convertAsset('vscode-theme-css', 'child.json', inputs);
  assert.match(r.bytes.toString(), /--mk-background: #abcdef/);
  assert.deepEqual(r.dependencies, ['base.json', 'child.json']);
  assert.equal(r.details.mapped.find(m => m.key === 'editor.background').source, 'base.json');
  assert.equal(r.details.mapped.find(m => m.key === 'editor.foreground').source, 'child.json');
  assert.ok(r.details.unmappedKeys.includes('unused'));
  assert.equal(r.details.fallbacks.length, 5);
});
test('theme refuses cycles, unpinned includes, escape paths, remote includes and CSS injection', () => {
  for (const [text, error] of [
    ['{"include":"other.json"}', /not pinned/],
    ['{"include":"../outside.json"}', /relative/],
    ['{"include":"https://evil/x"}', /include/],
    ['{"include":"a.json"}', /cycle/],
    ['{"colors":{"editor.background":"red; background:url(https://evil)"}}', /color/]
  ])
    assert.throws(() => convertAsset('vscode-theme-css', 'a.json', new Map([['a.json', text]])), error);
});
test('snippet text, multiline bodies, prefix lists and placeholders survive without expansion', () => {
  const r = convertAsset(
    'vscode-snippets-json',
    'a.json',
    new Map([
      [
        'a.json',
        JSON.stringify({
          Template: {
            prefix: ['x', 'x', 'y'],
            body: ['${1:name}', '$TM_SELECTED_TEXT$0'],
            description: ['line 1', 'line 2'],
            isFileTemplate: true,
            custom: 1
          }
        })
      ]
    ])
  );
  const s = JSON.parse(r.bytes).snippets[0];
  assert.deepEqual(s.prefixes, ['x', 'y']);
  assert.equal(s.body, '${1:name}\n$TM_SELECTED_TEXT$0');
  assert.equal(s.description, 'line 1\nline 2');
  assert.equal(s.fileTemplate, true);
  assert.deepEqual(r.details.ignoredFields, [{ name: 'Template', field: 'custom' }]);
});
test('invalid snippet structures and unknown converters are refused', () => {
  for (const s of [
    { prefix: 3, body: 'x' },
    { prefix: [], body: 'x' },
    { prefix: 'x', body: [1] },
    { prefix: 'x', body: 'x', isFileTemplate: 'yes' }
  ])
    assert.throws(() => convertAsset('vscode-snippets-json', 'a', new Map([['a', JSON.stringify({ bad: s })]])));
  assert.throws(() => convertAsset('execute', 'a', new Map([['a', '{}']])), /unsupported/);
});
test('plan is read-only, conversion is deterministic, retained originals and dependency hashes match', async t => {
  const x = await fixture(t),
    p = await planConversion(x.file, x.source);
  await assert.rejects(stat(x.out), { code: 'ENOENT' });
  assert.equal(p.executesDonorCode, false);
  const run = await runConversion(x.file, x.source, x.out);
  assert.equal((await conversionStatus(x.out)).clean, true);
  assert.equal(run.converter.files.length, 3);
  for (const i of run.inputs) {
    assert.equal(await readFile(join(x.out, 'inputs', i.file), 'utf8'), x.raw[i.file]);
  }
  for (const [i, o] of run.outputs.entries()) assert.equal(o.sha256, p.outputs[i].sha256);
  assert.deepEqual(
    run.outputs[0].inputHashes.map(i => i.file),
    ['base.json', 'theme.json']
  );
  assert.equal(sha256(await readFile(join(x.out, 'preview.html'))), p.preview.sha256);
  await runConversion(x.file, x.source, join(x.dir, 'second'));
  assert.deepEqual(
    await readFile(join(x.out, 'outputs/templates.json')),
    await readFile(join(x.dir, 'second/outputs/templates.json'))
  );
});
test('changed originals, bad recipes and occupied outputs never overwrite existing content', async t => {
  const x = await fixture(t);
  await writeFile(join(x.source, 'theme.json'), '{}');
  await assert.rejects(runConversion(x.file, x.source, x.out), /hash differs/);
  await assert.rejects(stat(x.out), { code: 'ENOENT' });
  await writeFile(join(x.source, 'theme.json'), x.raw['theme.json']);
  await mkdir(x.out);
  await writeFile(join(x.out, 'keep'), 'safe');
  await assert.rejects(runConversion(x.file, x.source, x.out), { code: 'EEXIST' });
  assert.equal(await readFile(join(x.out, 'keep'), 'utf8'), 'safe');
  await assert.rejects(runConversion(x.file, x.source, join(x.source, 'nested')), /outside/);
});
test('status detects modified outputs, missing previews and changed retained inputs', async t => {
  const x = await fixture(t);
  await runConversion(x.file, x.source, x.out);
  await writeFile(join(x.out, 'outputs/templates.json'), '{}');
  assert.equal((await conversionStatus(x.out)).clean, false);
  await rm(join(x.out, 'preview.html'));
  const r = await conversionStatus(x.out);
  assert.equal(r.files.find(f => f.path === 'preview.html').actual, null);
  await writeFile(join(x.out, 'inputs/base.json'), '{}');
  assert.equal((await conversionStatus(x.out)).files.find(f => f.path === 'inputs/base.json').clean, false);
});
test('symlink inputs/outputs, traversal, duplicate paths and unpinned sources are rejected', async t => {
  const x = await fixture(t);
  await rm(join(x.source, 'theme.json'));
  await symlink(join(x.source, 'base.json'), join(x.source, 'theme.json'));
  await assert.rejects(planConversion(x.file, x.source), /non-ordinary/);
  for (const tweak of [
    r => (r.inputs[0].file = '../x'),
    r => (r.transforms[0].output = '../../evil.css'),
    r => (r.transforms[1].output = r.transforms[0].output),
    r => r.inputs.push(r.inputs[0]),
    r => (r.transforms[0].input = 'unknown'),
    r => (r.transforms[0].kind = 'shell'),
    r => (r.hook = 'anything')
  ]) {
    const r = structuredClone(x.recipe);
    tweak(r);
    assert.throws(() => validateConversionRecipe(r));
  }
});
test('byte bounds, excessive transforms and unrecognized recipe fields fail', async t => {
  const x = await fixture(t);
  const r = structuredClone(x.recipe);
  r.transforms = Array(17).fill(r.transforms[0]);
  assert.throws(() => validateConversionRecipe(r));
  await writeFile(join(x.source, 'theme.json'), ' '.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(planConversion(x.file, x.source), /size limit/);
});
test('status refuses a redirected output rather than reading outside the retained run', async t => {
  const x = await fixture(t);
  await runConversion(x.file, x.source, x.out);
  const file = join(x.out, 'outputs/templates.json');
  await rm(file);
  await symlink(join(x.source, 'snippets.json'), file);
  await assert.rejects(conversionStatus(x.out), /non-ordinary/);
});
test('inherited themes have a finite depth limit', () => {
  const inputs = new Map();
  for (let i = 0; i < 10; i++) inputs.set(i + '.json', JSON.stringify({ include: i + 1 + '.json' }));
  assert.throws(() => convertAsset('vscode-theme-css', '0.json', inputs), /depth/);
});
