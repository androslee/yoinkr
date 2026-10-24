import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  installVsCodeBridge,
  rollbackVsCodeBridge,
  vsCodeBridgeStatus
} from '../../src/host-adapters/vscode-bridge.js';
import { until } from '../../src/feature-drivers/common.js';
import { saveJson } from '../../src/workspace.js';
const f = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (
    !['--runtime', '--package', '--recipe', '--python', '--out', '--xvfb'].includes(process.argv[i]) ||
    !process.argv[i + 1]
  )
    throw Error('Explicit runtime/package/recipe/python/out/xvfb required');
  f[process.argv[i].slice(2)] = resolve(process.argv[i + 1]);
}
for (const k of ['runtime', 'package', 'recipe', 'python', 'out', 'xvfb']) if (!f[k]) throw Error(k + ' required');
let app,
  x,
  display = '';
const checks = [],
  errors = [];
const check = (n, v) => {
  assert.ok(v, n);
  checks.push(n);
};
try {
  await installVsCodeBridge(f.runtime, f.package, f.recipe, f.out, f.python);
  await mkdir(join(f.out, 'rollback-proof'));
  const changed = join(f.out, 'workspace/runtime/resources/app/modkit-native/component/bridge/worker.py'),
    original = await readFile(changed);
  await writeFile(changed, 'deliberate drift');
  check(
    'Changed worker refuses rollback',
    await rollbackVsCodeBridge(f.out).then(
      () => false,
      () => true
    )
  );
  await writeFile(changed, original);
  await rollbackVsCodeBridge(f.out, { dryRun: true });
  check('Dry-run leaves component installed', (await vsCodeBridgeStatus(f.out)).status === 'applied');
  await rollbackVsCodeBridge(f.out);
  const restored = await vsCodeBridgeStatus(f.out);
  await saveJson(join(f.out, 'rollback-proof/STATUS.json'), restored);
  check(
    'Rollback restores original pins and removes entire bridge',
    restored.clean && restored.status === 'rolled-back' && restored.feature === null
  );
  x = spawn(f.xvfb, ['-displayfd', '1', '-screen', '0', '1400x1000x24', '-nolisten', 'tcp', '-ac']);
  x.stdout.on('data', b => (display += b));
  x.stderr.on('data', () => {});
  await until(() => display.includes('\n'), 'owned rollback display');
  const profile = await mkdtemp(join(tmpdir(), 'mk24-original-'));
  await mkdir(join(profile, 'u/User'), { recursive: true });
  await mkdir(join(profile, 'e'));
  await writeFile(
    join(profile, 'u/User/settings.json'),
    JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'workbench.startupEditor': 'none',
      'security.workspace.trust.enabled': false
    })
  );
  const fixture = join(f.out, 'rollback-proof/original.txt');
  await writeFile(fixture, 'Original editor after bridge rollback');
  const { _electron } = await import(process.env.PLAYWRIGHT_MODULE);
  app = await _electron.launch({
    executablePath: join(f.out, 'workspace/runtime/code'),
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--user-data-dir=' + join(profile, 'u'),
      '--extensions-dir=' + join(profile, 'e'),
      fixture
    ],
    env: { ...process.env, DISPLAY: ':' + display.trim(), ELECTRON_RUN_AS_NODE: undefined },
    timeout: 45000
  });
  await until(() => app.windows().some(p => p.url().includes('/workbench.html')), 'restored workbench', 45000);
  const page = app.windows().find(p => p.url().includes('/workbench.html'));
  await page.locator('.monaco-editor').first().waitFor();
  check(
    'Restored original app has no bridge menu',
    await app.evaluate(({ Menu }) => !Menu.getApplicationMenu()?.getMenuItemById('modkit-native-menu'))
  );
  await page.screenshot({ path: join(f.out, 'rollback-proof/restored-original.png') });
  await app.close();
  app = null;
} catch (e) {
  errors.push(e.stack ?? e.message);
} finally {
  await app?.close().catch(() => {});
  if (x && x.exitCode === null) {
    x.kill();
    await new Promise(r => {
      x.once('exit', r);
      setTimeout(() => {
        if (x.exitCode === null) x.kill('SIGKILL');
        r();
      }, 2000).unref();
    });
  }
}
const result = { schema: 1, status: errors.length ? 'failed' : 'passed', checks, checksPassed: checks.length, errors };
await saveJson(join(f.out, 'rollback-proof/RESULT.json'), result);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
