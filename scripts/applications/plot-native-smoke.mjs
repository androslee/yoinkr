import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { transform } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { sha256 } from '../../src/workspace.js';
const root = resolve(process.env.YOINKR_PLOT_BUILD ?? process.env.MODKIT_PLOT_BUILD ?? '/tmp/mk-plot-v13'),
  out = resolve(
    process.env.YOINKR_PLOT_EVIDENCE ?? process.env.MODKIT_PLOT_EVIDENCE ?? join(root, 'acceptance-' + randomUUID())
  ),
  playwright = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'),
  require = createRequire(import.meta.url),
  transfer = JSON.parse(await readFile(join(root, 'TRANSFER.json'), 'utf8'));
await mkdir(out, { recursive: true });
const source = await readFile(join(transfer.donor.path, transfer.donor.originalUtil));
assert.equal(sha256(source), transfer.donor.sha256);
const oracle = (await transform(source.toString(), { loader: 'tsx', format: 'cjs' })).code;
await writeFile(join(out, 'oracle.cjs'), oracle);
const donor = require(join(out, 'oracle.cjs')),
  recipient = require(join(root, 'code/resources/app/modkit-native/donor-plot.cjs'));
const inputs = [
  [12, 12],
  [true, 1],
  [false, 0],
  ['2.5', 2.5],
  ['ON', 1],
  ['off', 0],
  ['1,5', 1.5],
  ['bad', undefined],
  ['', undefined],
  [null, undefined],
  ['Infinity', Infinity],
  ['-4', -4]
];
const checks = [];
for (const [input, expected] of inputs) {
  assert.equal(donor.toPlottableValue(input), expected);
  assert.equal(recipient.toPlottableValue(input), expected);
}
checks.push(
  'Original donor and recovered recipient numeric conversion match 12 explicit inputs including on/off and comma decimals'
);
const host = join(root, 'code/resources/app/modkit-native');
for (const [name, digest] of Object.entries(transfer.installedFiles))
  assert.equal(sha256(await readFile(join(host, name))), digest);
checks.push('Every installed feature/glue file matches the transfer manifest before native execution');
let display, app, browser, publisher;
const broker = await Aedes.createBroker(),
  server = createServer(broker.handle),
  sockets = new Set();
server.on('connection', s => {
  sockets.add(s);
  s.on('close', () => sockets.delete(s));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port,
  errors = [];
let logs = '';
const until = async (fn, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (!(await fn())) {
    if (Date.now() > end) throw Error('Native plot acceptance timed out');
    await new Promise(r => setTimeout(r, 30));
  }
};
const terminate = child =>
  new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 1500);
    timer.unref();
  });
try {
  display = spawn(
    process.env.YOINKR_XVFB ?? process.env.MODKIT_XVFB ?? '/tmp/yoinkr-xvfb/root/usr/bin/Xvfb',
    ['-displayfd', '1', '-screen', '0', '1280x900x24', '-nolisten', 'tcp', '-ac'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let displayText = '';
  display.stdout.on('data', b => (displayText += b.toString()));
  display.stderr.on('data', b => (logs += b.toString()));
  display.on('error', e => (logs += e.message));
  await until(() => /^\d+\n/.test(displayText), 5000);
  const displayName = ':' + displayText.trim().split('\n')[0];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('VSCODE_') && !['ELECTRON_RUN_AS_NODE', 'XAUTHORITY'].includes(k)
    )
  );
  Object.assign(env, { DISPLAY: displayName, YOINKR_PROFILE_SUFFIX: 'plot-test', YOINKR_OPEN_MQTT: '1' });
  app = spawn(
    process.execPath,
    [
      join(root, 'launch-native.mjs'),
      root,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1'
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const capture = b => {
    logs = (logs + b.toString()).slice(-100000);
  };
  app.stdout.on('data', capture);
  app.stderr.on('data', capture);
  app.on('error', e => capture(Buffer.from(e.message)));
  await until(() => /DevTools listening on (ws:\/\/\S+)/.test(logs), 20000);
  browser = await playwright.chromium.connectOverCDP(/DevTools listening on (ws:\/\/\S+)/.exec(logs)[1]);
  const context = browser.contexts()[0];
  await until(() => context.pages().some(p => p.url().endsWith('/modkit-native/panel.html')), 20000);
  const page = context.pages().find(p => p.url().endsWith('/modkit-native/panel.html'));
  await page.waitForLoadState('domcontentloaded');
  page.on('pageerror', e => errors.push(e.message));
  const info = await page.evaluate(
    () =>
      new Promise(resolve => {
        const off = modkitHost.onMessage(m => {
          if (m.type === 'host-info') {
            off();
            resolve(m);
          }
        });
        modkitHost.send({ type: 'host-info' });
      })
  );
  assert.equal(info.extensionsUsed, false);
  assert.equal(info.nativeMenu, true);
  assert.equal(await page.evaluate(() => typeof require), 'undefined');
  checks.push(
    'Actual copied VS Code opens its native MQTT window/menu with extensions disabled and isolated renderer preload'
  );
  publisher = mqtt.connect('mqtt://127.0.0.1:' + port, { reconnectPeriod: 0 });
  await until(() => publisher.connected);
  const pub = (topic, text) => new Promise((r, j) => publisher.publish(topic, text, { qos: 1 }, e => (e ? j(e) : r())));
  await page.locator('#url').fill('mqtt://127.0.0.1:' + port);
  await page.locator('#connect button').first().click();
  await page.locator('#status').filter({ hasText: 'Connected' }).waitFor({ timeout: 15000 });
  for (const value of ['1', '2', 'ON', 'off', '1,5', 'bad', 'Infinity']) await pub('yoinkr/plot/value', value);
  await pub('yoinkr/plot/text', 'not numeric');
  const choose = async topic => {
    await page.locator('#topics button').filter({ hasText: topic }).waitFor({ state: 'attached' });
    await page.locator('#topics details').evaluateAll(nodes => nodes.forEach(n => (n.open = true)));
    await page.locator('#topics button').filter({ hasText: topic }).click();
  };
  await choose('yoinkr/plot/value');
  await page.waitForFunction(() => document.querySelector('#numeric-plot')?.dataset.samples === '5');
  assert.match(await page.locator('#plot-summary').innerText(), /latest 1.5/);
  assert.equal(await page.locator('#numeric-plot polyline').count(), 1);
  assert.doesNotMatch(await page.locator('#numeric-plot polyline').getAttribute('points'), /NaN|Infinity/);
  checks.push(
    'Owned MQTT broker messages produce the correct live finite numeric plot, filtering invalid/non-finite raw payloads'
  );
  await page.locator('#plot-pause').click();
  await pub('yoinkr/plot/value', '3');
  await page.locator('#payload').filter({ hasText: '3' }).waitFor();
  assert.equal(await page.locator('#numeric-plot').getAttribute('data-samples'), '5');
  await page.locator('#plot-pause').click();
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '6');
  checks.push('Pause freezes presentation while collection continues; Resume displays newly collected points');
  await page.locator('#plot-reset').click();
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '0');
  assert.match(await page.locator('#payload').innerText(), /3/);
  await pub('yoinkr/plot/value', '-5');
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '1');
  await page.locator('#plot-pause').click();
  await choose('yoinkr/plot/text');
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '0');
  assert.equal(await page.locator('#plot-pause').innerText(), 'Pause plot');
  await choose('yoinkr/plot/value');
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '1');
  checks.push('Reset affects only selected plot; topic switching never displays a paused plot as another topic');
  for (let i = 0; i < 260; i++) await pub('yoinkr/plot/value', String(i));
  await page.waitForFunction(() => document.querySelector('#numeric-plot').dataset.samples === '240');
  await page.locator('#plot-summary').filter({ hasText: 'latest 259' }).waitFor();
  const pairs = (await page.locator('#numeric-plot polyline').getAttribute('points')).split(' ');
  assert.equal(pairs.length, 240);
  checks.push('Live history and rendered SVG stay bounded at the newest 240 points');
  await page.screenshot({ path: join(out, 'native-plot.png'), fullPage: true });
  await pub('yoinkr/plot/value', '1e308');
  await pub('yoinkr/plot/value', '-1e308');
  await page.locator('#plot-summary').filter({ hasText: 'latest -1e+308' }).waitFor();
  assert.doesNotMatch(await page.locator('#numeric-plot polyline').getAttribute('points'), /NaN|Infinity/);
  checks.push('Extreme finite values produce finite normalized chart geometry');
  await page.screenshot({ path: join(out, 'native-plot-extremes.png'), fullPage: true });
  await page.locator('#plot-pause').click();
  await page.locator('#clear').click();
  await page.locator('#plot-section').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#topics button').count(), 0);
  await page.locator('#disconnect').click();
  await page.locator('#status').filter({ hasText: 'Disconnected' }).waitFor();
  assert.deepEqual(errors, []);
  checks.push('Clear history removes chart data even while paused; disconnect completes without renderer errors');
  const report = {
    version: '0.13.0',
    checks,
    errors,
    hostInfo: info,
    application: join(root, 'code/code'),
    casePath: transfer.casePath,
    donorUtilSha256: transfer.donor.sha256,
    installedFiles: transfer.installedFiles,
    broker: 'Owned loopback broker on ephemeral port',
    display: displayName,
    scope:
      'Actual copied native VS Code, no extensions. Original numeric conversion is reused; chart/store/host glue are new. This proves the listed feature subset, not full donor UI equivalence.'
  };
  await writeFile(join(out, 'VERIFICATION.json'), JSON.stringify(report, null, 2));
  console.log('NATIVE PLOT CHECKS PASSED:', checks.length);
  console.log('Evidence:', out);
} catch (e) {
  await writeFile(join(out, 'FAILED.txt'), e.stack ?? e.message);
  throw e;
} finally {
  await writeFile(join(out, 'native.log'), logs);
  await browser?.close().catch(() => {});
  if (publisher) await new Promise(r => publisher.end(true, {}, r));
  for (const socket of sockets) socket.destroy();
  await new Promise(r => server.close(r));
  await new Promise(r => broker.close(r));
  await terminate(app);
  await terminate(display);
}
