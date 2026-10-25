// Generated-copy launcher: check payload drift and use only this example's profile.
import { readFile, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(await readFile(join(root, 'BUILD.json')));
if (record.schema !== 1 || record.marker !== 'ublock-vscode-research-browser') throw Error('Wrong browser build');
const runtime = await realpath(join(root, 'workspace/runtime'));
for (const [name, expected] of Object.entries(record.outputs)) {
  const file = resolve(runtime, name),
    rel = relative(runtime, file);
  if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw Error('Invalid build path');
  const info = await lstat(file),
    canonical = relative(runtime, await realpath(file));
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    isAbsolute(canonical) ||
    canonical.startsWith('..') ||
    info.size > 256 * 1024 * 1024 ||
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex') !== expected
  )
    throw Error('Runtime drift; rebuild before launching: ' + name);
}
const user = join(root, 'workspace/p/u'),
  extensions = join(root, 'workspace/p/e');
if (Buffer.byteLength(join(user, '1.14-main.sock')) > 107)
  throw Error('Use a shorter build destination to fit VS Code IPC paths');
await mkdir(join(user, 'User'), { recursive: true });
await mkdir(extensions, { recursive: true });
try {
  await writeFile(
    join(user, 'User/settings.json'),
    JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'extensions.autoCheckUpdates': false,
      'workbench.enableExperiments': false,
      'workbench.startupEditor': 'none',
      'window.titleBarStyle': 'native'
    }),
    { flag: 'wx', mode: 0o600 }
  );
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VSCODE_') && !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(k)
  )
);
// --disable-extensions would also interfere with the browser extension runtime.
// The separate, initially empty extensions directory isolates VS Code extensions.
const child = spawn(
  join(runtime, 'code'),
  [
    '--user-data-dir=' + user,
    '--extensions-dir=' + extensions,
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    ...process.argv.slice(2)
  ],
  { env, stdio: 'inherit' }
);
child.on('error', e => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
