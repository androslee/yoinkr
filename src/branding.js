import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Prefer Yoinkr settings while keeping an existing installation's mods usable. */
export function resolveHome({ explicit, env = process.env, userHome = homedir() } = {}) {
  const preferred = join(userHome, '.yoinkr'),
    legacy = join(userHome, '.modkit');
  return (
    explicit ??
    env.YOINKR_HOME ??
    env.MODKIT_HOME ??
    (existsSync(preferred) || !existsSync(legacy) ? preferred : legacy)
  );
}
