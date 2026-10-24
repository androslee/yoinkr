import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { vscodeFeatureDriver } from '../../src/feature-drivers/vscode.js';
import { replaySharedFeatureSuite, compareFeatureRuns } from '../../src/feature-verify.js';
import { snapshotOwnedDriver, closeOwnedDriver } from '../../src/feature-ownership.js';
import { until } from '../../src/feature-drivers/common.js';
import { saveJson, sha256 } from '../../src/workspace.js';
const f = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--original', '--repaired', '--donor-run', '--out', '--xvfb'].includes(process.argv[i]) || !process.argv[i + 1])
    throw Error('Explicit original/repaired/donor-run/out/xvfb required');
  f[process.argv[i].slice(2)] = resolve(process.argv[i + 1]);
}
for (const k of ['original', 'repaired', 'donor-run', 'out', 'xvfb']) if (!f[k]) throw Error(k + ' required');
await mkdir(f.out);
const suite = JSON.parse(await readFile(new URL('../../recipes/mqtt-shared-acceptance/suite.json', import.meta.url))),
  checks = [],
  errors = [],
  runs = {},
  cleanup = {},
  comparisons = {};
let x,
  d,
  display = '';
const method = [];
for (const path of [
  'src/feature-drivers/vscode.js',
  'src/feature-drivers/common.js',
  'src/feature-verify.js',
  'src/host-adapters/vscode.js',
  'scripts/applications/verify-repaired-host.mjs'
]) {
  const bytes = await readFile(new URL('../../' + path, import.meta.url));
  await mkdir(join(f.out, 'method', path, '..'), { recursive: true });
  await writeFile(join(f.out, 'method', path), bytes);
  method.push({ path: 'method/' + path, sha256: sha256(bytes), bytes: bytes.length });
}
try {
  x = spawn(f.xvfb, ['-displayfd', '1', '-screen', '0', '1400x1000x24', '-nolisten', 'tcp', '-ac']);
  x.stdout.on('data', b => (display += b));
  x.stderr.on('data', () => {});
  await until(() => display.includes('\n'), 'repair display');
  const playwright = await import(process.env.PLAYWRIGHT_MODULE);
  for (const key of ['original', 'repaired']) {
    d = await vscodeFeatureDriver({
      adapterRoot: f[key],
      out: join(f.out, key + '-session'),
      display: ':' + display.trim(),
      playwright
    });
    runs[key] = await replaySharedFeatureSuite(d, suite, join(f.out, key));
    comparisons[key] = await compareFeatureRuns(
      f['donor-run'],
      runs[key].directory,
      join(f.out, key + '-comparison.json')
    );
    if (runs[key].status !== 'passed' || comparisons[key].status !== 'passed')
      throw Error(key + ' scenario assertions/comparison failed');
    checks.push(key + ' passes 19 shared checkpoints with frozen package/suite');
    const owned = await snapshotOwnedDriver(d);
    cleanup[key] = await closeOwnedDriver(d, owned);
    d = null;
    if (!cleanup[key].applicationExited || cleanup[key].remainingOwnedPids.length)
      throw Error(key + ' owned resources leaked');
    checks.push(key + ' owned resources close');
  }
} catch (e) {
  errors.push(e.stack ?? e.message);
} finally {
  await d?.close().catch(() => {});
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
for (const m of method)
  if (sha256(await readFile(new URL('../../' + m.path.slice(7), import.meta.url))) !== m.sha256)
    errors.push('Method changed');
const result = {
  schema: 1,
  status: errors.length ? 'failed' : 'passed',
  checks,
  errors,
  runs: Object.fromEntries(
    Object.entries(runs).map(([k, r]) => [
      k,
      { directory: r.directory, status: r.status, observations: r.observations, driver: r.driver }
    ])
  ),
  cleanup,
  comparisons: Object.fromEntries(
    Object.entries(comparisons).map(([k, r]) => [
      k,
      { status: r.status, approvedDifferences: r.approvedDifferences, differences: r.differences }
    ])
  ),
  files: method
};
await saveJson(join(f.out, 'RESULT.json'), result);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
