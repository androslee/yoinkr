import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorkbench } from '../../src/workbench.js';
import { libraryFixture } from '../general/fixtures/library.mjs';
const project = fileURLToPath(new URL('../..', import.meta.url)),
  actual = await (await import('node:fs/promises')).realpath(join(project, 'builds')),
  out = resolve(
    process.env.YOINKR_LIBRARY_EVIDENCE ?? process.env.MODKIT_LIBRARY_EVIDENCE ?? '/tmp/yoinkr-v017-library-browser'
  );
await mkdir(out);
const f = await libraryFixture(),
  findingRoot = join(out, 'findings');
let app;
const start = async () =>
  startWorkbench({
    cases: [join(actual, 'native-plot-v0.13/case-bounded')],
    knowledgeRoots: [actual, f.records],
    findingRoot,
    caseRoot: join(out, 'new-cases'),
    reportRoot: join(out, 'reports'),
    port: 0
  });
app = await start();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'),
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks = [],
  requests = [],
  errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await page.goto(app.url);
  await page.locator('#connection').filter({ hasText: 'Local service ready' }).waitFor();
  await page.locator('#library-toggle').click();
  await page.locator('#library-status').filter({ hasText: 'matching records' }).waitFor();
  const search = async (query, kind = '', status = '') => {
    await page.fill('#library-query', query);
    await page.selectOption('#library-kind', kind);
    await page.selectOption('#library-outcome', status);
    await page.locator('#library-search button[type=submit]').click();
    await page.locator('#library-status').filter({ hasText: 'matching records' }).waitFor();
  };
  const api = async path => (await fetch(app.url + path, { headers: { 'X-Yoinkr-Token': app.boot.token } })).json();
  await search('zlib-native-integrity', 'verification', 'passed');
  const native = (
    await api('/api/library/search?query=zlib-native-integrity&kind=verification&status=passed')
  ).items.find(d => d.path.startsWith(join(actual, 'native-component-v0.16/workspace')));
  assert.ok(native);
  const nativeCard = page.locator('[data-document-id="' + native.id + '"]');
  await nativeCard.getByRole('button', { name: 'View source record' }).click();
  await page.locator('#library-text').filter({ hasText: 'native-component-verification' }).waitFor();
  assert.match(
    await page.locator('#library-level').innerText(),
    /Recorded native comparison; current inputs not reverified/
  );
  await page.screenshot({ path: join(out, 'native-search.png'), fullPage: false });
  checks.push(
    'Browser searches actual retained native comparisons across registered roots, filters recorded passes and opens the exact source record with its hash and evidence level'
  );
  await nativeCard.getByRole('button', { name: 'Add citation' }).click();
  await page.fill('#finding-title', 'Acceptance example: reuse the reviewed native profile');
  await page.fill(
    '#finding-body',
    'Browser acceptance demonstration: use the fixed ABI and keep the complete library. This authored note cites a past check, not a fresh verification. Literal <script>globalThis.bad=1</script>.'
  );
  await page.fill('#finding-tags', 'native, zlib');
  await page.locator('#finding-save').click();
  await page.locator('#library-status').filter({ hasText: 'Saved an immutable manual finding' }).waitFor();
  assert.match(await page.locator('#library-level').innerText(), /manual/);
  assert.match(await page.locator('#library-citations').innerText(), /matches-saved-citation/);
  checks.push(
    'A reusable finding is saved as manual text with the selected native record hash and a matching citation'
  );
  await search('isolated preload', 'note');
  const note = (await api('/api/library/search?query=isolated%20preload&kind=note')).items.find(
    d => d.directory === f.cases[0]
  );
  assert.ok(note);
  await page
    .locator('[data-document-id="' + note.id + '"]')
    .getByRole('button', { name: 'Add citation' })
    .click();
  await page.fill('#finding-title', 'Acceptance example: stale note protection');
  await page.fill('#finding-body', 'Do not silently rebind a conclusion when its source changes.');
  const original = await readFile(note.path, 'utf8');
  await writeFile(note.path, original + '\nA changed revision.\n');
  await page.locator('#finding-save').click();
  await page.locator('#library-status').filter({ hasText: 'record changed' }).waitFor();
  await page.locator('#library-refresh').click();
  await page.locator('#library-status').filter({ hasText: 'matching records' }).waitFor();
  await page.locator('#finding-save').click();
  await page.locator('#library-status').filter({ hasText: 'changed since selection' }).waitFor();
  checks.push(
    'Changed source text blocks saving both before and after refresh; old citation selections are never silently rebound'
  );
  await page.locator('#finding-citations button').click();
  await search('isolated preload', 'note');
  const fresh = (await api('/api/library/search?query=isolated%20preload&kind=note')).items.find(
    d => d.directory === f.cases[0]
  );
  await page
    .locator('[data-document-id="' + fresh.id + '"]')
    .getByRole('button', { name: 'Add citation' })
    .click();
  await page.locator('#finding-save').click();
  await page.locator('#library-status').filter({ hasText: 'Saved an immutable manual finding' }).waitFor();
  checks.push('After explicit review/reselection, the same finding can cite the new source revision');
  await search('verified', 'note', 'manual');
  const prose = (await api('/api/library/search?query=verified&kind=note&status=manual')).items.find(
    d => d.directory === f.cases[1]
  );
  assert.ok(prose);
  await page
    .locator('[data-document-id="' + prose.id + '"]')
    .getByRole('button', { name: 'View source record' })
    .click();
  await page.locator('#library-text').filter({ hasText: '<img src=x' }).waitFor();
  assert.equal(await page.locator('#library-text img').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.bad), undefined);
  assert.match(await page.locator('#library-level').innerText(), /manual/);
  checks.push('Prose claiming verification stays manual, and HTML/script-like notes remain inert text');
  const cases = (await api('/api/library/search?kind=case&limit=50')).items,
    prior = cases.find(d => d.directory === join(actual, 'document-ui-v0.12/case'));
  assert.ok(prior);
  await search('', 'case');
  if (!(await page.locator('[data-document-id="' + prior.id + '"]').count())) {
    await page.locator('#library-next').click();
    await page.locator('#library-status').filter({ hasText: 'matching records' }).waitFor();
  }
  await page
    .locator('[data-document-id="' + prior.id + '"]')
    .getByRole('button', { name: 'View source record' })
    .click();
  await page.locator('#library-title').filter({ hasText: prior.title }).waitFor();
  await page.locator('#library-reuse').click();
  await page.locator('#library-status').filter({ hasText: 'Investigation form filled' }).waitFor();
  assert.equal(
    await page.locator('#feature').inputValue(),
    JSON.parse(await readFile(join(prior.directory, 'case.json'))).feature
  );
  assert.equal((await api('/api/state')).jobs.length, 0);
  checks.push(
    'An actual unregistered earlier case is fully validated, opened and reused to fill a new investigation without starting analysis or executing an application'
  );
  const persisted = await api('/api/library/search?kind=finding');
  assert.equal(persisted.total, 2);
  await app.close();
  app = await start();
  await page.goto(app.url);
  await page.locator('#connection').filter({ hasText: 'Local service ready' }).waitFor();
  await page.locator('#library-toggle').click();
  await search('Acceptance example', 'finding', 'manual');
  assert.equal(await page.locator('.library-card').count(), 2);
  const nativeFinding = (await api('/api/library/search?query=reviewed&kind=finding')).items[0];
  await page
    .locator('[data-document-id="' + nativeFinding.id + '"]')
    .getByRole('button', { name: 'View source record' })
    .click();
  await page.locator('#library-citations').filter({ hasText: 'matches-saved-citation' }).waitFor();
  await page.screenshot({ path: join(out, 'saved-finding.png'), fullPage: true });
  checks.push('Findings and exact citation identities survive a workbench restart and remain searchable');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(u => /^http:\/\/127\.0\.0\.1:\d+\//.test(u)));
  await writeFile(
    join(out, 'VERIFICATION.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        requests,
        findingRoot,
        fixtureRoot: f.root,
        realRoots: actual,
        scope:
          'Actual retained Yoinkr cases/native comparisons plus a labelled tiny fixture for stale-source and injection checks. Browser-authored findings are acceptance demonstrations, not new automated proof.'
      },
      null,
      2
    )
  );
  console.log('PRIOR WORK LIBRARY BROWSER CHECKS PASSED:', checks.length);
  console.log('Evidence:', out);
} finally {
  await browser.close();
  await app.close();
}
