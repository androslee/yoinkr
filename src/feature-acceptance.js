import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cpus, arch, platform, totalmem } from 'node:os';
import { validateSharedSuite, replaySharedFeatureSuite, compareFeatureRuns } from './feature-verify.js';
import { sha256, saveJson, newDestination } from './workspace.js';
import { snapshotOwnedDriver, closeOwnedDriver } from './feature-ownership.js';
import { originalDonorDriver } from './feature-drivers/donor.js';
import { minimalFeatureDriver } from './feature-drivers/minimal.js';
import { vscodeFeatureDriver } from './feature-drivers/vscode.js';
import { until } from './feature-drivers/common.js';
export async function runSharedAcceptance({
  donorRoot,
  featurePackage,
  recipient,
  out: output,
  suitePath,
  xvfb,
  playwrightModule = process.env.PLAYWRIGHT_MODULE
} = {}) {
  for (const [name, value] of Object.entries({ donorRoot, featurePackage, recipient, output, xvfb }))
    if (typeof value !== 'string' || !value) throw Error('Missing acceptance input: ' + name);
  if (!playwrightModule) throw Error('PLAYWRIGHT_MODULE required');
  const suiteBytes = await readFile(
      suitePath ?? fileURLToPath(new URL('../recipes/mqtt-shared-acceptance/suite.json', import.meta.url))
    ),
    suite = validateSharedSuite(JSON.parse(suiteBytes));
  const baseline = await readFile(new URL('../recipes/mqtt-payload-baseline/recipe.json', import.meta.url));
  if (sha256(baseline) !== suite.baselineSha256) throw Error('Frozen baseline identity changed');
  const frozen = JSON.parse(baseline);
  if (frozen.scenarios.some(s => !suite.coverage.some(c => c.baseline === s.id)))
    throw Error('Frozen baseline scenario coverage incomplete');
  const out = await newDestination(
    output,
    await Promise.all([donorRoot, featurePackage, recipient].map(p => realpath(p)))
  );
  await mkdir(out, { recursive: false });
  await saveJson(join(out, 'ENVIRONMENT.json'), {
    schema: 1,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    platform: platform(),
    arch: arch(),
    node: process.versions.node,
    performancePolicy: suite.performance
  });
  const sourceFiles = [
    'feature-acceptance.js',
    'feature-ownership.js',
    'feature-verify.js',
    'feature-drivers/common.js',
    'feature-drivers/donor.js',
    'feature-drivers/minimal.js',
    'feature-drivers/vscode.js'
  ];
  const sourceRecords = [];
  await mkdir(join(out, 'source'));
  for (const name of sourceFiles) {
    const bytes = await readFile(new URL('./' + name, import.meta.url));
    await mkdir(join(out, 'source', name, '..'), { recursive: true });
    await writeFile(join(out, 'source', name), bytes, { flag: 'wx' });
    sourceRecords.push({ path: name, sha256: sha256(bytes) });
  }
  await saveJson(join(out, 'SOURCE.json'), sourceRecords);
  let display = '',
    x,
    driver;
  const runs = {},
    errors = [];
  try {
    x = spawn(resolve(xvfb), ['-displayfd', '1', '-screen', '0', '1400x1000x24', '-nolisten', 'tcp', '-ac'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    x.stdout.on('data', b => (display += b));
    x.stderr.on('data', () => {});
    await until(() => /^\d+\n/.test(display), 'owned Xvfb', 5000);
    const playwright = await import(playwrightModule);
    for (const kind of ['donor', 'minimal', 'recipient']) {
      const config = {
        donorRoot: resolve(donorRoot),
        featurePackage: resolve(featurePackage),
        adapterRoot: resolve(recipient),
        out: join(out, kind + '-session'),
        display: ':' + display.trim(),
        playwright
      };
      try {
        driver = await (kind === 'donor'
          ? originalDonorDriver(config)
          : kind === 'minimal'
            ? minimalFeatureDriver(config)
            : vscodeFeatureDriver(config));
        driver.identity.sourceHashes = {};
        for (const name of [
          'feature-verify.js',
          'feature-drivers/common.js',
          kind === 'recipient' ? 'feature-drivers/vscode.js' : 'feature-drivers/' + kind + '.js'
        ])
          driver.identity.sourceHashes[name] = sha256(await readFile(new URL('./' + name, import.meta.url)));
        runs[kind] = await replaySharedFeatureSuite(driver, suite, join(out, kind));
        console.log(kind, runs[kind].status, runs[kind].observations, 'observations', runs[kind].failures.slice(0, 3));
      } finally {
        if (driver) {
          const owned = await snapshotOwnedDriver(driver),
            cleanup = await closeOwnedDriver(driver, owned);
          await saveJson(join(out, kind + '-CLEANUP.json'), cleanup);
          if (!cleanup.applicationExited || !cleanup.browserDisconnected || cleanup.remainingOwnedPids.length)
            errors.push(kind + ' owned resources did not close');
        }
        driver = null;
      }
    }
    for (const kind of ['minimal', 'recipient']) {
      const result = await compareFeatureRuns(
        runs.donor.directory,
        runs[kind].directory,
        join(out, kind + '-comparison.json')
      );
      console.log(kind, 'comparison:', result.status, result.differences.slice(0, 3));
      if (result.status !== 'passed') errors.push(kind + ' comparison failed');
    }
  } catch (e) {
    errors.push(e.stack ?? e.message);
  } finally {
    await driver?.close().catch(() => {});
    if (x && x.exitCode === null) {
      x.kill('SIGTERM');
      await new Promise(r => {
        x.once('exit', r);
        setTimeout(() => {
          if (x.exitCode === null) x.kill('SIGKILL');
          r();
        }, 2000).unref();
      });
    }
  }
  for (const source of sourceRecords)
    if (sha256(await readFile(new URL('./' + source.path, import.meta.url))) !== source.sha256)
      errors.push('Acceptance implementation changed during execution: ' + source.path);
  const result = {
    schema: 1,
    status: errors.length ? 'failed' : 'passed',
    suiteSha256: sha256(suiteBytes),
    baselineSha256: suite.baselineSha256,
    runs: Object.fromEntries(
      Object.entries(runs).map(([k, r]) => [
        k,
        { directory: r.directory, status: r.status, observations: r.observations, failures: r.failures }
      ])
    ),
    errors,
    cleanup: { displayExited: !x || x.exitCode !== null || x.signalCode !== null }
  };
  const files = [];
  for (const name of [
    'ENVIRONMENT.json',
    'SOURCE.json',
    'donor-CLEANUP.json',
    'minimal-CLEANUP.json',
    'recipient-CLEANUP.json',
    'minimal-comparison.json',
    'recipient-comparison.json',
    ...sourceRecords.map(s => 'source/' + s.path)
  ])
    try {
      const bytes = await readFile(join(out, name));
      files.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
    } catch {}
  result.files = files;
  await saveJson(join(out, 'RESULT.json'), result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
