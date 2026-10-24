// Evidence inventory only: no execution, extraction, network or decompilation.
import { readEntryJson, readHeader } from './asar.js';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
export function inspectApp(app) {
  let pkg,
    entryCount = 0;
  if (app.asarPath) {
    pkg = readEntryJson(app.asarPath, 'package.json');
    const walk = node => {
      for (const n of Object.values(node?.files ?? {})) {
        if (n.files) walk(n);
        else entryCount++;
      }
    };
    walk(readHeader(app.asarPath).header);
  } else if (app.unpackedDir) {
    const file = join(app.unpackedDir, 'package.json');
    if (statSync(file).size > 1024 * 1024) throw Error('package.json exceeds 1 MiB');
    pkg = JSON.parse(readFileSync(file, 'utf8'));
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw Error('app package.json is missing or invalid');
  const deps = Object.fromEntries(Object.entries(pkg.dependencies ?? {}).filter(([, v]) => typeof v === 'string'));
  const ui = ['react', 'react-dom', 'vue', 'svelte', '@angular/core', 'preact'].filter(
    k => k in deps || k in (pkg.devDependencies ?? {})
  );
  return {
    schema: 1,
    app: {
      id: app.appId,
      name: pkg.productName ?? pkg.name ?? app.name,
      version: pkg.version ?? app.version,
      installDir: app.installDir
    },
    evidence: {
      packageSource: app.asarPath ? `${app.asarPath}:package.json` : join(app.unpackedDir, 'package.json'),
      packaging: app.asarPath ? 'asar' : 'unpacked',
      entryPoint: pkg.main ?? 'index.js',
      archiveEntries: app.asarPath ? entryCount : null,
      declaredDependencies: deps,
      declaredUiLibraries: ui
    },
    available: ['read-only package and archive inventory', 'renderer DOM/JavaScript mods if the app accepts debugging'],
    unknowns: [
      'Remote-debugging support has not been tested.',
      'Bundled dependencies may be missing from package.json; declarations do not establish runtime compatibility.',
      'Preload bridges, main-process IPC, native module ABI and feature dependency closure have not been inspected.',
      'A shared runtime does not establish that a feature can be copied.'
    ],
    recommendation:
      'Prefer an app extension API when available; otherwise specify the feature and build a tested adapter. No app code was executed.'
  };
}
export function compareApps(source, target) {
  const a = inspectApp(source),
    b = inspectApp(target),
    ad = a.evidence.declaredDependencies,
    bd = b.evidence.declaredDependencies;
  return {
    schema: 1,
    source: a,
    target: b,
    sharedDeclaredDependencies: Object.keys(ad)
      .filter(k => k in bd)
      .sort()
      .map(name => ({ name, source: ad[name], target: bd[name], sameDeclaration: ad[name] === bd[name] })),
    verdict: 'needs-feature-analysis',
    nextSteps: [
      'Describe the donor feature inputs, outputs and side effects.',
      'Record acceptance examples from the donor.',
      'Identify a supported destination API and list missing dependencies.',
      'Implement a reusable feature module plus an app-specific adapter; compare results against the examples.'
    ],
    note: 'Matching dependency declarations are inventory evidence only. No compatibility score or automatic transplant is claimed.'
  };
}
