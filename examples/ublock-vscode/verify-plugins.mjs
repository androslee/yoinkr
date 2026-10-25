// Scoped native tests of the actual extensions and one-click toolbar controls.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationOutput } from '../../scripts/general/verification-output.mjs';
const root = dirname(fileURLToPath(import.meta.url));
if (!process.env.PLAYWRIGHT_MODULE) throw Error('Set PLAYWRIGHT_MODULE to playwright/index.mjs');
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE);
const build = resolve(process.argv[2] || join(root, '.local/plugin-browser'));
const out = await verificationOutput('browser-plugins', process.argv[3]);
await mkdir(out, { recursive: true });
const keyFile = join(out, 'fixture-key.pem'),
  certFile = join(out, 'fixture-cert.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    keyFile,
    '-out',
    certFile,
    '-subj',
    '/CN=old.reddit.com',
    '-addext',
    'subjectAltName=DNS:old.reddit.com'
  ],
  { stdio: 'ignore' }
);
const key = await readFile(keyFile),
  cert = await readFile(certFile);
const pin = createHash('sha256')
  .update(createPublicKey(key).export({ type: 'spki', format: 'der' }))
  .digest('base64');
const fixture = `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Yoinkr Reddit fixture</title><script src="/ad-probe.js"></script></head><body class="listing-page"><div id="header"><div id="header-bottom-left"><ul class="tabmenu"><li class="selected"><a href="/r/yoinkr/">hot</a></li></ul></div><div id="header-bottom-right"><span class="user">Want to join? <a href="/login">Log in</a></span><a id="mail" href="/message/inbox">mail</a><span class="separator">|</span><ul class="flat-list hover"><li><a href="/prefs">preferences</a></li></ul></div></div><div class="side"><div class="titlebox"><h1 class="redditname"><a href="/r/yoinkr">yoinkr</a></h1></div></div><div class="content" role="main"><div id="siteTable" class="sitetable linklisting"><div class="thing link" data-fullname="t3_abc123" data-author="fixture_user" data-subreddit="yoinkr" data-url="https://example.com"><span class="rank">1</span><div class="midcol"><div class="arrow up"></div><div class="score unvoted">12</div><div class="arrow down"></div></div><div class="entry"><p class="title"><a class="title" href="https://example.com">Original RES user tagging fixture</a></p><p class="tagline">submitted by <a class="author" href="/user/fixture_user">fixture_user</a> to <a class="subreddit" href="/r/yoinkr">r/yoinkr</a></p><ul class="flat-list buttons"><li class="first"><a class="comments" href="/r/yoinkr/comments/abc123/fixture">1 comment</a></li></ul></div><div class="child"></div></div></div></div><div id="footer"></div></body></html>`;
let adRequests = 0;
const server = createServer({ key, cert }, (_request, response) => {
  if (_request.url === '/ad-probe.js') {
    adRequests++;
    response.setHeader('Content-Type', 'text/javascript');
    response.setHeader('Cache-Control', 'no-store');
    response.end('window.blockingProbe=true;');
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Cache-Control', 'no-store');
  response.end(fixture);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `https://old.reddit.com:${server.address().port}/r/yoinkr/`;
const profile = join(out, 'p/u'),
  extensions = join(out, 'p/e');
await mkdir(join(profile, 'User'), { recursive: true });
await mkdir(extensions, { recursive: true });
await writeFile(
  join(profile, 'User/settings.json'),
  JSON.stringify({
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'workbench.enableExperiments': false,
    'workbench.startupEditor': 'none',
    'window.titleBarStyle': 'native'
  })
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('VSCODE_') && !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(key)
  )
);
const checks = [];
let app, page;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn, label, timeout = 45000) {
  const end = Date.now() + timeout;
  while (!(await fn())) {
    if (Date.now() > end) throw Error('Timed out: ' + label);
    await pause(100);
  }
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function launch() {
  app = await _electron.launch({
    executablePath: join(build, 'workspace/runtime/code'),
    args: [
      '--user-data-dir=' + profile,
      '--extensions-dir=' + extensions,
      '--skip-welcome',
      '--skip-release-notes',
      '--new-window',
      '--host-resolver-rules=MAP old.reddit.com 127.0.0.1',
      '--ignore-certificate-errors-spki-list=' + pin
    ],
    env,
    timeout: 60000
  });
  for (const stream of ['stdout', 'stderr'])
    app.process()[stream].on('data', bytes => {
      appendFile(join(out, 'native.log'), bytes).catch(() => {});
    });
  await app.evaluate(({ app }) => {
    globalThis.pluginConsole = [];
    app.on('web-contents-created', (_e, wc) =>
      wc.on('console-message', (_event, _level, message) => globalThis.pluginConsole.push(message))
    );
  });
  await wait(
    () => app.evaluate(({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('yoinkr-research-open')),
    'native menu'
  );
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('yoinkr-research-open').click());
  await wait(() => app.windows().some(p => p.url().endsWith('/yoinkr-browser/browser.html')), 'toolbar');
  page = app.windows().find(p => p.url().endsWith('/yoinkr-browser/browser.html'));
  await wait(async () => (await state()).ready, 'plugin initialization', 75000);
}
const state = () => page.evaluate(() => window.yoinkrBrowser.command({ type: 'ready' }));
async function documentValue(code) {
  return app.evaluate(
    async ({ webContents }, { address, code }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL() === address);
      return wc ? wc.executeJavaScript(code) : null;
    },
    { address, code }
  );
}
async function navigate() {
  await page.locator('#address').fill(address);
  await page.locator('#address-form button').click();
  await wait(() => documentValue('document.readyState === "complete"'), 'fixture');
}
async function toggle(key, enabled) {
  await page.locator('#toggle-' + key).click();
  await wait(async () => {
    const s = await state();
    return (
      !s.pluginBusy &&
      (key === 'sessions' ? s.sessions.enabled : s.plugins.find(p => p.key === key).enabled) === enabled
    );
  }, key + ' toggle');
}
try {
  await launch();
  await check('all three original extension packages load', async () => {
    const s = await state();
    assert.equal(s.plugins.length, 3);
    assert.ok(s.plugins.every(p => p.enabled && !p.error));
  });
  await app.evaluate(async ({ webContents }) => {
    const bg = webContents
      .getAllWebContents()
      .find(w => w.getType() === 'backgroundPage' && w.getURL().endsWith('/background.html'));
    await bg.executeJavaScript('µBlock.appendUserFilters("/ad-probe.js$script,domain=old.reddit.com").then(()=>true)');
  });
  await navigate();
  await check('Dark Reader actually darkens the page', async () => {
    await wait(() => documentValue('!!document.querySelector(".darkreader")'), 'Dark Reader CSS');
  });
  await check('original RES creates user-tagging controls on old-Reddit fixture', async () => {
    await wait(() => documentValue('!!document.querySelector(".userTagLink")'), 'RES user tags');
  });
  await check('Dark Reader toolbar switch unloads plugin and removes its styles', async () => {
    await toggle('dark-reader', false);
    await wait(
      () => documentValue('document.readyState === "complete" && !document.querySelector(".darkreader")'),
      'Dark Reader disabled'
    );
  });
  await check('Dark Reader toolbar switch restores original darkening', async () => {
    await toggle('dark-reader', true);
    await wait(() => documentValue('!!document.querySelector(".darkreader")'), 'Dark Reader re-enabled');
  });
  await check('RES toolbar switch removes and restores user tags', async () => {
    await toggle('res', false);
    await wait(
      () => documentValue('document.readyState === "complete" && !document.querySelector(".userTagLink")'),
      'RES disabled'
    );
    await toggle('res', true);
    await wait(() => documentValue('!!document.querySelector(".userTagLink")'), 'RES re-enabled');
  });
  await check('uBlock can be disabled directly from toolbar and re-enabled', async () => {
    assert.equal(adRequests, 0);
    await toggle('ublock', false);
    assert.match(await page.locator('#protection').innerText(), /OFF/);
    await wait(() => documentValue('window.blockingProbe === true'), 'global disable allows script');
    assert.ok(adRequests > 0);
    await toggle('ublock', true);
    assert.match(await page.locator('#protection').innerText(), /ready/);
    await wait(
      () => documentValue('document.readyState === "complete" && typeof window.blockingProbe === "undefined"'),
      'global protection restored'
    );
  });
  await check('RES settings open directly from the toolbar gear', async () => {
    await page.getByRole('button', { name: 'Reddit Enhancement Suite settings', exact: true }).click();
    await wait(
      async () => (await state()).tabs.some(t => t.url.includes('/options.html') && !t.loading),
      'original RES settings'
    );
    await wait(
      () =>
        app.evaluate(async ({ webContents }) => {
          const wc = webContents.getAllWebContents().find(w => w.getURL().includes('/options.html'));
          return wc ? wc.executeJavaScript('Boolean(document.querySelector("#RESConsoleContainer"))') : false;
        }),
      'RES settings console content'
    );
    await page.locator('#tabs .active .close').click();
  });
  await check('named sessions save and restore from toolbar', async () => {
    await page.locator('#session-name').fill('Research group');
    await page.locator('#save-session').click();
    await wait(async () => (await state()).sessions.saved.length === 1, 'saved session');
    const saved = (await state()).sessions.saved[0];
    await page.locator('#saved-sessions').selectOption(saved.id);
    await page.locator('#restore-session').click();
    await wait(async () => (await state()).tabs.length === 2, 'restored group');
  });
  await check('session management can be disabled with one toolbar click', async () => {
    await toggle('sessions', false);
    assert.equal(await page.locator('#save-session').isDisabled(), true);
    await toggle('sessions', true);
  });
  await toggle('dark-reader', false);
  await toggle('res', false);
  await app.close();
  app = null;
  await launch();
  await check('disabled plugins and named sessions persist across restart', async () => {
    const s = await state();
    assert.equal(s.plugins.find(p => p.key === 'dark-reader').enabled, false);
    assert.equal(s.plugins.find(p => p.key === 'res').enabled, false);
    assert.equal(s.sessions.saved[0].name, 'Research group');
    await wait(
      () =>
        documentValue(
          'document.readyState === "complete" && !document.querySelector(".darkreader") && !document.querySelector(".userTagLink")'
        ),
      'disabled plugins remain absent'
    );
  });
  await check('saved session can be deleted directly from toolbar', async () => {
    await page.locator('#saved-sessions').selectOption((await state()).sessions.saved[0].id);
    await page.locator('#delete-session').click();
    await wait(async () => (await state()).sessions.saved.length === 0, 'delete session');
  });
  await app.close();
  app = null;
  assert.doesNotMatch(await readFile(join(out, 'native.log'), 'utf8'), /\[uncaught exception in main\]/);
  await writeFile(
    join(out, 'RESULT.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        scope:
          'Actual native extensions on a synthetic old-Reddit HTTPS fixture; live Reddit/cloud integrations not covered. Test-only certificate pin; production TLS settings unchanged.'
      },
      null,
      2
    ) + '\n'
  );
  console.log(`${checks.length} plugin checks passed: ${out}`);
} catch (error) {
  if (app)
    try {
      await writeFile(
        join(out, 'diagnostic.json'),
        JSON.stringify(
          await app.evaluate(({ webContents }) => ({
            messages: globalThis.pluginConsole,
            contents: webContents.getAllWebContents().map(w => ({ id: w.id, url: w.getURL(), type: w.getType() }))
          })),
          null,
          2
        )
      );
      await writeFile(
        join(out, 'fixture-dom.json'),
        JSON.stringify(await documentValue('({html:document.documentElement.outerHTML.slice(0,30000)})'), null, 2)
      );
    } catch {}
  await writeFile(join(out, 'RESULT.json'), JSON.stringify({ passed: false, checks, error: error.stack }, null, 2));
  throw error;
} finally {
  if (app) await app.close();
  await new Promise(r => server.close(r));
}
