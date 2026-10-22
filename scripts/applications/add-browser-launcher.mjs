import{copyFile,writeFile,chmod}from'node:fs/promises';import{resolve,join}from'node:path';
const dir=resolve(process.argv[2]);await copyFile('scripts/applications/launch-documents.mjs',join(dir,'launch-documents.mjs'));
const shell=`#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -z "\${YOINKR_CHROMIUM:-}" ]; then
 for NAME in chromium chromium-browser google-chrome; do
  if command -v "$NAME" >/dev/null 2>&1; then YOINKR_CHROMIUM=$(command -v "$NAME"); export YOINKR_CHROMIUM; break; fi
 done
fi
if [ -z "\${YOINKR_CHROMIUM:-}" ] && [ -f "$ROOT/browser-path.txt" ]; then
 YOINKR_CHROMIUM=$(cat "$ROOT/browser-path.txt"); export YOINKR_CHROMIUM
fi
exec node "$ROOT/launch-documents.mjs" "$ROOT" "$@"
`;
await writeFile(join(dir,'launch-documents.sh'),shell,{mode:0o755});await chmod(join(dir,'launch-documents.sh'),0o755);
if((process.env.YOINKR_CHROMIUM??process.env.MODKIT_CHROMIUM))await writeFile(join(dir,'browser-path.txt'),(process.env.YOINKR_CHROMIUM??process.env.MODKIT_CHROMIUM)+'\n');
