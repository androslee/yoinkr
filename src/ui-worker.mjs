import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
let browser,
  stopping = false;
const send = value => {
  if (process.connected) process.send(value);
};
process.on('SIGTERM', async () => {
  stopping = true;
  try {
    await browser?.close();
  } finally {
    process.exit(143);
  }
});
process.once('message', async job => {
  const steps = [],
    errors = [],
    blocked = [];
  let finalScreenshot = null;
  try {
    const { chromium } = await import(job.playwrightModule);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    if (stopping) return;
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      serviceWorkers: 'block'
    });
    await context.route(/^https?:\/\//, route => {
      if (blocked.length < 32) blocked.push(route.request().url().slice(0, 1000));
      return route.abort();
    });
    if (typeof context.routeWebSocket === 'function')
      await context.routeWebSocket(/.*/, socket => {
        if (blocked.length < 32) blocked.push(socket.url().slice(0, 1000));
        socket.close();
      });
    const page = await context.newPage();
    page.setDefaultTimeout(job.recipe.stepTimeoutMs ?? 2000);
    page.on('dialog', d => {
      if (errors.length < 16) errors.push('Unexpected dialog: ' + d.type());
      d.dismiss().catch(() => {});
    });
    page.on('pageerror', e => {
      if (errors.length < 16) errors.push(e.message.slice(0, 2000));
    });
    context.on('page', other => {
      if (other !== page) {
        errors.push('Unexpected additional page');
        other.close().catch(() => {});
      }
    });
    await page.goto(pathToFileURL(join(job.directory, 'inputs/app', job.recipe.target.entry)).href, {
      waitUntil: 'load',
      timeout: 10000
    });
    let failures = 0;
    for (const [index, s] of job.recipe.steps.entries()) {
      let result = { index, action: s.action, selector: s.selector, passed: true };
      try {
        const locator = page.locator(s.selector);
        if (s.action === 'click') await locator.click();
        else if (s.action === 'fill') await locator.fill(s.value);
        else if (s.action === 'select') await locator.selectOption(s.value);
        else if (s.action === 'upload') await locator.setInputFiles(join(job.directory, 'inputs/fixtures', s.file));
        else {
          const end = Date.now() + (job.recipe.stepTimeoutMs ?? 2000);
          let actual;
          do {
            actual =
              s.property === 'count'
                ? await locator.count()
                : s.property === 'visible'
                  ? await locator.isVisible()
                  : s.property === 'value'
                    ? await locator.inputValue()
                    : await locator.innerText();
            result.passed = s.match === 'contains' ? actual.includes(s.expected) : actual === s.expected;
            if (result.passed || Date.now() >= end) break;
            await new Promise(r => setTimeout(r, 30));
          } while (true);
          result = {
            ...result,
            property: s.property,
            expected: s.expected,
            match: s.match ?? 'equals',
            actual: typeof actual === 'string' && actual.length > 4000 ? actual.slice(0, 4000) + ' [truncated]' : actual
          };
        }
      } catch (e) {
        result.passed = false;
        result.error = e.message.slice(0, 2000);
      }
      if (!result.passed && failures++ < 2) {
        result.screenshot = 'failure-' + index + '.png';
        await page.screenshot({ path: join(job.directory, result.screenshot) }).catch(() => {
          result.screenshot = null;
        });
      }
      steps.push(result);
      send({ type: 'step', result });
      if (!result.passed && s.action !== 'assert') break;
    }
    finalScreenshot = 'final.png';
    await page.screenshot({ path: join(job.directory, finalScreenshot) });
    send({ type: 'complete', steps, errors, blocked, finalScreenshot });
  } catch (e) {
    send({ type: 'fatal', error: e.message.slice(0, 2000) });
  } finally {
    await browser?.close().catch(() => {});
    if (process.connected) process.disconnect();
  }
});
