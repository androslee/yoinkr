import { verificationOutput } from './verification-output.mjs';
const verificationDirectory = await verificationOutput('browser');
// Opt-in real Chromium CDP integration. No installed user applications launched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient, injectRenderers } from '../../src/cdp.js';
import { wsTransport } from '../../src/transport.js';
import { waitForDevToolsUrl } from '../../src/launcher.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'yoinkr-chromium-'));
const child = spawn(
  chromium.executablePath(),
  [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);
const exit = new Promise(resolve => child.once('exit', resolve));
let cdp, controller;
const checks = [];
async function until(fn) {
  const end = Date.now() + 10000;
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch (e) {
      if (!/context|navigat/i.test(e.message)) throw e;
    }
    if (v) return v;
    if (Date.now() > end) throw Error('browser condition timeout');
    await new Promise(r => setTimeout(r, 30));
  }
}
const fixture = id =>
  'data:text/html,' +
  encodeURIComponent(
    `<body data-app="fixture-${id}"><aside class="${id === 'a' ? 'sidebar' : 'navigation'}">Navigation</aside><main>Keep this content visible</main><footer class="${id === 'a' ? 'statusbar' : 'footer'}" style="display:flex">Status</footer></body>`
  );
try {
  const url = await waitForDevToolsUrl(child, 10000),
    transport = wsTransport(url);
  await transport.ready;
  cdp = new CdpClient(transport);
  const first = await cdp.waitForTarget(t => t.type === 'page');
  const pre = await cdp.attachToTarget(first.targetId);
  await cdp.call('Page.navigate', { url: fixture('a') }, pre);
  await until(() => cdp.evaluate('!!document.body?.dataset.app', pre));
  await cdp.call('Target.detachFromTarget', { sessionId: pre });
  const source = await readFile('mods/focus-mode/entry.js', 'utf8');
  const errors = [];
  controller = await injectRenderers(cdp, [{ id: 'focus-mode', source }], {
    intervalMs: 30,
    onError: e => errors.push(e.message)
  });
  const session = controller.sessions.get(first.targetId);
  await until(() => cdp.evaluate('!!window.__modkitFocus', session));
  checks.push('Existing document receives mod without a reload');
  await cdp.evaluate('window.__modkitFocus.toggle()', session);
  assert.equal(await cdp.evaluate("getComputedStyle(document.querySelector('.sidebar')).display", session), 'none');
  assert.notEqual(await cdp.evaluate("getComputedStyle(document.querySelector('main')).display", session), 'none');
  checks.push('App A adapter hides chrome and preserves content');
  await cdp.evaluate('window.__modkitFocus.toggle()', session);
  assert.equal(await cdp.evaluate("document.querySelector('.statusbar').style.display", session), 'flex');
  checks.push('Toggle restores original inline style');
  await cdp.call('Page.reload', {}, session);
  await until(() => cdp.evaluate('!!window.__modkitFocus&&!window.__modkitFocus.active', session));
  checks.push('Reload reinjects in a fresh document');
  const second = await cdp.call('Target.createTarget', { url: fixture('b') });
  await until(() => controller.sessions.has(second.targetId));
  const two = controller.sessions.get(second.targetId);
  await until(() => cdp.evaluate('!!window.__modkitFocus', two));
  await cdp.evaluate('window.__modkitFocus.toggle()', two);
  assert.equal(await cdp.evaluate("getComputedStyle(document.querySelector('.navigation')).display", two), 'none');
  checks.push('New independent window receives the same feature through app B adapter');
  await cdp.evaluate(
    "document.body.insertAdjacentHTML('beforeend','<aside class=\"navigation\">Dynamic panel</aside>')",
    two
  );
  await until(() =>
    cdp.evaluate("[...document.querySelectorAll('.navigation')].every(n=>getComputedStyle(n).display==='none')", two)
  );
  checks.push('Dynamic app panels follow active focus mode');
  await cdp.evaluate('window.__modkitFocus.dispose()', two);
  assert.equal(await cdp.evaluate("document.querySelectorAll('[data-yoinkr-focus-hidden]').length", two), 0);
  checks.push('Dispose restores chrome and removes the feature');
  await cdp.call('Target.closeTarget', { targetId: first.targetId });
  await until(() => !controller.sessions.has(first.targetId));
  const third = await cdp.call('Target.createTarget', { url: fixture('a') });
  await until(() => controller.sessions.has(third.targetId));
  await until(() => cdp.evaluate('!!window.__modkitFocus', controller.sessions.get(third.targetId)));
  checks.push('Replacement window receives the mod');
  assert.deepEqual(errors, []);
  await writeFile(
    verificationDirectory + '/browser.json',
    JSON.stringify(
      {
        engine: 'Real headless Chromium via native WebSocket and CDP',
        checks,
        errors,
        limits: 'Fixture apps, not a commercial Electron app transplant; no main-process injection tested.'
      },
      null,
      2
    ) + '\n'
  );
  console.log('BROWSER CHECKS PASSED:', checks.length);
} finally {
  cdp?.close();
  await controller?.stop();
  child.kill('SIGTERM');
  await exit;
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
