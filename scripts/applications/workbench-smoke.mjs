import { verificationOutput } from '../general/verification-output.mjs';
import assert from 'node:assert/strict';
import { mkdir, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorkbench } from '../../src/workbench.js';
const project = fileURLToPath(new URL('../..', import.meta.url)),
  source = resolve(
    process.env.YOINKR_CASE ?? process.env.MODKIT_CASE ?? join(project, 'builds/feature-examples-v0.4/mqtt-case')
  ),
  out = await verificationOutput(
    'workbench',
    process.env.YOINKR_WORKBENCH_EVIDENCE ?? process.env.MODKIT_WORKBENCH_EVIDENCE
  );
await mkdir(out, { recursive: true });
const root = join(out, 'case');
await mkdir(root);
await cp(join(source, 'evidence'), join(root, 'evidence'), { recursive: true });
for (const name of ['case.json', 'FIELD-NOTE.md']) await cp(join(source, name), join(root, name));
const exportName = (await readdir(join(source, 'private'))).find(n => n.startsWith('export-'));
await cp(join(source, 'private', exportName), join(root, 'private', exportName), { recursive: true });
const second = join(out, 'second-case');
await cp(root, second, { recursive: true });
const secondRecord = JSON.parse(await readFile(join(second, 'case.json'), 'utf8'));
secondRecord.feature = 'Second explicitly registered case';
await writeFile(join(second, 'case.json'), JSON.stringify(secondRecord));
const before = await readFile(join(root, 'case.json'), 'utf8'),
  app = await startWorkbench({ cases: [root, second], port: 0, reportRoot: join(out, 'reports') }),
  { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'),
  browser = await chromium.launch({
    executablePath: process.env.YOINKR_CHROMIUM ?? process.env.MODKIT_CHROMIUM,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
    errors = [],
    requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await page.goto(app.url);
  await page.locator('#connection').filter({ hasText: 'Local service ready' }).waitFor();
  assert.equal(await page.locator('#case option').count(), 2);
  await page.locator('#case').selectOption({ label: 'Second explicitly registered case' });
  assert.match(await page.locator('#case-path').innerText(), /second-case/);
  await page.locator('#case').selectOption({ index: 0 });
  checks.push('Actual browser selects explicitly registered cases in the dark local workbench');
  const completed = async n => {
    await page.waitForFunction(
      n =>
        document.querySelectorAll('.job').length === n &&
        document.querySelector('.job strong')?.textContent.includes('complete'),
      n,
      { timeout: 30000 }
    );
  };
  await page.locator('#view').selectOption('modules');
  await page.locator('#paths').fill('backend/src/Model/TreeNode.ts');
  await page.locator('#limit').fill('3');
  await page.locator('#run').click();
  await completed(1);
  assert.match(await page.locator('#result').innerText(), /source_coverage/);
  checks.push('Browser query form executes an actual REA typed module projection and saves its result');
  await page.locator('[data-action="trace"]').click();
  await page.locator('#seed').fill('backend/src/Model/TreeNode.ts');
  await page.locator('#run').click();
  await completed(2);
  assert.match(await page.locator('#result').innerText(), /traced/);
  checks.push('Browser follow-up form executes real REA tracing over retained parent Evidence');
  await page.locator('[data-action="report"]').click();
  await page.locator('#export').selectOption({ index: 1 });
  await page.locator('#run').click();
  await completed(3);
  const frame = page.frameLocator('#report-frame');
  await frame.locator('#source-inspector').waitFor({ timeout: 30000 });
  assert.ok((await frame.locator('#history-record option').count()) >= 2);
  await frame.locator('#source-file').selectOption('backend/src/Model/TreeNode.ts');
  assert.match(await frame.locator('#source-code').innerText(), /TreeNode/);
  checks.push('Browser builds a standalone source/history report and previews it in an isolated iframe');
  assert.equal(await page.locator('#report-frame').getAttribute('sandbox'), 'allow-scripts');
  const reportFrame = page.frames().find(f => f.url().includes('/reports/'));
  assert.equal(
    await reportFrame.evaluate(() => {
      try {
        return parent.document.body !== null;
      } catch {
        return false;
      }
    }),
    false
  );
  checks.push('Report preview cannot access the parent workbench session or controls');
  await page.locator('#theme').click();
  assert.equal(await page.locator('body.light').count(), 1);
  await page.locator('#theme').click();
  await page.screenshot({ path: join(out, 'workbench.png') });
  checks.push('Interactive workbench supports dark and light themes');
  await page.locator('[data-action="trace"]').click();
  await page.locator('#seed').fill('');
  await page.locator('#run').click();
  await page.locator('#status').filter({ hasText: 'Operation failed' }).waitFor();
  assert.match(await page.locator('#result').innerText(), /seed/);
  assert.equal(await page.locator('#run').isDisabled(), false);
  checks.push('Invalid requests surface a clear failure and release the operation controls');
  assert.equal(await readFile(join(root, 'case.json'), 'utf8'), before);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(app.url + '/')));
  checks.push('Original case is unchanged; browser makes only local workbench requests with no JavaScript errors');
  await writeFile(
    join(out, 'VERIFICATION.json'),
    JSON.stringify(
      {
        checks,
        url: app.url,
        reports: app.reports,
        requests,
        scope:
          'Browser-launched real REA query/trace/report over private copies of actual MQTT Evidence; no new feature transplant or donor execution.'
      },
      null,
      2
    ) + '\n'
  );
  console.log('INTERACTIVE WORKBENCH CHECKS PASSED:', checks.length);
  console.log('Evidence:', out);
} finally {
  await browser.close();
  await app.close();
}
