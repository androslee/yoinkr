// Example-specific launcher, separate from the generic, non-executing playbook engine.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(process.argv[2]),
  suffix = process.env.YOINKR_PROFILE_SUFFIX ?? process.env.MODKIT_PROFILE_SUFFIX ?? 'default';
if (!/^[a-zA-Z0-9_-]{1,32}$/.test(suffix)) throw Error('invalid lab profile');
const portable = join(root, 'p', suffix);
if (Buffer.byteLength(join(portable, 'user-data/1.14-main.sock')) > 107)
  throw Error('Lab path too long for Electron IPC; use a shorter output path');
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VSCODE_') && k !== 'ELECTRON_RUN_AS_NODE')
);
Object.assign(env, { VSCODE_PORTABLE: portable, YOINKR_OPEN_MQTT: '1' });
await mkdir(join(portable, 'user-data/User'), { recursive: true });
await mkdir(join(portable, 'extensions'), { recursive: true });
try {
  await writeFile(
    join(portable, 'user-data/User/settings.json'),
    JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'extensions.autoCheckUpdates': false,
      'workbench.enableExperiments': false,
      'workbench.startupEditor': 'none'
    }),
    { flag: 'wx' }
  );
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
const child = spawn(
  join(root, 'runtime/code'),
  [
    '--user-data-dir=' + join(portable, 'user-data'),
    '--extensions-dir=' + join(portable, 'extensions'),
    ...process.argv.slice(3)
  ],
  { env, stdio: 'inherit' }
);
child.once('error', e => {
  console.error(e.message);
  process.exitCode = 1;
});
child.once('exit', code => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
