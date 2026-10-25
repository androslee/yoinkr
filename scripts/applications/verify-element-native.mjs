import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { vsCodeElementStatus, rollbackVsCodeElement } from '../../src/host-adapters/vscode-element.js';
import {
  applyElectronPlaybook,
  rollbackElectronPlaybook,
  electronPlaybookStatus
} from '../../src/electron-playbook.js';
import { saveJson, sha256, newDestination } from '../../src/workspace.js';
const [adapter, displayBin, out, ...extra] = process.argv.slice(2);
if (!out || extra.length || !process.env.PLAYWRIGHT_MODULE)
  throw Error('Use <prepared Element adapter> <Xvfb executable> <new evidence>; set PLAYWRIGHT_MODULE');
const initial = await vsCodeElementStatus(adapter);
assert.equal(initial.clean, true);
const root = initial.directory,
  dest = await newDestination(out, [root]);
await mkdir(dest, { recursive: true });
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE),
  checks = [],
  errors = [],
  displayLogs = [];
let display,
  application,
  displayText = '';
const wait = async (fn, label, ms = 30000) => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw Error('Timed out: ' + label);
    await new Promise(r => setTimeout(r, 80));
  }
};
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log('PASS', name);
};
async function launch(workspace) {
  const profile = join(workspace, 'p', 'accept');
  await mkdir(join(profile, 'u/User'), { recursive: true });
  await mkdir(join(profile, 'e'), { recursive: true });
  await writeFile(
    join(profile, 'u/User/settings.json'),
    JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'workbench.enableExperiments': false,
      'workbench.startupEditor': 'none',
      'window.titleBarStyle': 'native',
      'security.workspace.trust.enabled': false
    })
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        !k.startsWith('VSCODE_') && !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH', 'XAUTHORITY'].includes(k)
    )
  );
  env.DISPLAY = ':' + displayText.trim().split('\n')[0];
  application = await _electron.launch({
    executablePath: join(workspace, 'runtime/code'),
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--new-window',
      '--user-data-dir=' + join(profile, 'u'),
      '--extensions-dir=' + join(profile, 'e')
    ],
    env,
    timeout: 45000
  });
  await wait(() => application.windows().some(p => p.url().includes('/workbench.html')), 'real Code workbench');
}
async function menu() {
  await wait(
    () =>
      application.evaluate(({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('modkit-element-search-open')),
    'native menu'
  );
  await application.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById('modkit-element-search-open').click()
  );
  await wait(
    () => application.windows().some(p => p.url().endsWith('/feature/payload/panel.html')),
    'native feature window'
  );
  const page = application.windows().find(p => p.url().endsWith('/feature/payload/panel.html'));
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('.message').first().waitFor();
  return page;
}
async function close() {
  if (application) {
    const app = application;
    application = null;
    const owned = app.process();
    const guard = setTimeout(() => {
      if (owned.exitCode === null) owned.kill('SIGTERM');
    }, 5000);
    guard.unref();
    try {
      await app.close();
    } finally {
      clearTimeout(guard);
    }
  }
}
let failure;
try {
  display = spawn(resolve(displayBin), ['-displayfd', '1', '-screen', '0', '1400x1000x24', '-nolisten', 'tcp', '-ac'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  display.stdout.on('data', b => (displayText += b));
  display.stderr.on('data', b => displayLogs.push(String(b)));
  display.on('error', e => errors.push(e.message));
  await wait(() => /^\d+\n/.test(displayText), 'owned Xvfb', 10000);
  await launch(join(root, 'workspace'));
  let page = await menu();
  await check('Native VS Code menu opens a real application-owned window with extensions disabled', async () => {
    assert.ok(application.process().spawnargs.includes('--disable-extensions'));
    assert.ok(application.windows().some(p => p.url().includes('/workbench.html')));
    assert.equal(await page.locator('.message').count(), 5);
  });
  await check('Renderer has no Node or VS Code extension APIs', async () =>
    assert.deepEqual(await page.evaluate(() => [typeof require, typeof acquireVsCodeApi]), ['undefined', 'undefined'])
  );
  await check('Recovered Element highlighter renders search matches', async () => {
    await page.locator('#query').fill('launch checklist');
    await wait(async () => (await page.locator('.message').count()) === 2, 'two matches');
    assert.ok((await page.locator('mark').count()) >= 4);
  });
  await check('Room filter and no-result state work', async () => {
    await page.locator('#rooms').selectOption('Community');
    await wait(async () => (await page.locator('.message').count()) === 0, 'empty search');
  });
  await check('Message markup remains inert text', async () => {
    await page.locator('#query').fill('');
    await wait(async () => (await page.locator('.message').count()) === 2, 'community messages');
    assert.equal(await page.locator('script:not([src])').count(), 0);
    assert.ok((await page.locator('#results').innerText()).includes('<script>'));
  });
  await check('Native bridge exposes only explicit operations', async () => {
    for (const input of [{ action: 'exec' }, { action: 'sample', path: '/etc/passwd' }]) {
      const error = await page.evaluate(async x => {
        try {
          await window.modkitElement.request(x);
          return '';
        } catch (e) {
          return e.message;
        }
      }, input);
      assert.match(error, /Unsupported/);
    }
  });
  const transcript = join(dest, 'transcript.json');
  await writeFile(
    transcript,
    JSON.stringify([{ id: 'local', room: 'Imported room', sender: 'Local creator', text: 'Imported launch notes' }])
  );
  await application.evaluate(({ dialog }, file) => {
    globalThis.__modkitDialogOriginal = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, transcript);
  await check('Main process reads a selected local transcript and renderer searches it', async () => {
    await page.locator('#open').click();
    await wait(async () => (await page.locator('.message').count()) === 1, 'local import');
    assert.match(await page.locator('#results').innerText(), /Imported launch notes/);
  });
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = globalThis.__modkitDialogOriginal;
    delete globalThis.__modkitDialogOriginal;
  });
  await page.screenshot({ path: join(dest, 'element-in-vscode.png'), fullPage: true });
  await check('Repeated open focuses one feature window', async () => {
    await menu();
    assert.equal(application.windows().filter(p => p.url().endsWith('/feature/payload/panel.html')).length, 1);
  });
  await check('Foreign renderer cannot invoke the privileged bridge', async () => {
    const error = await application.evaluate(
      async ({ BrowserWindow }, o) => {
        const w = new BrowserWindow({
          show: true,
          webPreferences: {
            preload: o.preload,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            partition: 'modkit-element-search-v1'
          }
        });
        const guard = setTimeout(() => w.destroy(), 10000);
        try {
          await w.loadURL(o.url);
          return await w.webContents.executeJavaScript(
            'window.modkitElement.request({action:"health"}).then(()=>"UNEXPECTED_SUCCESS", e=>e.message)'
          );
        } finally {
          clearTimeout(guard);
          if (!w.isDestroyed()) w.destroy();
        }
      },
      { url: page.url(), preload: join(root, 'workspace/runtime/resources/app/modkit-element/preload.cjs') }
    );
    assert.match(error, /Untrusted/);
  });
  await close();
  await check('Recipient drift blocks rollback before mutation', async () => {
    const file = join(root, 'workspace/runtime/resources/app/product.json'),
      before = await readFile(file);
    try {
      await writeFile(file, '{}');
      assert.equal((await vsCodeElementStatus(root)).clean, false);
      await assert.rejects(rollbackVsCodeElement(root), /Drift/);
    } finally {
      await writeFile(file, before);
    }
  });
  await check('Source runtime pins and generated feature remain unchanged', async () => {
    assert.equal((await vsCodeElementStatus(root)).clean, true);
    const r = JSON.parse(await readFile(join(root, 'ADAPTER.json')));
    for (const f of r.recipe.files) assert.equal(sha256(await readFile(join(r.source, f.path))), f.sha256);
  });
  const rollback = join(dest, 'restored');
  const r = JSON.parse(await readFile(join(root, 'ADAPTER.json')));
  await applyElectronPlaybook(r.source, join(root, 'playbook/playbook.json'), rollback);
  await rollbackElectronPlaybook(rollback);
  await check('Guarded rollback restores a separate copied app', async () => {
    assert.equal((await electronPlaybookStatus(rollback)).status, 'rolled-back');
    assert.equal((await electronPlaybookStatus(rollback)).clean, true);
    await launch(rollback);
    assert.equal(
      await application.evaluate(
        ({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('modkit-element-search-open')
      ),
      false
    );
    await close();
  });
} catch (e) {
  failure = { message: e.message, stack: e.stack };
  console.error(e.stack);
  if (application)
    for (const [i, p] of application.windows().entries())
      await p.screenshot({ path: join(dest, 'failure-' + i + '.png') }).catch(() => {});
} finally {
  await close().catch(e => errors.push(e.message));
  if (display && display.exitCode === null) {
    display.kill('SIGTERM');
    await new Promise(resolve => {
      display.once('exit', resolve);
      setTimeout(() => {
        if (display.exitCode === null) display.kill('SIGKILL');
        resolve();
      }, 2000).unref();
    });
  }
}
const result = {
  schema: 1,
  status: failure ? 'failed' : 'passed',
  checks,
  errors,
  displayLogs,
  failure,
  platform: process.platform,
  arch: process.arch,
  featureDigest: initial.featureDigest,
  scope:
    'Actual VS Code Linux x64, native menu/window and copied Element highlighting. The file dialog selection is supplied by a test stub; native OS dialog interaction, live Matrix services and original full Element app are not verified.'
};
await saveJson(join(dest, 'RESULT.json'), result);
console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
