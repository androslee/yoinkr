import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const launcher = new URL('./.local/plugin-browser/launch.mjs', import.meta.url);
try {
  await access(launcher);
} catch {
  console.error('Build the example first. See examples/ublock-vscode/README.md.');
  process.exit(1);
}
await import(fileURLToPath(launcher));
