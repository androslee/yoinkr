import { createRequire } from 'node:module';
import { homedir } from 'node:os';
/** Portable, recipe-only delivery. No downloads, shell commands or user profiles. */
import { readFile, writeFile, mkdir, readdir, lstat, realpath, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sha256, readJson, saveJson, writeState, newDestination, inside, containedFile } from './workspace.js';
import { canonical, validateRecoveryRecipe, buildFeaturePackage, verifyFeaturePackage } from './feature-package.js';
import { probeVsCodeAdapter } from './host-adapters/vscode.js';
import { probeJoplinAdapter } from './host-adapters/joplin.js';
import { applyHostAdapter, hostAdapterStatus, rollbackHostAdapter } from './host-adapters/index.js';
import { YOINKR_VERSION } from './version.js';
const project = fileURLToPath(new URL('..', import.meta.url));
const assets = {
  'recovery.json': 'recipes/mqtt-raw-diff/recipe.json',
  'vscode.json': 'recipes/vscode-raw-diff/adapter.json',
  'joplin.json': 'recipes/joplin-raw-diff/adapter.json',
  'suite.json': 'recipes/mqtt-shared-acceptance/suite.json',
  'baseline.json': 'recipes/mqtt-payload-baseline/recipe.json',
  'samples.json': 'recipes/public-delivery/samples.json',
  'GUIDE.md': 'docs/PORTABLE_DELIVERY.md',
  'NOTICE.md': 'recipes/public-delivery/NOTICE.md'
};
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z
  .object({
    schema: z.literal(1),
    kind: z.literal('modkit-portable-recipes'),
    id: z.literal('mqtt-raw-diff-two-hosts'),
    modkitVersion: z.string().max(40),
    platform: z.literal('linux'),
    arch: z.literal('x64'),
    windows: z.literal('unsupported-native-lane-not-verified'),
    distribution: z.literal('recipes-only-local-donor-inputs'),
    files: z
      .array(
        z
          .object({
            path: z.enum(Object.keys(assets)),
            sha256: digest,
            bytes: z
              .number()
              .int()
              .min(1)
              .max(2 * 1024 * 1024)
          })
          .strict()
      )
      .length(Object.keys(assets).length),
    digest
  })
  .strict();
const p = z.string().min(1).max(4096);
const configSchema = z
  .object({
    schema: z.literal(1),
    bundle: p,
    donor: p,
    source: p,
    runtimes: z.object({ vscode: p, joplin: p }).strict(),
    outputRoot: p,
    xvfb: p,
    playwrightModule: p
  })
  .strict();
async function fileBytes(root, name) {
  const path = join(root, name);
  if ((await lstat(path)).isSymbolicLink()) throw Error('Symlink refused: ' + name);
  const s = await stat(path);
  if (!s.isFile() || s.size > 2 * 1024 * 1024) throw Error('Recipe file is not ordinary/bounded: ' + name);
  return readFile(await containedFile(root, name));
}
export async function inspectDeliveryBundle(directory) {
  const root = await realpath(directory),
    m = manifestSchema.parse(JSON.parse(await fileBytes(root, 'BUNDLE.json')));
  const { digest: expected, ...semantic } = m;
  if (sha256(canonical(semantic)) !== expected) throw Error('Bundle manifest digest changed');
  const names = m.files.map(f => f.path);
  if (new Set(names).size !== Object.keys(assets).length) throw Error('Duplicate/missing recipe file');
  const entries = await readdir(root);
  if (entries.length !== names.length + 1 || entries.some(n => n !== 'BUNDLE.json' && !names.includes(n)))
    throw Error('Untracked bundle content refused');
  for (const f of m.files) {
    const b = await fileBytes(root, f.path);
    if (b.length !== f.bytes || sha256(b) !== f.sha256) throw Error('Bundle file changed: ' + f.path);
  }
  return {
    directory: root,
    ...m,
    status: 'integrity-verified',
    authenticity: 'Digest checks integrity, not publisher authenticity; review recipe provenance before execution.'
  };
}
async function copyBundle(source, out) {
  const m = await inspectDeliveryBundle(source),
    dest = await newDestination(out, [m.directory]);
  if (inside(dest, m.directory)) throw Error('Output cannot contain bundle input');
  await mkdir(dest, { recursive: false, mode: 0o700 });
  for (const n of [...m.files.map(f => f.path), 'BUNDLE.json'])
    await writeFile(join(dest, n), await fileBytes(m.directory, n), { flag: 'wx', mode: 0o600 });
  return inspectDeliveryBundle(dest);
}
export const importDeliveryBundle = copyBundle;
export async function exportDeliveryBundle(out) {
  const dest = await newDestination(out, [project]);
  if (inside(dest, project)) throw Error('Output cannot contain source checkout');
  await mkdir(dest, { recursive: false, mode: 0o700 });
  const files = [];
  for (const [path, source] of Object.entries(assets)) {
    const bytes = await readFile(join(project, source));
    if (bytes.length > 2 * 1024 * 1024) throw Error('Public recipe exceeds size limit');
    await writeFile(join(dest, path), bytes, { flag: 'wx', mode: 0o600 });
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  const semantic = {
    schema: 1,
    kind: 'modkit-portable-recipes',
    id: 'mqtt-raw-diff-two-hosts',
    modkitVersion: YOINKR_VERSION,
    platform: 'linux',
    arch: 'x64',
    windows: 'unsupported-native-lane-not-verified',
    distribution: 'recipes-only-local-donor-inputs',
    files: files.sort((a, b) => a.path.localeCompare(b.path))
  };
  await saveJson(join(dest, 'BUNDLE.json'), { ...semantic, digest: sha256(canonical(semantic)) });
  return inspectDeliveryBundle(dest);
}
export async function loadDeliveryConfig(file) {
  const path = await realpath(file),
    bytes = await readFile(path);
  if (bytes.length > 32768) throw Error('Delivery config exceeds 32 KiB');
  const input = configSchema.parse(JSON.parse(bytes)),
    base = dirname(path),
    absolute = v => resolve(base, v);
  const config = {
    ...input,
    bundle: absolute(input.bundle),
    donor: absolute(input.donor),
    source: absolute(input.source),
    runtimes: Object.fromEntries(Object.entries(input.runtimes).map(([k, v]) => [k, absolute(v)])),
    outputRoot: absolute(input.outputRoot),
    xvfb: absolute(input.xvfb),
    playwrightModule: absolute(input.playwrightModule)
  };
  return { path, sha256: sha256(bytes), config };
}
export async function checkDelivery(file) {
  const loaded = await loadDeliveryConfig(file),
    c = loaded.config,
    checks = [];
  async function check(name, fn) {
    try {
      const detail = await fn();
      checks.push({ name, status: 'passed', detail });
      return detail;
    } catch (e) {
      checks.push({ name, status: 'blocked', error: e.message });
      return null;
    }
  }
  await check('platform', () => {
    if (process.platform !== 'linux' || process.arch !== 'x64')
      throw Error('Native delivery is verified only for Linux x86-64; Windows native acceptance is pending.');
    return { platform: process.platform, arch: process.arch };
  });
  await check('node', () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (!((major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26))
      throw Error('Use the Node version range in package.json');
    return process.versions.node;
  });
  const bundle = await check('bundle integrity', () => inspectDeliveryBundle(c.bundle));
  await check('output isolation', async () => {
    const inputs = await Promise.all([c.donor, c.source, c.bundle, ...Object.values(c.runtimes)].map(n => realpath(n)));
    const out = await newDestination(c.outputRoot, inputs);
    for (const r of inputs) if (inside(out, r)) throw Error('Output cannot contain an input');
    try {
      const s = await lstat(out);
      if (s.isSymbolicLink() || !s.isDirectory()) throw Error('Output root must be an ordinary directory');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return out;
  });
  await check('compiler', async () => ({ esbuild: (await import('esbuild')).version }));
  await check('playwright', async () => {
    const entry = await realpath(c.playwrightModule);
    await access(entry, constants.R_OK);
    const metadata = await readJson(join(dirname(entry), 'package.json'));
    if (metadata.name !== 'playwright' || metadata.version !== '1.61.1' || entry !== join(dirname(entry), 'index.mjs'))
      throw Error('Supply Playwright 1.61.1 index.mjs; other tooling versions need separate acceptance');
    // Resolve/read metadata only. A read-only doctor must never import operator-selected JavaScript.
    const core = dirname(createRequire(entry).resolve('playwright-core/package.json')),
      browsers = (await readJson(join(core, 'browsers.json'))).browsers;
    const cache =
      process.env.PLAYWRIGHT_BROWSERS_PATH === '0'
        ? join(core, '.local-browsers')
        : process.env.PLAYWRIGHT_BROWSERS_PATH
          ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH)
          : join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ms-playwright');
    for (const [name, folder, exe] of [
      ['chromium', 'chromium', 'chrome-linux64/chrome'],
      ['chromium-headless-shell', 'chromium_headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']
    ]) {
      const revision = browsers.find(b => b.name === name)?.revision;
      if (!/^\d+$/.test(revision ?? '')) throw Error('Missing browser revision metadata');
      await access(join(cache, folder + '-' + revision, exe), constants.X_OK);
    }
    return {
      version: metadata.version,
      browsers: 'Cached Chromium and headless shell available; shared-library startup checked during replay',
      executesTooling: false
    };
  });
  await check('Xvfb', async () => {
    await access(c.xvfb, constants.X_OK);
    if (!(await stat(c.xvfb)).isFile()) throw Error('Xvfb must be a file');
    return 'Executable available; display startup checked during replay';
  });
  if (bundle) {
    await check('donor pins and recovery source', async () => {
      const recipe = validateRecoveryRecipe(await readJson(join(c.bundle, 'recovery.json'))),
        donor = await realpath(c.donor),
        source = await realpath(c.source);
      for (const [root, files] of [
        [donor, recipe.inputs],
        [source, recipe.files]
      ])
        for (const f of files)
          if (sha256(await readFile(await containedFile(root, f.path))) !== f.sha256)
            throw Error('Pinned input changed: ' + f.path);
      return { revision: recipe.revision, inputs: recipe.inputs.length, sources: recipe.files.length };
    });
    for (const host of ['vscode', 'joplin'])
      await check(host + ' runtime pins', async () => {
        const probe = await (host === 'vscode' ? probeVsCodeAdapter : probeJoplinAdapter)(
          c.runtimes[host],
          join(c.bundle, host + '.json')
        );
        return { version: probe.recipe.target.version, files: probe.recipe.files.length };
      });
    await check('frozen suite binding', async () => {
      const suite = await readJson(join(c.bundle, 'suite.json'));
      if (suite.baselineSha256 !== sha256(await readFile(join(c.bundle, 'baseline.json'))))
        throw Error('Baseline/suite identity differs');
      return suite.id;
    });
  }
  return {
    schema: 1,
    status: checks.every(c => c.status === 'passed') ? 'ready' : 'blocked',
    configSha256: loaded.sha256,
    bundleDigest: bundle?.digest ?? null,
    checks,
    scope:
      'Prerequisite checks do not execute applications or prove runtime acceptance. Acquisition is separate; delivery never downloads inputs.'
  };
}
function escape(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
async function resultReport(root, state) {
  let origins = {};
  try {
    origins = {
      provenance: await readJson(join(root, 'feature', 'PROVENANCE.json')),
      transformations: await readJson(join(root, 'feature', 'TRANSFORMS.json')),
      dependencies: await readJson(join(root, 'feature', 'DEPENDENCIES.json'))
    };
  } catch {}
  const html =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Yoinkr delivery result</title><style>body{background:#111827;color:#e5e7eb;font:16px system-ui;max-width:1050px;margin:32px auto;padding:20px}h1,h2{color:#93c5fd}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1f2937;padding:16px;border-radius:8px}li{margin:10px 0}a{color:#93c5fd}</style><h1>Recovered feature delivery</h1><p>' +
    escape(state.status) +
    ' · ' +
    escape(state.id) +
    '</p><p>Original MQTT Explorer Raw/Diff UI; newly written recipient bootstrap, selection, clipboard, theme and persistence adapters. No marketplace extensions. Joplin acceptance uses built-in safe mode.</p><h2>Progress and acceptance</h2><pre>' +
    escape(JSON.stringify(state, null, 2)) +
    '</pre><h2>Original code, transformations and new glue</h2><p>feature/originals retains unchanged donor files; feature/transformed records explicit repairs; feature/adapters and recipient playbooks contain integration glue. Dependencies and license notices remain in the local recovered package. Recipe sharing does not authorize redistribution of donor applications or packages.</p><pre>' +
    escape(JSON.stringify(origins, null, 2)) +
    '</pre><h2>Platform scope</h2><p>Linux x86-64 only. Windows native integration remains unverified. Evidence describes these exact inputs and scenarios, not all features of either application.</p></html>';
  await writeFile(join(root, 'REPORT.html'), html, { mode: 0o600 });
}
export async function runDelivery(file, { onProgress = () => {} } = {}) {
  const checked = await checkDelivery(file);
  if (checked.status !== 'ready')
    throw Error(
      'Prerequisites blocked: ' +
        checked.checks
          .filter(c => c.status === 'blocked')
          .map(c => c.name + ': ' + c.error)
          .join('; ')
    );
  const loaded = await loadDeliveryConfig(file);
  if (loaded.sha256 !== checked.configSha256) throw Error('Delivery config changed during checks');
  const c = loaded.config;
  const output = await newDestination(
      c.outputRoot,
      await Promise.all([c.donor, c.source, c.bundle, ...Object.values(c.runtimes)].map(p => realpath(p)))
    ),
    id = 'delivery-' + randomUUID();
  await mkdir(output, { recursive: true, mode: 0o700 });
  const root = join(output, id);
  await mkdir(root, { mode: 0o700 });
  const state = {
    schema: 1,
    kind: 'modkit-delivery-run',
    id,
    status: 'running',
    modkitVersion: YOINKR_VERSION,
    platform: process.platform,
    arch: process.arch,
    configSha256: loaded.sha256,
    bundleDigest: checked.bundleDigest,
    steps: [],
    featureDigest: null,
    acceptance: null,
    error: null
  };
  const persist = async () => {
    await writeState(join(root, 'STATUS.json'), state);
    await resultReport(root, state);
  };
  async function step(name, fn) {
    const s = { name, status: 'running', startedAt: new Date().toISOString() };
    state.steps.push(s);
    await persist();
    onProgress({ directory: root, ...s });
    try {
      const value = await fn();
      s.status = 'passed';
      s.finishedAt = new Date().toISOString();
      await persist();
      onProgress({ directory: root, ...s });
      return value;
    } catch (e) {
      s.status = 'failed';
      s.error = e.message;
      throw e;
    }
  }
  await saveJson(join(root, 'PREREQUISITES.json'), checked);
  try {
    const bundle = await step('Snapshot portable recipes', () => copyBundle(c.bundle, join(root, 'recipes')));
    if (bundle.digest !== checked.bundleDigest) throw Error('Bundle changed after prerequisites');
    const feature = await step('Recover and compile original feature', () =>
      buildFeaturePackage(join(root, 'recipes', 'recovery.json'), {
        donorRoot: c.donor,
        sourceRoot: c.source,
        route: 'source',
        out: join(root, 'feature')
      })
    );
    state.featureDigest = feature.digest;
    for (const host of ['vscode', 'joplin'])
      await step('Install fresh ' + host + ' recipient', () =>
        applyHostAdapter(join(root, 'recipes', host + '.json'), {
          runtime: c.runtimes[host],
          featurePackage: join(root, 'feature'),
          out: join(root, host)
        })
      );
    const { replayDelivery } = await import('./delivery-acceptance.js');
    await step('Replay original donor and both recipients', async () => {
      state.acceptance = await replayDelivery({
        donor: c.donor,
        root,
        xvfb: c.xvfb,
        playwrightModule: c.playwrightModule
      });
      if (state.acceptance.status !== 'passed')
        throw Error(
          'Runtime acceptance failed: ' + state.acceptance.errors.join('; ') + '; inspect acceptance/RESULT.json'
        );
      return state.acceptance;
    });
    state.status = 'passed';
  } catch (e) {
    state.status = 'failed';
    state.error = e.stack ?? e.message;
  }
  await persist();
  return { directory: root, ...state, report: join(root, 'REPORT.html') };
}
export async function deliveryStatus(directory) {
  const root = await realpath(directory),
    s = await readJson(await containedFile(root, 'STATUS.json'));
  if (s.kind !== 'modkit-delivery-run' || !/^delivery-[a-f0-9-]{36}$/.test(s.id)) throw Error('Invalid delivery run');
  const current = {};
  for (const host of ['vscode', 'joplin'])
    try {
      current[host] = await hostAdapterStatus(join(root, host));
    } catch (e) {
      current[host] = { error: e.message };
    }
  let feature;
  try {
    feature = await verifyFeaturePackage(join(root, 'feature'), { expectedDigest: s.featureDigest ?? undefined });
  } catch (e) {
    feature = { error: e.message };
  }
  return {
    directory: root,
    ...s,
    current,
    feature,
    scope: 'Recorded acceptance is historical; current integrity is listed separately.'
  };
}
export async function rollbackDelivery(directory) {
  const root = await realpath(directory);
  await deliveryStatus(root);
  const checks = [];
  // Preflight both before changing either recipient. Refuse drift, never force it.
  for (const host of ['vscode', 'joplin']) {
    const path = join(root, host);
    if ((await realpath(path)) !== path) throw Error('Recipient symlink refused');
    checks.push({ host, plan: await rollbackHostAdapter(path, { dryRun: true }) });
  }
  for (const host of ['vscode', 'joplin']) {
    const path = join(root, host);
    if ((await realpath(path)) !== path) throw Error('Recipient symlink refused');
    checks.push({ host, result: await rollbackHostAdapter(path, { dryRun: false }) });
  }
  const record = {
    schema: 1,
    status: 'restored',
    checks,
    scope:
      'Hash-checked restoration of both fresh lab copies; original installations were never modified. Lab profiles are retained.'
  };
  await writeState(join(root, 'ROLLBACK.json'), record);
  const state = await readJson(join(root, 'STATUS.json'));
  state.rollback = { status: 'restored', at: new Date().toISOString() };
  await writeState(join(root, 'STATUS.json'), state);
  await resultReport(root, state);
  return record;
}
