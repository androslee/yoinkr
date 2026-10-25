import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm, mkdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnose, supportedNode } from '../src/doctor.js';
test('doctor respects the supported Node release lines', () => {
  for (const v of ['22.19.0', '24.11.0', '26.0.0']) assert.equal(supportedNode(v), true);
  for (const v of ['20.20.0', '22.18.0', '23.0.0', '24.10.0', '25.0.0']) assert.equal(supportedNode(v), false);
});
test('doctor reports missing required modules, gives remedies and never writes to a checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-doctor-'));
  try {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ version: 'test', dependencies: { 'yoinkr-missing-fixture': '1.0.0' } })
    );
    const report = await diagnose({ root, nodeVersion: '22.23.0' });
    assert.equal(report.ready, false);
    assert.match(report.checks.find(c => c.name === 'yoinkr-missing-fixture').remedy, /npm ci --ignore-scripts/);
    assert.deepEqual(await readdir(root), ['package.json']);
    await assert.rejects(diagnose({ root, example: 'unknown' }), /Choose --example/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('the actual CLI doctor starts before dependencies are installed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-fresh-'));
  try {
    await mkdir(join(root, 'src'));
    for (const name of ['cli.js', 'doctor.js', 'version.js'])
      await cp(new URL('../src/' + name, import.meta.url), join(root, 'src', name));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ type: 'module', version: 'test', dependencies: { 'yoinkr-absent-fixture': '1.0.0' } })
    );
    const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), 'doctor', '--json'], {
      encoding: 'utf8',
      timeout: 10000
    });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).ready, false);
    const version = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '--version'], {
      encoding: 'utf8',
      timeout: 10000
    });
    assert.equal(version.status, 0);
    assert.equal(version.stdout.trim(), 'test');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('native diagnostics require SDK files rather than claiming readiness from compiler presence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-sdk-'));
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: 'test' }));
    const result = await diagnose({ root, example: 'krita-obs', sdk: join(root, 'missing-sdk') });
    assert.equal(result.ready, false);
    assert.ok(result.checks.some(c => c.name.startsWith('OBS/Qt ') && c.required && c.status === 'missing'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
