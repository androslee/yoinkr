import { verificationOutput } from './verification-output.mjs';
// Real upstream REA, original donor/recipient fixtures, actual code/asset transfer.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPackage } from '@electron/asar';
import { integrateFeature, sha256 } from '../../src/workspace.js';
import { verifyWorkspace } from '../../src/verify.js';
import { investigate, exportFeature } from '../../src/research.js';
const root = await mkdtemp(join(tmpdir(), 'yoinkr-rea-smoke-'));
const donor = join(root, 'donor'),
  recipient = join(root, 'recipient');
const checks = [];
try {
  await mkdir(join(donor, 'assets'), { recursive: true });
  await mkdir(recipient);
  const sources = {
    'package.json': JSON.stringify({ name: 'donor', version: '1.0.0', type: 'module', main: 'format.js' }),
    'format.js':
      "import {clamp} from './math.js';\nexport function formatProgress(n){return `${Math.round(clamp(n,0,1)*100)}% complete`;}\n",
    'math.js': 'export function clamp(n,a,b){return Math.min(b,Math.max(a,n));}\n',
    'assets/progress.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M1 8h14" stroke="gold"/></svg>'
  };
  for (const [name, bytes] of Object.entries(sources)) await writeFile(join(donor, name), bytes);
  await writeFile(
    join(recipient, 'package.json'),
    JSON.stringify({ name: 'recipient', version: '1.0.0', type: 'module', main: 'host.js' })
  );
  await writeFile(join(recipient, 'host.js'), 'export const recipient=true;');
  const record = await investigate({
    donor,
    recipient,
    feature: 'Progress text formatter and icon',
    seed: 'format.js',
    out: join(root, 'case'),
    route: 'direct'
  });
  assert.equal(record.provider.version, '6.7.0');
  assert.equal(record.status, 'investigated');
  checks.push('Actual pinned REA analyzed both donor and recipient');
  assert.deepEqual(record.trace.files, ['format.js', 'math.js']);
  checks.push('Upstream feature tracing found the donor module and imported helper');
  const exported = await exportFeature(join(root, 'case'), { traced: true, files: ['assets/progress.svg'] });
  assert.equal(exported.files.length, 3);
  checks.push('Transferred original code, its traced helper and a selected asset into a private working set');
  for (const f of exported.files)
    assert.equal(await readFile(join(exported.directory, 'files', f.path), 'utf8'), sources[f.path]);
  checks.push('Every transferred file matches donor bytes');
  // Execute only our own original fixture code, never arbitrary donor analysis.
  const imported = join(recipient, 'feature');
  await cp(join(exported.directory, 'files'), imported, { recursive: true });
  await writeFile(join(imported, 'package.json'), '{"type":"module"}');
  const original = await import(pathToFileURL(join(donor, 'format.js')).href),
    transferred = await import(pathToFileURL(join(imported, 'format.js')).href);
  const inputs = [-1, 0, 0.01, 0.333, 0.5, 0.999, 1, 2];
  const results = inputs.map(x => ({
    input: x,
    donor: original.formatProgress(x),
    recipient: transferred.formatProgress(x)
  }));
  for (const row of results) assert.equal(row.recipient, row.donor);
  checks.push('Copied donor implementation runs in the recipient fixture and matches eight donor cases');
  assert.equal(exported.files.find(f => f.path === 'assets/progress.svg').analysisBound, false);
  checks.push('Untraced asset selection retains extraction-time provenance without claiming graph coverage');
  const hostText = await readFile(join(recipient, 'host.js'), 'utf8');
  const recipe = {
    schema: 1,
    moduleType: 'module',
    entry: 'format.js',
    mount: 'recovered-feature',
    patches: [
      {
        file: 'host.js',
        beforeSha256: sha256(hostText),
        find: hostText,
        replace: 'export {formatProgress as displayProgress} from "./recovered-feature/format.js";'
      }
    ],
    oracle: { module: 'format.js', export: 'formatProgress' },
    recipient: { module: 'host.js', export: 'displayProgress' },
    cases: results.map(row => ({ args: [row.input], expected: row.donor }))
  };
  await writeFile(join(root, 'recipe.json'), JSON.stringify(recipe));
  await integrateFeature(join(root, 'case'), {
    exportDirectory: exported.directory,
    recipe: join(root, 'recipe.json'),
    out: join(root, 'workspace')
  });
  const acceptance = await verifyWorkspace(join(root, 'workspace'));
  assert.equal(acceptance.passed, true);
  assert.equal(await readFile(join(recipient, 'host.js'), 'utf8'), hostText);
  checks.push(
    'General integration recipe wires a fresh recipient copy and retains a passing donor/recipient comparison'
  );
  const archive = join(root, 'donor.asar');
  await createPackage(donor, archive);
  const archiveCase = await investigate({
    donor: archive,
    recipient,
    feature: 'Archived progress formatter',
    seed: 'format.js',
    out: join(root, 'archive-case'),
    route: 'direct'
  });
  assert.equal(archiveCase.status, 'investigated');
  const archived = await exportFeature(join(root, 'archive-case'), { traced: true, files: ['assets/progress.svg'] });
  for (const f of archived.files)
    assert.equal(await readFile(join(archived.directory, 'files', f.path), 'utf8'), sources[f.path]);
  checks.push('Actual REA analyzed a real ASAR archive and Yoinkr extracted its traced code and selected asset');
  await writeFile(join(donor, 'format.js'), 'changed');
  await assert.rejects(exportFeature(join(root, 'case'), { traced: true }), /changed since/);
  checks.push('Changed donor code is refused against its recorded analysis hash');
  const output = await verificationOutput('research', process.env.YOINKR_EVIDENCE ?? process.env.MODKIT_EVIDENCE);
  await mkdir(output, { recursive: true });
  await cp(join(root, 'case'), join(output, 'research-case'), { recursive: true });
  await cp(join(root, 'archive-case'), join(output, 'research-archive-case'), { recursive: true });
  await cp(join(root, 'workspace'), join(output, 'integration-workspace'), { recursive: true });
  await writeFile(
    join(output, 'research-smoke.json'),
    JSON.stringify(
      {
        provider: record.provider,
        checks,
        results,
        limits:
          'Original temporary JS fixtures; no live Electron app modified, no native or cross-engine conversion claimed.'
      },
      null,
      2
    ) + '\n'
  );
  console.log('REA RESEARCH CHECKS PASSED:', checks.length);
} finally {
  await rm(root, { recursive: true, force: true });
}
