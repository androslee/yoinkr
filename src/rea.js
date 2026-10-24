// Actual upstream REA CLI, pinned by package-lock.json. Never invokes `setup` or
// modifies agent registrations. Analysis subprocesses read the selected inputs.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, mkdir, open } from 'node:fs/promises';
const require = createRequire(import.meta.url);
export function reaInfo() {
  const script = require.resolve('rea-agents/scripts/rea.mjs');
  const packageRoot = dirname(dirname(script)),
    pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  return { script, packageRoot, version: pkg.version, upstream: 'https://github.com/morluto/rea' };
}
export async function runRea(args, output, { timeoutMs = 120000, maxBytes = 64 * 1024 * 1024, environment = {} } = {}) {
  const { script } = reaInfo();
  await mkdir(dirname(output), { recursive: true });
  const outHandle = await open(output, 'wx', 0o600);
  let errHandle;
  try {
    errHandle = await open(output + '.stderr.log', 'wx', 0o600);
  } catch (err) {
    await outHandle.close();
    throw err;
  }
  const stdout = outHandle.createWriteStream(),
    stderr = errHandle.createWriteStream();
  let child,
    bytes = 0,
    logBytes = 0,
    timer,
    killTimer,
    failure;
  try {
    await new Promise((resolve, reject) => {
      child = spawn(process.execPath, [script, ...args, '--format', 'json', '--full-output'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...environment }
      });
      const stop = err => {
        failure ??= err;
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1500);
      };
      stdout.on('error', stop);
      stderr.on('error', stop);
      timer = setTimeout(
        () => stop(new Error('REA analysis timed out; partial output retained in ' + output)),
        timeoutMs
      );
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          stop(new Error('REA output exceeded limit; narrow selected source paths'));
          return;
        }
        if (!stdout.write(chunk)) {
          child.stdout.pause();
          stdout.once('drain', () => child.stdout.resume());
        }
      });
      child.stderr.on('data', chunk => {
        logBytes += chunk.length;
        if (logBytes <= 4 * 1024 * 1024) stderr.write(chunk);
      });
      child.once('error', reject);
      child.once('close', (code, signal) =>
        failure
          ? reject(failure)
          : code === 0
            ? resolve()
            : reject(new Error(`REA failed (${signal ?? code}); see ${output}.stderr.log`))
      );
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    await Promise.all([new Promise(r => stdout.end(r)), new Promise(r => stderr.end(r))]);
  }
  const envelope = JSON.parse(await readFile(output, 'utf8'));
  if (envelope.ok !== true || !envelope.data?.evidence_id)
    throw new Error(`REA returned no successful Evidence; inspect ${output}`);
  return envelope.data;
}
