// Synthetic retained-Evidence fixture for orchestration tests; real REA is tested separately.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempDir } from './helpers.js';
import { sha256, integrateFeature } from '../src/workspace.js';
import { saveExample } from '../src/examples.js';
export async function replayFixture() {
  const root = tempDir('yoinkr-replay-unit-'),
    donor = join(root, 'donor'),
    recipient = join(root, 'recipient'),
    casePath = join(root, 'case'),
    exportPath = join(casePath, 'private/export');
  for (const p of [donor, recipient, join(exportPath, 'files'), join(casePath, 'evidence')])
    await mkdir(p, { recursive: true });
  const code = 'export function format(n){if(n<0)throw new RangeError("negative");return `${n}%`;}';
  const host = 'export function display(n){return "unwired";}';
  await writeFile(join(donor, 'format.js'), code);
  await writeFile(join(exportPath, 'files/format.js'), code);
  await writeFile(join(recipient, 'host.js'), host);
  await writeFile(join(recipient, 'package.json'), '{"type":"module"}');
  const hashes = {};
  for (const side of ['donor', 'recipient', 'trace']) {
    const bytes = JSON.stringify({
      ok: true,
      data: { evidence_id: side, normalized_result: { graph: { nodes: [] } } }
    });
    hashes[side + '.json'] = sha256(bytes);
    await writeFile(join(casePath, 'evidence', side + '.json'), bytes);
  }
  await writeFile(
    join(casePath, 'case.json'),
    JSON.stringify({
      schema: 1,
      id: 'unit-case',
      feature: 'Fixture formatter',
      status: 'investigated',
      route: { selected: 'direct' },
      acceptance: { status: 'not-run' },
      donor: { path: donor, evidenceId: 'donor', files: [{ path: 'format.js', sha256: sha256(code) }] },
      recipient: { path: recipient, evidenceId: 'recipient', files: [{ path: 'host.js', sha256: sha256(host) }] },
      trace: { evidenceId: 'trace', files: ['format.js'] },
      evidenceHashes: hashes
    })
  );
  await writeFile(
    join(exportPath, 'EXPORT.json'),
    JSON.stringify({ schema: 1, caseId: 'unit-case', files: [{ path: 'format.js', sha256: sha256(code) }] })
  );
  const recipe = {
    schema: 1,
    moduleType: 'module',
    entry: 'format.js',
    mount: 'feature',
    patches: [
      {
        file: 'host.js',
        beforeSha256: sha256(host),
        find: host,
        replace: 'export {format as display} from "./feature/format.js";'
      }
    ],
    oracle: { module: 'format.js', export: 'format' },
    recipient: { module: 'host.js', export: 'display' },
    cases: [{ args: [20], expected: '20%' }]
  };
  const recipePath = join(root, 'recipe.json');
  await writeFile(recipePath, JSON.stringify(recipe));
  const workspace = join(root, 'workspace');
  await integrateFeature(casePath, { exportDirectory: exportPath, recipe: recipePath, out: workspace });
  const make = (replay, title = 'Example') =>
    saveExample(casePath, {
      title,
      side: 'both',
      steps: ['Call formatter'],
      expected: 'Expected text',
      observation: '',
      outcome: 'planned',
      ...(replay === undefined ? {} : { replay })
    });
  return { root, casePath, workspace, make };
}
