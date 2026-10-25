// Native acceptance against a real VS Code copy. All fixture traffic stays on loopback.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationOutput } from '../../scripts/general/verification-output.mjs';
import { electronPlaybookStatus } from '../../src/electron-playbook.js';
const root = dirname(fileURLToPath(import.meta.url));
const [buildArg, outArg, ...extra] = process.argv.slice(2);
if (extra.length) throw Error('Use: node verify.mjs [built example directory] [new output directory]');
if (!process.env.PLAYWRIGHT_MODULE)
  throw Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs; no browser download is required');
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE);
const build = resolve(buildArg || join(root, '.local/plugin-browser'));
const record = JSON.parse(await readFile(join(build, 'BUILD.json')));
assert.equal(record.marker, 'ublock-vscode-research-browser');
assert.equal((await electronPlaybookStatus(join(build, 'workspace'))).clean, true);
const out = await verificationOutput('ublock-vscode', outArg);
await mkdir(out, { recursive: true });
// Never reuse the example's personal/browser profile for verification.
const profile = join(out, 'p/u'),
  extensionDir = join(out, 'p/e');
await mkdir(join(profile, 'User'), { recursive: true });
await mkdir(extensionDir, { recursive: true });
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
const hits = [],
  checks = [],
  errors = [];
const server = createServer((request, response) => {
  hits.push(request.url);
  response.setHeader('Cache-Control', 'no-store');
  if (request.url.startsWith('/fixture')) {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      `<!doctype html><title>Protected research tab</title><script>window.yoinkrScriptlet=true</script><h1>Research fixture</h1><div class="yoinkr-ad">Advertisement</div><p id="ordinary">Ordinary content</p><iframe src="/frame"></iframe><iframe src="http://doubleclick.net:${server.address().port}/ad-frame"></iframe><script src="/ordinary.js"></script><script src="http://doubleclick.net:${server.address().port}/ad.js"></script><script src="/custom-block.js"></script><script src="/exception.js"></script>`
    );
  } else if (request.url.startsWith('/csp-fixture')) {
    response.setHeader('Content-Type', 'text/html');
    response.end('<title>CSP fixture</title><script>window.cspSentinel=true</script><h1>Header filter fixture</h1>');
  } else if (request.url.startsWith('/frame')) {
    response.setHeader('Content-Type', 'text/html');
    response.end('<title>Ordinary iframe</title><p>Frame content</p>');
  } else if (request.url.startsWith('/second')) {
    response.setHeader('Content-Type', 'text/html');
    response.end('<title>Second research tab</title><h1>Second tab</h1>');
  } else {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('window.fixtureLoaded=true;');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://allowed.yoinkr.test:${server.address().port}/fixture`,
  second = url.replace('/fixture', '/second');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!(await fn())) {
    if (Date.now() > end) throw Error('Timed out: ' + label);
    await pause(80);
  }
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('VSCODE_') && !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(key)
  )
);
let app, page;
async function launch() {
  app = await _electron.launch({
    executablePath: join(build, 'workspace/runtime/code'),
    args: [
      '--user-data-dir=' + profile,
      '--extensions-dir=' + extensionDir,
      '--skip-welcome',
      '--skip-release-notes',
      '--new-window',
      '--host-resolver-rules=MAP *.yoinkr.test 127.0.0.1, MAP doubleclick.net 127.0.0.1'
    ],
    env,
    timeout: 60000
  });
  for (const stream of ['stdout', 'stderr'])
    app.process()[stream].on('data', bytes => {
      appendFile(join(out, 'native.log'), bytes).catch(() => {});
    });
  await app.evaluate(({ app }) => {
    globalThis.yoinkrTestMessages = [];
    app.on('web-contents-created', (_event, wc) =>
      wc.on('console-message', (_e, _level, message) => {
        if (typeof message === 'string') globalThis.yoinkrTestMessages.push(message);
      })
    );
  });
  await wait(
    () => app.evaluate(({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('yoinkr-research-open')),
    'native browser menu'
  );
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('yoinkr-research-open').click());
  await wait(() => app.windows().some(p => p.url().endsWith('/yoinkr-browser/browser.html')), 'browser controls');
  page = app.windows().find(p => p.url().endsWith('/yoinkr-browser/browser.html'));
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(
    () => document.querySelector('#protection').textContent.includes('· ready'),
    {},
    { timeout: 75000 }
  );
}
async function background(code) {
  return app.evaluate(async ({ webContents }, code) => {
    const wc = webContents
      .getAllWebContents()
      .find(w => w.getType() === 'backgroundPage' && w.getURL().endsWith('/background.html'));
    if (!wc) throw Error('uBlock background missing');
    return wc.executeJavaScript(code);
  }, code);
}
async function tabEval(address, code) {
  return app.evaluate(
    async ({ webContents }, { address, code }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL() === address);
      if (!wc) return null;
      return wc.executeJavaScript(code);
    },
    { address, code }
  );
}
async function navigate(address) {
  await page.locator('#address').fill(address);
  await page.locator('#address-form button').click();
  await wait(() => tabEval(address, 'document.readyState === "complete"'), 'fixture navigation');
}
async function popup() {
  const extensionId = await background('chrome.runtime.id');
  await page
    .locator('browser-action-list')
    .locator('button[id="' + extensionId + '"]')
    .click();
  await wait(() => app.windows().some(p => p.url().includes('/popup-fenix.html')), 'original popup');
  const panel = app.windows().find(p => p.url().includes('/popup-fenix.html'));
  await panel.locator('#switch').waitFor();
  return panel;
}
async function reloadFixture() {
  const before = hits.filter(p => p === '/fixture').length;
  await page.locator('#reload').click();
  await wait(() => hits.filter(p => p === '/fixture').length > before, 'fixture reload');
  await wait(() => tabEval(url, 'document.readyState === "complete"'), 'reloaded fixture');
  await pause(250);
}
try {
  await launch();
  await check('actual Code workbench and original uBlock 1.75.0 ready', async () => {
    await wait(() => app.windows().some(p => p.url().includes('/workbench.html')), 'Code workbench');
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), record.hostVersion);
    assert.deepEqual(
      await background(
        '({version:chrome.runtime.getManifest().version,manifest:chrome.runtime.getManifest().manifest_version,ready:µBlock.readyToFilter})'
      ),
      { version: '1.75.0', manifest: 2, ready: true }
    );
  });
  const filters =
    '/custom-block.js$script,domain=allowed.yoinkr.test\n/exception.js$script,domain=allowed.yoinkr.test\n@@/exception.js$script,domain=allowed.yoinkr.test\nallowed.yoinkr.test##.yoinkr-ad\nallowed.yoinkr.test##+js(set-constant, yoinkrScriptlet, false)';
  // Exercise the extension's own compiler, storage and filtering engine; no host fake blocker.
  await background(
    `µBlock.appendUserFilters(${JSON.stringify(filters + "\n/csp-fixture$csp=script-src 'none'")}).then(()=>true)`
  );
  await navigate(url);
  await check('default list blocks advertising request before server receives it', async () => {
    assert.equal(hits.includes('/ad.js'), false);
  });
  await check('advertising iframe is blocked while ordinary iframe loads', async () => {
    assert.equal(hits.includes('/ad-frame'), false);
    assert.ok(hits.includes('/frame'));
  });
  await check('custom network rule blocks before server receives request', async () => {
    assert.equal(hits.includes('/custom-block.js'), false);
  });
  await check('ordinary scripts and explicit exception remain allowed', async () => {
    assert.ok(hits.includes('/ordinary.js'));
    assert.ok(hits.includes('/exception.js'));
  });
  await check('cosmetic rule hides ad while ordinary content remains visible', async () => {
    await wait(
      () => tabEval(url, 'getComputedStyle(document.querySelector(".yoinkr-ad")).display === "none"'),
      'cosmetic filtering'
    );
    assert.notEqual(await tabEval(url, 'getComputedStyle(document.querySelector("#ordinary")).display'), 'none');
  });
  await check('original uBlock scriptlet runs in page world', async () => {
    assert.equal(await tabEval(url, 'window.yoinkrScriptlet'), false);
  });
  await check('uBlock response-header filtering enforces a CSP before script execution', async () => {
    const cspURL = url.replace('/fixture', '/csp-fixture');
    await page.locator('#new').click();
    await navigate(cspURL);
    assert.equal(await tabEval(cspURL, 'window.cspSentinel'), undefined);
    await page.locator('#tabs .active .close').click();
  });
  await check('remote page has neither Node nor browser-control bridge', async () => {
    assert.deepEqual(await tabEval(url, '({node:typeof require,bridge:typeof yoinkrBrowser})'), {
      node: 'undefined',
      bridge: 'undefined'
    });
  });
  await check('original popup shows blocked request counts', async () => {
    const panel = await popup();
    assert.match(await panel.locator('body').innerText(), /Blocked on this page/);
    await wait(async () => (await background('µBlock.requestStats.blockedCount')) >= 2, 'uBlock request counters');
  });
  await check('original popup disables site filtering and requests reach server', async () => {
    const panel = app.windows().find(p => p.url().includes('/popup-fenix.html'));
    await panel.locator('#switch').click();
    await reloadFixture();
    assert.ok(hits.includes('/ad.js'));
    assert.ok(hits.includes('/custom-block.js'));
  });
  await check('original popup re-enables protection', async () => {
    await app.evaluate(({ webContents }) => {
      for (const wc of webContents.getAllWebContents()) if (wc.getURL().includes('/popup-fenix.html')) wc.close();
    });
    const panel = await popup();
    await panel.locator('#switch').click();
    hits.length = 0;
    await reloadFixture();
    assert.equal(hits.includes('/ad.js'), false);
    assert.equal(hits.includes('/custom-block.js'), false);
  });
  await check('vertical tabs switch native page visibility', async () => {
    await page.locator('#new').click();
    await navigate(second);
    await page.getByRole('button', { name: 'Protected research tab', exact: true }).click();
    assert.equal(await page.locator('#address').inputValue(), url);
    const geometry = await page.locator('aside').boundingBox();
    assert.equal(geometry.width, 220);
    const visible = await app.evaluate(({ BrowserWindow }) => {
      const shell = BrowserWindow.getAllWindows().find(w =>
        w.webContents.getURL().endsWith('/yoinkr-browser/browser.html')
      );
      return shell.contentView.children.map(v => ({ visible: v.getVisible(), url: v.webContents.getURL() }));
    });
    assert.equal(visible.filter(v => v.visible).length, 1);
    assert.equal(visible.find(v => v.visible).url, url);
  });
  await check('original dashboard and request logger open in internal tabs', async () => {
    await page.locator('#dashboard').click();
    await wait(
      () =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some(w => w.getURL().split(/[?#]/)[0].endsWith('/dashboard.html') && !w.isLoading())
        ),
      'uBlock dashboard'
    );
    await page.locator('#logger').click();
    await wait(
      () =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some(w => w.getURL().split(/[?#]/)[0].endsWith('/logger-ui.html') && !w.isLoading())
        ),
      'uBlock logger'
    );
    await page.getByRole('button', { name: 'Protected research tab', exact: true }).click();
  });
  await check('address bar rejects file and script URLs', async () => {
    for (const address of ['file:///etc/passwd', 'javascript:alert(1)']) {
      await page.locator('#address').fill(address);
      await page.locator('#address-form button').click();
      await page.waitForFunction(() => document.querySelector('#message').textContent.includes('HTTP or HTTPS'));
      assert.equal(await tabEval(url, 'document.title'), 'Protected research tab');
    }
    await page.locator('#address').fill(url);
  });
  await check('sandbox and context isolation remain enabled for remote tabs', async () => {
    const prefs = await app.evaluate(({ webContents }, address) => {
      const p = webContents
        .getAllWebContents()
        .find(w => w.getURL() === address)
        .getLastWebPreferences();
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        webSecurity: p.webSecurity
      };
    }, url);
    assert.deepEqual(prefs, { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
  });
  // Electron captures browser controls and child WebContentsViews separately.
  await reloadFixture();
  const screenshot = await app.evaluate(async ({ BrowserWindow }) => {
    const shell = BrowserWindow.getAllWindows().find(w =>
      w.webContents.getURL().endsWith('/yoinkr-browser/browser.html')
    );
    return (await shell.capturePage()).toPNG().toString('base64');
  });
  await writeFile(join(out, 'controls.png'), Buffer.from(screenshot, 'base64'));
  const pageImage = await app.evaluate(
    async ({ webContents }, address) =>
      (
        await webContents
          .getAllWebContents()
          .find(w => w.getURL() === address)
          .capturePage()
      )
        .toPNG()
        .toString('base64'),
    url
  );
  await writeFile(join(out, 'page.png'), Buffer.from(pageImage, 'base64'));
  await check('strict blocking displays original uBlock blocked-site page', async () => {
    await page.locator('#new').click();
    await page.locator('#address').fill(url.replace('allowed.yoinkr.test', 'doubleclick.net'));
    await page.locator('#address-form button').click();
    await wait(
      () =>
        app.evaluate(({ webContents }) =>
          webContents.getAllWebContents().some(w => w.getURL().includes('/document-blocked.html'))
        ),
      'blocked-site explanation'
    );
    await page.locator('#tabs .active .close').click();
    assert.equal(await page.locator('#tabs .tab').count(), 4);
  });
  await app.close();
  app = null;
  hits.length = 0;
  await launch();
  await check('restart restores web tabs after blocker is ready', async () => {
    await wait(() => tabEval(url, 'document.readyState === "complete"'), 'restored fixture');
    assert.equal(await page.locator('#tabs .tab').count(), 2);
    assert.equal(hits.includes('/ad.js'), false);
    assert.equal(hits.includes('/custom-block.js'), false);
    assert.ok(hits.includes('/ordinary.js'));
    assert.ok(hits.includes('/exception.js'));
  });
  await check('custom filters and scriptlets persist through restart', async () => {
    await wait(
      () => tabEval(url, 'getComputedStyle(document.querySelector(".yoinkr-ad")).display === "none"'),
      'restored cosmetic filtering'
    );
    assert.equal(await tabEval(url, 'window.yoinkrScriptlet'), false);
  });
  assert.deepEqual(errors, []);
  const runtime = await app.evaluate(() => ({
    electron: process.versions.electron,
    chromium: process.versions.chrome
  }));
  await app.close();
  app = null;
  const nativeLog = await readFile(join(out, 'native.log'), 'utf8');
  assert.doesNotMatch(nativeLog, /\[uncaught exception in main\]/);
  await writeFile(
    join(out, 'RESULT.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        runtime,
        hostVersion: record.hostVersion,
        originalExtension: record.recipe,
        limits: [
          'Linux x86-64 only',
          'Loopback fixtures, not a universal website/adblock effectiveness audit',
          'Chromium uBlock branch; Firefox-only APIs not supplied'
        ]
      },
      null,
      2
    ) + '\n'
  );
  console.log(`${checks.length} native checks passed. Results: ${out}`);
} catch (error) {
  if (app) {
    try {
      await writeFile(
        join(out, 'diagnostic.json'),
        JSON.stringify(
          await app.evaluate(({ webContents }) => ({
            messages: globalThis.yoinkrTestMessages,
            contents: webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() }))
          })),
          null,
          2
        )
      );
    } catch {}
  }
  await writeFile(
    join(out, 'RESULT.json'),
    JSON.stringify({ passed: false, checks, error: error.stack, errors }, null, 2) + '\n'
  );
  throw error;
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
}
