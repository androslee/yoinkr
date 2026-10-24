import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readCase } from '../../src/investigation.js';
import { investigate, exportFeature } from '../../src/research.js';
import { integrateFeature, sha256, newDestination } from '../../src/workspace.js';
import { saveExample } from '../../src/examples.js';
export async function buildReplayShowcase(out) {
  const project = fileURLToPath(new URL('../..', import.meta.url)),
    prior = join(project, 'builds/feature-examples-v0.4/mqtt-case'),
    { record } = await readCase(prior),
    native = join(project, 'builds/feature-examples-v0.4/mqtt-vscode');
  const sourcePath = 'backend/src/Model/Base64Message.ts',
    source = await readFile(join(record.donor.path, sourcePath)),
    expected = record.donor.files.find(f => f.path === sourcePath)?.sha256;
  if (!expected || sha256(source) !== expected) throw Error('MQTT original source differs from retained REA Evidence');
  const provenance = JSON.parse(await readFile(join(native, 'PROVENANCE.json'), 'utf8'));
  if (provenance.sourceFiles.find(f => f.path === sourcePath)?.sha256 !== expected)
    throw Error('native showcase provenance refers to a different donor source');
  out = await newDestination(resolve(out), [prior, record.donor.path, native]);
  await mkdir(out, { mode: 0o700 });
  const donor = join(out, 'donor'),
    recipient = join(out, 'recipient');
  for (const d of [donor, recipient, join(donor, 'original')]) await mkdir(d, { recursive: true });
  await writeFile(join(donor, 'original/Base64Message.ts'), source);
  await cp(join(record.donor.path, 'LICENSE.md'), join(donor, 'MQTT-EXPLORER-LICENSE.md'));
  await build({
    stdin: {
      contents: source.toString(),
      resolveDir: dirname(join(record.donor.path, sourcePath)),
      sourcefile: sourcePath,
      loader: 'ts'
    },
    nodePaths: [join(project, 'node_modules')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(donor, 'donor-model.cjs'),
    logLevel: 'warning'
  });
  await writeFile(
    join(donor, 'format.cjs'),
    "const {Base64Message}=require('./donor-model.cjs');exports.formatPayload=(text,mode)=>Base64Message.fromString(text).format(mode)[0];\n"
  );
  const nativeBytes = await readFile(join(native, 'donor-core.cjs'));
  await writeFile(join(recipient, 'native-core.cjs'), nativeBytes);
  await writeFile(
    join(recipient, 'host.cjs'),
    "const core=require('./native-core.cjs');exports.formatPayload=(text,mode)=>core.formatPayload(Buffer.from(text,'utf8'),mode);\n"
  );
  const casePath = join(out, 'case');
  await investigate({
    donor,
    recipient,
    feature: 'MQTT payload formatting: recovered class versus existing VS Code integration core (module slice)',
    seed: 'format.cjs',
    route: 'direct',
    out: casePath,
    donorSources: ['format.cjs', 'donor-model.cjs', 'original/Base64Message.ts'],
    recipientSources: ['host.cjs', 'native-core.cjs']
  });
  const exported = await exportFeature(casePath, {
    files: ['format.cjs', 'donor-model.cjs', 'original/Base64Message.ts', 'MQTT-EXPLORER-LICENSE.md']
  });
  const recipe = {
    schema: 1,
    moduleType: 'commonjs',
    entry: 'format.cjs',
    mount: 'recovered-formatter',
    patches: [],
    oracle: { module: 'format.cjs', export: 'formatPayload' },
    recipient: { module: 'host.cjs', export: 'formatPayload' },
    cases: [
      { name: 'Text', args: ['hello', 'string'], expected: 'hello' },
      { name: 'Hex', args: ['A', 'hex'], expected: '0x41' }
    ]
  };
  const recipePath = join(out, 'recipe.json');
  await writeFile(recipePath, JSON.stringify(recipe, null, 2));
  const workspace = join(out, 'workspace');
  await integrateFeature(casePath, { exportDirectory: exported.directory, recipe: recipePath, out: workspace });
  const inputs = [
    ['UTF-8 text', ['héllo', 'string'], 'héllo'],
    ['Pretty JSON', ['{"ok":true}', 'json'], '{\n  "ok": true\n}'],
    ['Hex bytes', ['A\n', 'hex'], '0x41 0x0A'],
    ['Invalid JSON fallback', ['not json', 'json'], 'not json']
  ];
  const exampleIds = [];
  for (const [title, args, expected] of inputs) {
    const e = await saveExample(casePath, {
      title,
      side: 'both',
      steps: ['Pass the declared UTF-8 payload and display mode to each formatter'],
      expected: 'Both outputs match the explicit expected value.',
      observation: '',
      outcome: 'planned',
      replay: { args, expected }
    });
    exampleIds.push(e.id);
  }
  const info = {
    schema: 1,
    casePath,
    workspace,
    exampleIds,
    originalSource: { path: join(record.donor.path, sourcePath), sha256: expected, parentCaseId: record.id },
    nativeCore: { path: join(native, 'donor-core.cjs'), sha256: sha256(nativeBytes), provenance },
    generated: [
      'donor-model.cjs: esbuild compilation of unchanged original Base64Message.ts plus bundled js-base64 dependency',
      'format.cjs and host.cjs: new JSON-callable UTF-8 adapters'
    ],
    scope:
      'Module comparison of the original formatter and the existing VS Code integration core. This does not launch or verify the native VS Code UI, nor claim a new whole-application transplant.'
  };
  await writeFile(join(out, 'SHOWCASE.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('give a new output directory');
  console.log(JSON.stringify(await buildReplayShowcase(process.argv[2]), null, 2));
}
