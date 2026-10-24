import { mkdir, readFile, writeFile, cp, realpath, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build, version as esbuildVersion } from 'esbuild';
import { investigate, exportFeature } from '../../src/research.js';
import { runRea } from '../../src/rea.js';
import { readCase } from '../../src/investigation.js';
import { newDestination, sha256 } from '../../src/workspace.js';
export async function buildPlotTransfer(out) {
  const project = fileURLToPath(new URL('../..', import.meta.url)),
    original = join(project, 'builds/native-code-v0.4'),
    native = join(original, 'code/resources/app/modkit-native'),
    oldCase = await readCase(join(project, 'builds/feature-examples-v0.4/mqtt-case')),
    donor = oldCase.record.donor.path;
  const util = 'app/src/components/Sidebar/CodeDiff/util.tsx',
    topic = 'app/src/components/TopicPlot.tsx',
    chart = 'app/src/components/Chart/Chart.tsx';
  const originalBytes = await readFile(join(donor, util)),
    expected = oldCase.record.donor.files.find(f => f.path === util)?.sha256;
  if (!expected || sha256(originalBytes) !== expected)
    throw Error('donor plotting source differs from retained original Evidence');
  const oldMain = await readFile(join(native, 'main.cjs'), 'utf8');
  if (!oldMain.includes("require('./controller.cjs')") || !oldMain.includes("'inspect','host-info'"))
    throw Error('unsupported native host shape');
  const pkg = JSON.parse(await readFile(join(original, 'code/resources/app/package.json'), 'utf8'));
  if (pkg.main !== './modkit-bootstrap.mjs') throw Error('native recipient bootstrap differs');
  out = await newDestination(out, [await realpath(original), await realpath(donor)]);
  await mkdir(out, { mode: 0o700 });
  const recipientSlice = join(out, 'recipient-source');
  await mkdir(recipientSlice);
  const recipientSources = [];
  for (const name of ['main.cjs', 'controller.cjs', 'panel.js']) {
    const bytes = await readFile(join(native, name));
    await writeFile(join(recipientSlice, name), bytes);
    recipientSources.push({ source: join(native, name), path: name, sha256: sha256(bytes) });
  }
  const casePath = join(out, 'case');
  const record = await investigate(
    {
      donor,
      recipient: recipientSlice,
      feature: 'MQTT Explorer numeric-topic plotting inside native VS Code, without extensions',
      seed: util,
      route: 'direct',
      out: casePath,
      donorSources: [util, topic, chart],
      recipientSources: ['main.cjs', 'controller.cjs', 'panel.js']
    },
    (args, path) =>
      runRea(
        args[0] === 'analyze-javascript-application'
          ? [
              ...args,
              '--max-semantic-nodes',
              '2000',
              '--max-semantic-nodes-per-file',
              '2000',
              '--max-semantic-unknowns',
              '2000',
              '--max-semantic-unknowns-per-file',
              '2000'
            ]
          : args,
        path
      )
  );
  const exported = await exportFeature(casePath, { files: [util, topic, chart, 'LICENSE.md'] });
  await writeFile(
    join(out, 'DEPENDENCIES.json'),
    JSON.stringify(
      {
        schema: 1,
        caseId: record.id,
        semanticBudget: '2000 semantic nodes/unknowns per analysis and per source; REA coverage/truncation retained.',
        scope:
          'Donor selected source paths and three byte-identical native-host recipient files; not the full application or dependency graph.',
        recipientSources,
        items: [
          {
            path: util,
            classification: 'portable',
            action: 'Original pure numeric conversion and utility exports compiled unchanged with esbuild.'
          },
          {
            path: topic,
            classification: 'host-adaptation',
            action:
              'Original history/decoder React wiring inspected and retained; new host store collects raw numeric payload samples.'
          },
          {
            path: chart,
            classification: 'host-adaptation',
            action: 'Original D3/React chart not installed; new inert SVG UI renders the bounded numeric series.'
          },
          {
            path: 'React, Material UI, D3, dot-prop, parse-duration',
            classification: 'not-transferred',
            action:
              'No donor UI dependency runtime installed; JSON dot-path plotting, time-range filtering and curve options remain unsupported.'
          },
          {
            path: 'MQTT connection, BrowserWindow, preload/IPC',
            classification: 'host-provided',
            action: 'Reuse existing extension-free native host; add scoped clear-plot operation.'
          }
        ],
        unresolved: record.trace.limitations,
        nativeHandoffs: record.trace.nativeHandoffs
      },
      null,
      2
    )
  );
  const code = join(out, 'code');
  execFileSync('cp', ['-a', '--reflink=auto', join(original, 'code'), code]);
  const host = join(code, 'resources/app/modkit-native'),
    compile = await build({
      entryPoints: [join(exported.directory, 'files', util)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      logLevel: 'warning'
    });
  await writeFile(join(host, 'donor-plot.cjs'), compile.outputFiles[0].contents);
  for (const name of ['plot-history.cjs', 'plot-explorer.cjs', 'plot.js', 'plot.css'])
    await cp(join(project, 'addons/mqtt-plot', name), join(host, name));
  let main = oldMain
    .replace("require('./controller.cjs')", "require('./plot-explorer.cjs')")
    .replace("'inspect','host-info'", "'inspect','clear-plot','host-info'")
    .replace(
      "else if(message.type==='inspect')",
      "else if(message.type==='clear-plot'){explorer.clearPlot(message.topic);reply({type:'detail',detail:explorer.inspect(message.topic,message.mode)});}else if(message.type==='inspect')"
    );
  await writeFile(join(host, 'main.cjs'), main);
  let html = await readFile(join(host, 'panel.html'), 'utf8');
  html = html
    .replace('</head>', '<link rel="stylesheet" href="plot.css"></head>')
    .replace(
      '<h2>Publish</h2>',
      '<section id="plot-section" hidden><h2>Live numeric history</h2><p id="plot-summary" role="status"></p><svg id="numeric-plot" viewBox="0 0 640 180" role="img" aria-label="Numeric history"></svg><div class="plot-controls"><button id="plot-pause" type="button">Pause plot</button><button id="plot-reset" type="button">Reset this plot</button></div></section><h2>Publish</h2>'
    )
    .replace('</body>', '<script src="plot.js"></script></body>');
  await writeFile(join(host, 'panel.html'), html);
  await cp(join(project, 'scripts/applications/launch-native-code.mjs'), join(out, 'launch-native.mjs'));
  await writeFile(
    join(out, 'launch-code.sh'),
    '#!/bin/sh\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$ROOT/launch-native.mjs" "$ROOT" "$@"\n'
  );
  await chmod(join(out, 'launch-code.sh'), 0o755);
  await cp(join(exported.directory, 'files/LICENSE.md'), join(host, 'MQTT-PLOT-LICENSE.md'));
  const installed = [
    'main.cjs',
    'panel.html',
    'donor-plot.cjs',
    'plot-history.cjs',
    'plot-explorer.cjs',
    'plot.js',
    'plot.css'
  ];
  const provenance = {
    schema: 1,
    feature: record.feature,
    casePath,
    export: exported.directory,
    donor: {
      path: donor,
      originalUtil: util,
      sha256: expected,
      sourceFiles: exported.files,
      originalInvestigationCase: oldCase.record.id
    },
    recipient: {
      source: original,
      analysisSourceSlice: recipientSources,
      version: pkg.version,
      bootstrap: pkg.main,
      extensionInstalled: false,
      originalInstallationModified: false
    },
    compiled: {
      file: 'donor-plot.cjs',
      compiler: 'esbuild ' + esbuildVersion,
      sourceExport: exported.directory,
      sha256: sha256(compile.outputFiles[0].contents)
    },
    newCode: [
      'plot-history.cjs',
      'plot-explorer.cjs',
      'plot.js',
      'plot.css',
      'HTML and scoped main-process integration'
    ],
    installedFiles: Object.fromEntries(
      await Promise.all(installed.map(async name => [name, sha256(await readFile(join(host, name)))]))
    ),
    limits:
      'Raw finite numeric topics, on/off and comma-decimal strings; 240 samples per topic, 1000 topics. New SVG presentation, not the donor React/D3 chart. No JSON dot paths, original curve/time-range settings, or persistence. Source and prior native lab remain unchanged.',
    rollback: 'Delete this isolated build; no original application or profile is patched.'
  };
  await writeFile(join(out, 'TRANSFER.json'), JSON.stringify(provenance, null, 2));
  await writeFile(
    join(out, 'README.md'),
    '# Native MQTT numeric plots\n\nRun ./launch-code.sh, then npm run demo:broker from Yoinkr, or connect to your own broker. Connect to mqtt://127.0.0.1:18883 and choose demo/plot/temperature for the sample broker. Plot history supports Pause/Resume and Reset this plot; Clear history removes all topic/plot data. Uses a separate portable profile. No extension is installed. See TRANSFER.json and DEPENDENCIES.json for exact recovered/new code, limits and rollback.\n'
  );
  return { directory: out, casePath, host, launcher: join(out, 'launch-code.sh'), provenance };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('give a new output directory');
  console.log(JSON.stringify(await buildPlotTransfer(resolve(process.argv[2])), null, 2));
}
