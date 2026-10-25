import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const project = fileURLToPath(new URL('..', import.meta.url));
export function supportedNode(version) {
  const [major, minor] = version.split('.').map(Number);
  return (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
}
async function file(path, executable = false) {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, executable && process.platform !== 'win32' ? constants.X_OK : constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function command(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const suffix of process.platform === 'win32' ? ['', '.exe', '.cmd'] : ['']) {
      const path = join(directory, name + suffix);
      if (await file(path, true)) return path;
    }
  }
  return null;
}
// Resolve metadata only. A diagnostic must not execute an operator-selected module.
function modulePath(name, root) {
  try {
    return createRequire(join(root, 'package.json')).resolve(name);
  } catch {
    return null;
  }
}
export async function diagnose({
  example,
  firefox,
  sdk = '/',
  root = project,
  nodeVersion = process.versions.node
} = {}) {
  if (example && !['screenity-firefox', 'krita-obs'].includes(example))
    throw Error('Choose --example screenity-firefox or --example krita-obs');
  const checks = [];
  const add = (name, ready, required, detail, remedy = '') =>
    checks.push({
      name,
      status: ready ? 'ok' : required ? 'missing' : 'optional',
      required,
      detail,
      remedy: ready ? '' : remedy
    });
  add(
    'Node',
    supportedNode(nodeVersion),
    true,
    nodeVersion,
    'Use Node 22.19+, 24.11+, or 26+ on their supported release lines.'
  );
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const found = modulePath(name === 'rea-agents' ? 'rea-agents/scripts/rea.mjs' : name, root);
    add(name, !!found, true, found ?? 'Not installed', 'Run npm ci --ignore-scripts from the Yoinkr checkout.');
  }
  const playwright = modulePath(process.env.PLAYWRIGHT_MODULE ?? 'playwright', root);
  add(
    'Playwright',
    !!playwright,
    false,
    playwright ?? 'Optional browser automation is not installed',
    'Install Playwright in a separate tools directory and set PLAYWRIGHT_MODULE to its absolute index.mjs path. Install its Chromium browser separately.'
  );
  for (const name of ['c++', 'pkg-config', 'Xvfb']) {
    const found = await command(name);
    add(
      name,
      !!found,
      example === 'krita-obs' && name === 'c++',
      found ?? 'Not found on PATH',
      'Install the native build/display tools listed in examples/krita-obs/README.md.'
    );
  }
  if (example === 'krita-obs') {
    add(
      'Native example platform',
      process.platform === 'linux' && process.arch === 'x64',
      true,
      `${process.platform}/${process.arch}; accepted lane is Linux x86-64/X11`,
      'Use the documented Linux lane; other native platforms still require acceptance.'
    );
    const prefix = resolve(sdk);
    for (const relative of [
      'usr/include/obs/obs-module.h',
      'usr/include/x86_64-linux-gnu/qt6/QtWidgets/QWidget',
      'usr/lib/x86_64-linux-gnu/libobs.so',
      'usr/lib/x86_64-linux-gnu/libobs-frontend-api.so',
      'usr/lib/x86_64-linux-gnu/libQt6Widgets.so',
      'usr/lib/qt6/libexec/moc'
    ]) {
      const path = join(prefix, relative);
      add(
        'OBS/Qt ' + relative,
        await file(path),
        true,
        path,
        'Install the matching OBS/Qt development SDK, or supply --sdk /path/to/sdk-prefix. File discovery does not establish ABI compatibility.'
      );
    }
  }
  if (example === 'screenity-firefox') {
    const local = join(root, 'examples', example);
    const deps = JSON.parse(await readFile(join(local, 'package.json'), 'utf8'));
    for (const name of Object.keys(deps.dependencies)) {
      const found = modulePath(name, local);
      add(
        'Screenity ' + name,
        !!found,
        true,
        found ?? 'Not installed',
        'Run npm ci --ignore-scripts in examples/screenity-firefox.'
      );
    }
    const supplied = firefox ?? process.env.YOINKR_FIREFOX;
    let candidates = supplied
      ? [resolve(supplied)]
      : [
          join(
            local,
            '.local',
            'firefox',
            process.platform === 'darwin'
              ? 'Firefox.app/Contents/MacOS/firefox'
              : process.platform === 'win32'
                ? 'firefox.exe'
                : 'firefox'
          ),
          ...(process.platform === 'darwin' ? ['/Applications/Firefox.app/Contents/MacOS/firefox'] : []),
          ...(process.platform === 'win32' && process.env.ProgramFiles
            ? [join(process.env.ProgramFiles, 'Mozilla Firefox', 'firefox.exe')]
            : [])
        ];
    if (supplied) {
      const p = resolve(supplied);
      candidates.push(
        join(
          p,
          process.platform === 'darwin'
            ? 'Contents/MacOS/firefox'
            : process.platform === 'win32'
              ? 'firefox.exe'
              : 'firefox'
        )
      );
    } else {
      const found = await command('firefox');
      if (found) candidates.push(found);
    }
    let browser;
    for (const path of candidates)
      if (await file(path, true)) {
        browser = path;
        break;
      }
    add(
      'Firefox',
      !!browser,
      true,
      browser ?? 'No Firefox executable found',
      'Supply --firefox /path/to/Firefox.app, an extracted Firefox directory, or the executable. Firefox 142+ is required; version and capture behavior need native verification.'
    );
    const manifest = join(local, '.local', 'demo', 'extension', 'manifest.json');
    add(
      'Screenity build',
      await file(manifest),
      true,
      manifest,
      'From examples/screenity-firefox run npm run acquire, then npm run build -- /path/to/Firefox.'
    );
  }
  return {
    schema: 1,
    version: pkg.version,
    platform: process.platform,
    arch: process.arch,
    example: example ?? null,
    ready: checks.every(c => !c.required || c.status === 'ok'),
    checks,
    scope:
      'Read-only prerequisite discovery. No application, browser, or selected JavaScript module was executed; ABI, browser version, and native behavior are not verified.'
  };
}
