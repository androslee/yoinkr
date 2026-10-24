import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, realpath, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { inspectUIRecipe, sameUIRegistration } from './ui-recipe.js';
import { readCase } from './investigation.js';
import { inside, containedFile, saveJson, readJson, sha256 } from './workspace.js';
import { validatePNG } from './examples.js';
async function ownedWorker(job, { timeoutMs = 60000 } = {}) {
  return new Promise(resolve => {
    const child = fork(fileURLToPath(new URL('./ui-worker.mjs', import.meta.url)), [], {
      detached: process.platform !== 'win32',
      execArgv: ['--max-old-space-size=256'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let stopping = false,
      failure = null,
      complete = null,
      log = '',
      bytes = 0,
      killTimer;
    const steps = [];
    function signal(sig) {
      if (!child.pid) return;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch (e) {
        if (e.code !== 'ESRCH') child.kill(sig);
      }
    }
    function stop(error) {
      failure ??= error;
      if (stopping) return;
      stopping = true;
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), 1500);
    }
    const timer = setTimeout(() => stop('UI worker deadline exceeded'), timeoutMs);
    const output = chunk => {
      bytes += chunk.length;
      log = (log + chunk.toString()).slice(-4000);
      if (bytes > 1024 * 1024) stop('UI worker output exceeded limit');
    };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    child.on('message', message => {
      if (Buffer.byteLength(JSON.stringify(message)) > 128000) return stop('UI worker result exceeded limit');
      if (message.type === 'step' && steps.length < 32) steps.push(message.result);
      else if (message.type === 'complete') complete = message;
      else if (message.type === 'fatal') failure = message.error;
    });
    child.on('error', e => {
      failure = e.message;
    });
    child.on('close', (code, signalName) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({
        steps: complete?.steps ?? steps,
        errors: complete?.errors ?? [],
        blocked: complete?.blocked ?? [],
        finalScreenshot: complete?.finalScreenshot ?? null,
        failure:
          failure ??
          (code !== 0
            ? 'UI worker exited ' + (signalName ?? code)
            : !complete
              ? 'UI worker returned no completion'
              : null),
        log
      });
    });
    child.send(job, e => {
      if (e) stop(e.message);
    });
  });
}
export async function runUICheck(
  registration,
  { playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright', timeoutMs = 60000 } = {}
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000)
    throw Error('UI deadline must be 1000–60000 ms');
  const current = await inspectUIRecipe(registration.path);
  if (!sameUIRegistration(registration, current)) throw Error('registered UI recipe or inputs changed; register again');
  if (current.target === current.casePath || inside(current.target, current.casePath))
    throw Error('UI output must be outside target');
  const parent = join(current.casePath, 'ui-checks');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (!inside(current.casePath, await realpath(parent))) throw Error('UI checks directory escaped case');
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID(),
    directory = join(parent, id);
  await mkdir(directory, { mode: 0o700 });
  const inputs = [];
  for (const f of current.files) {
    const bytes = await readFile(f.source);
    if (sha256(bytes) !== f.sha256) throw Error('UI input changed while snapshotting');
    const name = 'inputs/' + (f.kind === 'app' ? 'app' : 'fixtures') + '/' + f.path,
      target = join(directory, name);
    await mkdir(join(target, '..'), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    inputs.push({ path: name, sha256: f.sha256, bytes: bytes.length });
  }
  await saveJson(join(directory, 'UI-RECIPE.json'), current.recipe);
  const worker = await ownedWorker({ directory, recipe: current.recipe, playwrightModule }, { timeoutMs });
  const screenshots = [];
  for (const name of new Set([...worker.steps.map(s => s.screenshot), worker.finalScreenshot].filter(Boolean))) {
    if (!/^(final|failure-\d+)\.png$/.test(name)) continue;
    try {
      const file = await containedFile(directory, name);
      if ((await stat(file)).size > 4 * 1024 * 1024) throw Error('screenshot too large');
      screenshots.push({ path: name, ...validatePNG(await readFile(file)) });
    } catch (e) {
      worker.failure ??= 'Screenshot invalid: ' + e.message;
    }
  }
  const assertions = worker.steps.filter(s => s.action === 'assert'),
    passed =
      !worker.failure &&
      !worker.errors.length &&
      !worker.blocked.length &&
      worker.steps.length === current.recipe.steps.length &&
      worker.steps.every(s => s.passed) &&
      assertions.length > 0;
  const report = {
    schema: 1,
    id,
    caseId: current.caseId,
    title: current.title,
    at: new Date().toISOString(),
    passed,
    evidenceLevel: 'registered recipient browser UI versus explicit expected outcomes',
    recipeSha256: current.recipeSha256,
    inputs,
    steps: worker.steps,
    screenshots,
    errors: worker.errors,
    blockedRequests: worker.blocked,
    failure: worker.failure,
    log: worker.log,
    limits:
      'Fresh headless Chromium context over retained local input snapshots. HTTP(S)/WebSocket attempts are blocked and fail the run. This is recipient UI acceptance, not donor UI or whole-application equivalence.'
  };
  await saveJson(join(directory, 'verification.json'), report);
  await saveJson(join(directory, 'record.json'), {
    schema: 1,
    id,
    caseId: current.caseId,
    parentCaseSha256: current.parentCaseSha256,
    reportSha256: sha256(await readFile(join(directory, 'verification.json'))),
    snapshotRecipeSha256: sha256(await readFile(join(directory, 'UI-RECIPE.json')))
  });
  return { directory, ...report };
}
export async function readUIRuns(casePath, { limit = 4 } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 16) throw Error('UI run limit must be 0–16');
  const { root, record } = await readCase(casePath),
    parent = join(root, 'ui-checks'),
    items = [],
    warnings = [];
  let entries;
  try {
    if (!inside(root, await realpath(parent))) throw Error('UI checks directory escaped case');
    entries = await readdir(parent, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { items, warnings, total: 0, omitted: 0 };
    throw e;
  }
  const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name)),
    parentHash = sha256(await readFile(await containedFile(root, 'case.json')));
  let imageBytes = 0;
  for (const e of entries.filter(e => e.isSymbolicLink()))
    warnings.push({ id: e.name, error: 'symlink UI run ignored' });
  for (const e of dirs.slice(0, limit))
    try {
      const dir = await realpath(join(parent, e.name));
      if (!inside(parent, dir)) throw Error('UI run escaped case');
      const binding = await readJson(await containedFile(dir, 'record.json')),
        file = await containedFile(dir, 'verification.json');
      if ((await stat(file)).size > 512000) throw Error('UI report exceeds limit');
      const bytes = await readFile(file),
        run = JSON.parse(bytes);
      if (
        binding.schema !== 1 ||
        run.schema !== 1 ||
        run.id !== e.name ||
        binding.id !== e.name ||
        run.caseId !== record.id ||
        binding.caseId !== record.id ||
        sha256(bytes) !== binding.reportSha256 ||
        binding.parentCaseSha256 !== parentHash ||
        typeof run.passed !== 'boolean' ||
        !Array.isArray(run.steps) ||
        run.steps.length > 32 ||
        !Array.isArray(run.inputs) ||
        run.inputs.length > 128 ||
        !Array.isArray(run.screenshots) ||
        run.screenshots.length > 3
      )
        throw Error('UI report identity/hash changed');
      if (sha256(await readFile(await containedFile(dir, 'UI-RECIPE.json'))) !== binding.snapshotRecipeSha256)
        throw Error('snapshot recipe changed');
      for (const f of run.inputs) {
        const input = await containedFile(dir, f.path);
        if ((await stat(input)).size > 4 * 1024 * 1024 || sha256(await readFile(input)) !== f.sha256)
          throw Error('UI snapshot input changed');
      }
      const screenshots = [];
      for (const s of run.screenshots) {
        const png = await containedFile(dir, s.path);
        if ((await stat(png)).size > 4 * 1024 * 1024) throw Error('UI screenshot exceeds limit');
        const content = await readFile(png),
          info = validatePNG(content);
        if (info.sha256 !== s.sha256) throw Error('UI screenshot changed');
        const embed = imageBytes + content.length <= 8 * 1024 * 1024;
        if (embed) imageBytes += content.length;
        screenshots.push({
          ...s,
          ...(embed
            ? { dataURL: 'data:image/png;base64,' + content.toString('base64') }
            : { imageOmitted: 'Report image budget exceeded; screenshot remains in the case.' })
        });
      }
      items.push({ ...run, screenshots, provenance: binding });
    } catch (err) {
      warnings.push({ id: e.name, error: err.message });
    }
  return { items, warnings, total: dirs.length, omitted: Math.max(0, dirs.length - limit) };
}
