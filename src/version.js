import { readFileSync } from 'node:fs';
export const YOINKR_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// Kept for old external integrations; new code imports YOINKR_VERSION.
export const MODKIT_VERSION = YOINKR_VERSION;
