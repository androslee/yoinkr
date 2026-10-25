// Clean-checkout source/build acceptance. This deliberately never launches Electron.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rollbackElectronPlaybook } from '../../src/electron-playbook.js';
const example = dirname(fileURLToPath(import.meta.url));
if (process.platform !== 'linux' || process.arch !== 'x64') throw Error('Build acceptance targets Linux x86-64');
const root = await mkdtemp(join(tmpdir(), 'yoinkr-browser-build-'));
const input = join(root, 'input');
const output = join(root, 'output');
const run = (...args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: example,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.signal) throw result.error || Error('Child terminated: ' + result.signal);
  return result;
};
try {
  await mkdir(join(input, 'resources/app'), { recursive: true });
  const originals = {
    code: '#!/bin/sh\necho "FIXTURE MUST NEVER EXECUTE" >&2\nexit 99\n',
    'resources/app/package.json': JSON.stringify({
      name: 'Code',
      version: '0.0.0-fixture',
      type: 'module',
      main: './main.mjs'
    }),
    'resources/app/product.json': '{}',
    'resources/app/main.mjs': '// Synthetic entry point, not an actual Code runtime.\n'
  };
  for (const [name, value] of Object.entries(originals)) await writeFile(join(input, name), value);
  const built = run('build.mjs', input, output);
  assert.equal(built.status, 0, built.stderr);
  const record = JSON.parse(await readFile(join(output, 'BUILD.json')));
  assert.equal(record.marker, 'ublock-vscode-research-browser');
  assert.equal(record.hostVersion, '0.0.0-fixture');
  assert.equal(record.verification, 'not-run');
  assert.ok(record.outputs['resources/app/yoinkr-browser/main.cjs']);
  assert.ok(record.outputs['resources/app/yoinkr-browser/uBlock.zip']);
  for (const [name, value] of Object.entries(originals)) assert.equal(await readFile(join(input, name), 'utf8'), value);
  // Existing directories must be refused even when they contain no playbook marker.
  const existing = join(root, 'existing');
  await mkdir(existing);
  await writeFile(join(existing, 'keep.txt'), 'caller data');
  const refused = run('build.mjs', input, existing);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /EEXIST/);
  assert.deepEqual(await readdir(existing), ['keep.txt']);
  assert.equal(await readFile(join(existing, 'keep.txt'), 'utf8'), 'caller data');
  const nested = run('build.mjs', input, join(input, 'nested'));
  assert.notEqual(nested.status, 0);
  assert.match(nested.stderr, /workspace must be outside/);
  // Drift refusal must happen before the fixture executable could be invoked.
  const payload = join(output, 'workspace/runtime/resources/app/yoinkr-browser/main.cjs');
  const originalPayload = await readFile(payload);
  await writeFile(payload, '// tampered');
  const drift = run(join(output, 'launch.mjs'));
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /Runtime drift; rebuild/);
  assert.doesNotMatch(drift.stderr, /FIXTURE MUST NEVER EXECUTE/);
  await writeFile(payload, originalPayload);
  await rollbackElectronPlaybook(join(output, 'workspace'));
  for (const [name, value] of Object.entries(originals))
    assert.equal(await readFile(join(output, 'workspace/runtime', name), 'utf8'), value);
  console.log(
    'Source build passed: bundled host, hash-pinned archives, unchanged input, output refusal, drift refusal and rollback. Electron was not launched.'
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
