/** Original donor + minimal host + both real recipients, on one owned display. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { readJson, saveJson, sha256 } from './workspace.js';
import { validateSharedSuite, replaySharedFeatureSuite, compareFeatureRuns } from './feature-verify.js';
import { originalDonorDriver } from './feature-drivers/donor.js';
import { minimalFeatureDriver } from './feature-drivers/minimal.js';
import { vscodeFeatureDriver } from './feature-drivers/vscode.js';
import { joplinFeatureDriver } from './feature-drivers/joplin.js';
import { snapshotOwnedDriver, closeOwnedDriver } from './feature-ownership.js';
import { until } from './feature-drivers/common.js';
export async function replayDelivery({ donor, root, xvfb, playwrightModule }) {
  const out = join(root, 'acceptance');
  await mkdir(out);
  const suiteBytes = await readFile(join(root, 'recipes', 'suite.json')),
    suite = validateSharedSuite(JSON.parse(suiteBytes));
  if (sha256(await readFile(join(root, 'recipes', 'baseline.json'))) !== suite.baselineSha256)
    throw Error('Frozen baseline changed');
  const methodFiles = [
      'delivery.js',
      'delivery-acceptance.js',
      'feature-verify.js',
      'feature-ownership.js',
      'feature-drivers/common.js',
      'feature-drivers/donor.js',
      'feature-drivers/minimal.js',
      'feature-drivers/vscode.js',
      'feature-drivers/joplin.js'
    ],
    method = [];
  await mkdir(join(out, 'method'));
  for (const file of methodFiles) {
    const bytes = await readFile(new URL('./' + file, import.meta.url));
    await mkdir(join(out, 'method', file, '..'), { recursive: true });
    await writeFile(join(out, 'method', file), bytes, { flag: 'wx' });
    method.push({ path: 'method/' + file, sha256: sha256(bytes), bytes: bytes.length });
  }
  await saveJson(join(out, 'ENVIRONMENT.json'), {
    schema: 1,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    playwrightModule,
    networkIsolation: 'Established externally by the invoking test lane; not inferred by this runner.'
  });
  const runs = {},
    comparisons = {},
    cleanup = {},
    errors = [];
  let x,
    display = '',
    displayError = '',
    driver;
  try {
    x = spawn(xvfb, ['-displayfd', '1', '-screen', '0', '1400x1000x24', '-nolisten', 'tcp', '-ac'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let startError;
    x.on('error', e => {
      startError = e;
    });
    x.stdout.on('data', b => (display += b));
    x.stderr.on('data', b => {
      displayError = (displayError + b).slice(-4000);
    });
    await until(
      () => {
        if (startError) throw startError;
        if (x.exitCode !== null) throw Error('Xvfb failed: ' + displayError);
        return /^\d+\n/.test(display);
      },
      'owned delivery display',
      5000
    );
    const playwright = await import(playwrightModule);
    const factories = {
      donor: originalDonorDriver,
      minimal: minimalFeatureDriver,
      vscode: vscodeFeatureDriver,
      joplin: joplinFeatureDriver
    };
    for (const [kind, create] of Object.entries(factories)) {
      try {
        driver = await create({
          donorRoot: donor,
          featurePackage: join(root, 'feature'),
          adapterRoot: join(root, kind),
          out: join(out, kind + '-session'),
          display: ':' + display.trim(),
          playwright
        });
        runs[kind] = await replaySharedFeatureSuite(driver, suite, join(out, kind));
        if (runs[kind].status !== 'passed') errors.push(kind + ' shared observations failed');
        if (kind !== 'donor') {
          comparisons[kind] = await compareFeatureRuns(
            runs.donor.directory,
            runs[kind].directory,
            join(out, kind + '-comparison.json')
          );
          if (comparisons[kind].status !== 'passed') errors.push(kind + ' donor comparison failed');
        }
      } finally {
        if (driver) {
          const owned = await snapshotOwnedDriver(driver);
          cleanup[kind] = await closeOwnedDriver(driver, owned);
          if (
            !cleanup[kind].applicationExited ||
            !cleanup[kind].browserDisconnected ||
            cleanup[kind].remainingOwnedPids.length
          )
            errors.push(kind + ' cleanup failed');
          driver = null;
        }
      }
    }
  } catch (e) {
    errors.push((e.stack ?? e.message) + (displayError ? '\nDisplay diagnostic: ' + displayError : ''));
  } finally {
    if (driver) await driver.close().catch(e => errors.push(e.message));
    if (x && x.exitCode === null && x.signalCode === null) {
      x.kill('SIGTERM');
      await new Promise(r => {
        x.once('exit', r);
        setTimeout(() => {
          if (x.exitCode === null && x.signalCode === null) x.kill('SIGKILL');
          r();
        }, 2000).unref();
      });
    }
  }
  for (const file of method)
    if (sha256(await readFile(new URL('./' + file.path.slice(7), import.meta.url))) !== file.sha256)
      errors.push('Acceptance method changed during replay: ' + file.path);
  const result = {
    schema: 1,
    method,
    status: errors.length ? 'failed' : 'passed',
    suiteSha256: sha256(suiteBytes),
    runs: Object.fromEntries(
      Object.entries(runs).map(([k, v]) => [
        k,
        { status: v.status, observations: v.observations, failures: v.failures }
      ])
    ),
    comparisons: Object.fromEntries(
      Object.entries(comparisons).map(([k, v]) => [
        k,
        { status: v.status, differences: v.differences, approvedDifferences: v.approvedDifferences }
      ])
    ),
    cleanup,
    displayExited: !x || x.exitCode !== null || x.signalCode !== null,
    errors
  };
  if (!result.displayExited) {
    result.status = 'failed';
    result.errors.push('Owned display did not exit');
  }
  await saveJson(join(out, 'RESULT.json'), result);
  return result;
}
