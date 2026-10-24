import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256, saveJson } from '../../src/workspace.js';
import { conversionStatus, runConversion } from '../../src/conversion.js';
const root = resolve(process.argv[2] ?? 'builds/converters-v0.15'),
  out = resolve(process.argv[3] ?? join(root, 'acceptance'));
await mkdir(out, { recursive: true });
const demo = JSON.parse(await readFile(join(root, 'SHOWCASE.json'))),
  report = JSON.parse(await readFile(join(demo.run, 'CONVERSION.json'))),
  { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'),
  checks = [];
// Independent oracle for the shipped installed assets: these files are strict JSON.
const theme = async file => {
  const data = JSON.parse(await readFile(join(demo.run, 'inputs', file), 'utf8'));
  return {
    ...(data.include ? await theme(posix.normalize(posix.join(posix.dirname(file), data.include))) : {}),
    ...data.colors
  };
};
for (const o of report.outputs.filter(o => o.kind === 'vscode-theme-css')) {
  const colors = await theme(o.input);
  for (const m of o.details.mapped) if (m.source !== null) assert.equal(m.value, colors[m.key]);
  assert.equal(sha256(await readFile(join(demo.run, o.path))), o.sha256);
}
checks.push(
  'Both converted palettes match an independent inherited-theme oracle over the original installed VS Code files'
);
const original = JSON.parse(
    await readFile(join(demo.run, 'inputs/extensions/javascript/snippets/javascript.code-snippets'))
  ),
  templates = JSON.parse(await readFile(join(demo.run, 'outputs/templates/javascript.json'))).snippets;
assert.equal(templates.length, Object.keys(original).length);
for (const row of templates) {
  const source = original[row.name];
  assert.equal(row.body, Array.isArray(source.body) ? source.body.join('\n') : source.body);
  assert.deepEqual(row.prefixes, [...new Set(Array.isArray(source.prefix) ? source.prefix : [source.prefix])]);
}
checks.push('Every converted JavaScript template preserves donor prefixes and full literal body');
assert.equal((await conversionStatus(demo.run)).clean, true);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
    errors = [],
    requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.goto(pathToFileURL(demo.preview).href);
  await page.locator('#theme option').nth(1).waitFor({ state: 'attached' });
  const dark = await theme('extensions/theme-defaults/themes/dark_modern.json'),
    light = await theme('extensions/theme-defaults/themes/light_modern.json');
  const rgb = hex => {
    const v = hex.slice(1);
    return `rgb(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)})`;
  };
  await page.waitForFunction(
    expected => getComputedStyle(document.body).backgroundColor === expected,
    rgb(dark['editor.background'])
  );
  await page.screenshot({ path: join(out, 'dark-recipient.png'), fullPage: true });
  await page.selectOption('#theme', 'light-modern');
  await page.waitForFunction(
    expected => getComputedStyle(document.body).backgroundColor === expected,
    rgb(light['editor.background'])
  );
  checks.push(
    'Standalone recipient actually loads each converted CSS file and switches between the donor dark/light backgrounds'
  );
  await page.fill('#search', 'Log to the console');
  await page.locator('#templates button').filter({ hasText: 'Log to the console [' }).click();
  await page.locator('#insert').click();
  const expected = original['Log to the console'].body.join('\n');
  assert.equal(await page.locator('#editor').inputValue(), expected);
  assert.match(await page.locator('#insert-status').innerText(), /placeholders were preserved/);
  await page.screenshot({ path: join(out, 'light-recipient.png'), fullPage: true });
  checks.push('Recipient searches converted templates and inserts the exact donor template including placeholders');
  const scratch = await mkdtemp(join(out, 'inert-')),
    fixture = join(scratch, 'inputs');
  await mkdir(fixture);
  const malicious = {
      name: '</script><img src="https://example.invalid/" onerror="globalThis.pwned=1">',
      body: '</script><script>globalThis.pwned=1</script>\n${1:literal}$0'
    },
    source = JSON.stringify({
      [malicious.name]: { prefix: 'hostile', body: malicious.body, description: 'literal text' }
    });
  await writeFile(join(fixture, 'snippets.json'), source);
  await saveJson(join(fixture, 'recipe.json'), {
    schema: 1,
    kind: 'asset-conversion',
    id: 'inert-preview',
    inputs: [{ file: 'snippets.json', sha256: sha256(source), role: 'source' }],
    transforms: [{ id: 'templates', kind: 'vscode-snippets-json', input: 'snippets.json', output: 'templates.json' }]
  });
  const inert = await runConversion(join(fixture, 'recipe.json'), fixture, join(scratch, 'run'));
  await page.goto(pathToFileURL(join(inert.directory, 'preview.html')).href);
  await page.locator('#templates button').click();
  await page.locator('#insert').click();
  assert.equal(await page.locator('#editor').inputValue(), malicious.body);
  assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
  assert.equal(await page.locator('img').count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(u => u.startsWith('file:')));
  checks.push('Hostile HTML/script-like template content stays inert and both previews make zero network requests');
  for (const input of report.inputs)
    assert.equal(sha256(await readFile(join(demo.donor.path, input.file))), input.sha256);
  checks.push(
    'All source application assets remain unchanged; originals and license are retained in the conversion run'
  );
  await writeFile(
    join(out, 'VERIFICATION.json'),
    JSON.stringify(
      {
        version: '0.15.0',
        passed: true,
        checks,
        templateCount: templates.length,
        errors,
        requests,
        preview: demo.preview,
        scope: demo.scope
      },
      null,
      2
    )
  );
  console.log('CONVERTER RECIPIENT CHECKS PASSED:', checks.length);
} finally {
  await browser.close();
}
