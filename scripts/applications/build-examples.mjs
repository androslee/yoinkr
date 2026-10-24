// Local integration lab. Never installs into an editor or changes a browser profile.
import { mkdir, readFile, writeFile, readdir, cp, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { newDestination } from '../../src/workspace.js';
import { investigate, exportFeature } from '../../src/research.js';
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((rows, x, i, all) => (x.startsWith('--') ? [...rows, [x.slice(2), all[i + 1]]] : rows), [])
);
if (!flags['mqtt-donor'] || !flags.out)
  throw Error(
    'usage: node scripts/applications/build-examples.mjs --mqtt-donor SOURCE --out NEW_BUILD [--code /usr/share/code]'
  );
const donor = resolve(flags['mqtt-donor']),
  output = resolve(flags.out),
  source = resolve('addons/mqtt-vscode'),
  code = resolve(flags.code ?? '/usr/share/code');
await newDestination(output, [donor, code, source]);
await mkdir(output, { mode: 0o700 });
const hash = b => createHash('sha256').update(b).digest('hex');
const models = (await readdir(join(donor, 'backend/src/Model')))
  .filter(p => p.endsWith('.ts'))
  .map(p => 'backend/src/Model/' + p);
const eventPaths = [
  'events/index.ts',
  'events/Events.ts',
  'events/EventsV2.ts',
  'events/EventSystem/EventDispatcher.ts',
  'events/EventSystem/EventBusInterface.ts'
];
const caseDir = join(output, 'mqtt-case');
const record = await investigate({
  donor,
  recipient: source,
  feature: 'MQTT Explorer topic merging, bounded message history and JSON/text/hex payload formatting in VS Code',
  seed: 'backend/src/Model/TreeNodeFactory.ts',
  route: 'direct',
  out: caseDir,
  donorSources: [...models, ...eventPaths]
});
const exported = await exportFeature(caseDir, { traced: true, files: [...models, ...eventPaths, 'LICENSE.md'] });
const recovered = join(exported.directory, 'files'),
  mqttOut = join(output, 'mqtt-vscode');
await cp(source, mqttOut, { recursive: true });
// Compile actual recovered TS, retaining donor files unchanged in the case.
const config = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  nodePaths: [resolve('node_modules')],
  logLevel: 'warning'
};
await build({
  ...config,
  entryPoints: [join(source, 'donor-entry.ts')],
  outfile: join(mqttOut, 'donor-core.cjs'),
  plugins: [
    {
      name: 'recovered-donor',
      setup(b) {
        b.onLoad({ filter: /\/backend\/src\/Model\/TreeNode\.ts$/ }, async a => {
          let text = await readFile(a.path, 'utf8');
          text = text.replace(
            "import { Edge, Message, RingBuffer, MessageHistory } from './'",
            "import type { Edge } from './Edge'; import type { Message } from './Message'; import { RingBuffer } from './RingBuffer'; import type { MessageHistory } from './MessageHistory';"
          );
          return { contents: text, loader: 'ts' };
        });
        b.onResolve({ filter: /^MQTT_DONOR\// }, a => ({
          path: join(recovered, a.path.slice('MQTT_DONOR/'.length) + '.ts')
        }));
      }
    }
  ]
});
await build({
  ...config,
  entryPoints: [join(source, 'extension.cjs')],
  outfile: join(mqttOut, 'extension.cjs'),
  external: ['vscode', './donor-core.cjs']
});
await build({
  ...config,
  entryPoints: [join(source, 'controller.cjs')],
  outfile: join(mqttOut, 'controller.cjs'),
  external: ['./donor-core.cjs']
});
await cp(join(donor, 'LICENSE.md'), join(mqttOut, 'MQTT-EXPLORER-LICENSE.md'));
await writeFile(
  join(mqttOut, 'README.md'),
  '# Yoinkr MQTT Explorer\n\nOpen the command palette and run **Yoinkr: Open MQTT Explorer**. Connect to your broker (mqtt/mqtts/ws/wss), inspect topics and JSON/text/hex payloads, or publish a message. Credentials are held in memory for the current connection and are not saved.\n\nThe original MQTT Explorer topic model and payload formatter are recovered from the official local source, compiled with a new VS Code adapter. This is a functional subset, not the full original application: connection profiles, plotting, comparisons, certificates and the original UI are not included.\n\nMQTT Explorer: Thomas Nordquist, https://mqtt-explorer.com/ . Original license is retained in MQTT-EXPLORER-LICENSE.md; source package and license header differ and are recorded in PROVENANCE.json. This local integration is not published to a marketplace.\n'
);
const revision = execFileSync('git', ['-C', donor, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const provenance = {
  donor: 'https://github.com/thomasnordquist/MQTT-Explorer',
  revision,
  caseId: record.id,
  export: exported.directory,
  sourceFiles: exported.files,
  compiler: 'esbuild 0.25.12',
  scope: 'Recovered topic/payload core; new VS Code UI and MQTT transport host glue',
  buildAdaptations: [
    'Replace TreeNode barrel import with explicit RingBuffer runtime import and type-only imports to break the original circular initialization when bundled; recovered source files stay unchanged.'
  ],
  licenseMetadata: {
    package: 'CC-BY-SA-4.0',
    licenseFileHeading: 'CC-BY-ND-4.0',
    action: 'Original license retained; local private build, no marketplace publication'
  }
};
await writeFile(join(mqttOut, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
const docOut = join(output, 'chromium-documents');
await cp('addons/chromium-documents', docOut, { recursive: true });
const cssRoot = join(code, 'resources/app/extensions/markdown-language-features/media'),
  assets = [];
for (const [from, to] of [
  ['markdown.css', 'vscode-markdown.css'],
  ['highlight.css', 'vscode-highlight.css']
]) {
  const bytes = await readFile(join(cssRoot, from));
  await writeFile(join(docOut, to), bytes);
  assets.push({ source: join(cssRoot, from), file: to, sha256: hash(bytes) });
}
await build({
  entryPoints: ['addons/chromium-documents/viewer.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: join(docOut, 'viewer.js'),
  logLevel: 'warning'
});
await writeFile(
  join(docOut, 'PROVENANCE.json'),
  JSON.stringify(
    {
      donor: 'Installed VS Code Markdown preview styles',
      assets,
      scope:
        'Original preview CSS reused. Markdown-it/DOMPurify and a new Chromium host implement rendering; the VS Code extension backend is not copied.'
    },
    null,
    2
  ) + '\n'
);
await writeFile(
  join(docOut, 'README.md'),
  '# Yoinkr Document Viewer\n\nRun launch-documents.sh to open the standalone local viewer in Chromium app mode, with browser extensions disabled. Choose a document through the file picker. The manifest is retained only as an optional fallback prototype; no extension is required for the app-mode viewer. Supports Markdown, notebooks (.ipynb), CSV/TSV, JSON and text/log files. No network permission or automatic file-URL access is requested. Files are opened explicitly through the picker; this does not change Chromium MIME handlers. Word/Excel formats are not yet supported.\n\nUses original VS Code Markdown preview CSS (Microsoft, MIT), markdown-it and DOMPurify. New renderer/extension host code is identified separately in PROVENANCE.json.\n'
);
await cp('scripts/applications/launch-documents.mjs', join(docOut, 'launch-documents.mjs'));
await writeFile(
  join(docOut, 'launch-documents.sh'),
  '#!/bin/sh\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nif [ -z "${YOINKR_CHROMIUM:-}" ]; then for NAME in chromium chromium-browser google-chrome; do if command -v "$NAME" >/dev/null 2>&1; then YOINKR_CHROMIUM=$(command -v "$NAME"); export YOINKR_CHROMIUM; break; fi; done; fi\nexec node "$ROOT/launch-documents.mjs" "$ROOT" "$@"\n',
  { mode: 0o755 }
);
execFileSync(process.execPath, ['scripts/applications/add-browser-launcher.mjs', docOut], { stdio: 'inherit' });
await writeFile(
  join(output, 'BUILD.json'),
  JSON.stringify({ mqtt: mqttOut, documents: docOut, caseId: record.id, donorRevision: revision }, null, 2) + '\n'
);
console.log(JSON.stringify({ mqtt: mqttOut, documents: docOut, caseId: record.id }, null, 2));
