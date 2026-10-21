import{cp,mkdir,readFile,writeFile,stat,chmod,realpath}from'node:fs/promises';import{resolve,join}from'node:path';import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{newDestination}from'../src/workspace.js';
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1],source=resolve(args.includes('--code')?value('--code'):'/usr/share/code'),examples=resolve(value('--examples')),out=resolve(value('--out'));
if(!args.includes('--examples')||!args.includes('--out'))throw Error('usage: --examples BUILD --out NEW_NATIVE_COPY [--code /usr/share/code]');
await newDestination(out,[await realpath(source),await realpath(examples)]);await mkdir(out,{mode:0o700});const clone=join(out,'code');await cp(source,clone,{recursive:true,dereference:false,preserveTimestamps:true});
const app=join(clone,'resources','app'),packagePath=join(app,'package.json'),bytes=await readFile(packagePath),pkg=JSON.parse(bytes);if(pkg.type!=='module'||pkg.main!=='./out/main.js')throw Error('unexpected VS Code bootstrap; refusing blind patch');
const native=join(app,'modkit-native');await mkdir(native);await cp('addons/native-host',native,{recursive:true});
for(const name of ['controller.cjs','donor-core.cjs','panel.js','panel.css','panel.html','PROVENANCE.json','MQTT-EXPLORER-LICENSE.md'])await cp(join(examples,'mqtt-vscode',name),join(native,name));
await cp(join(examples,'chromium-documents'),join(native,'documents'),{recursive:true});
let html=await readFile(join(native,'panel.html'),'utf8');html=html.replace("style-src {{CSP}}; script-src 'nonce-{{NONCE}}';","style-src 'self'; script-src 'self';").replaceAll('{{STYLE}}','panel.css').replaceAll('{{SCRIPT}}','panel.js').replace(' nonce="{{NONCE}}"','');await writeFile(join(native,'panel.html'),html);
let renderer=await readFile(join(native,'panel.js'),'utf8');renderer=renderer.replace('const vscode=acquireVsCodeApi()', 'const vscode={postMessage:message=>window.modkitHost.send(message)}');renderer=renderer.replace("window.addEventListener('message',({data:m})=>",'window.modkitHost.onMessage(m=>');await writeFile(join(native,'panel.js'),renderer);
const bootstrap="import './modkit-native/main.cjs';\nawait import('./out/main.js');\n";await writeFile(join(app,'modkit-bootstrap.mjs'),bootstrap);pkg.main='./modkit-bootstrap.mjs';await writeFile(packagePath,JSON.stringify(pkg,null,2)+'\n');
await cp('scripts/launch-native-code.mjs',join(out,'launch-native.mjs'));
const launch=`#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$ROOT/launch-native.mjs" "$ROOT" "$@"
`;await writeFile(join(out,'launch-code.sh'),launch);await chmod(join(out,'launch-code.sh'),0o755);
await writeFile(join(out,'PATCH.json'),JSON.stringify({source,sourcePackageSha256:createHash('sha256').update(bytes).digest('hex'),version:pkg.version,originalEntry:'./out/main.js',patchedEntry:pkg.main,route:'direct application bootstrap modification',hostApis:['Electron BrowserWindow','Electron Menu','scoped IPC preload'],extensionInstalled:false,originalInstallationModified:false,rollback:'Delete this separate application copy; the source installation is untouched.'},null,2)+'\n');
execFileSync(process.execPath,['scripts/native-recipient-evidence.mjs',source,out],{stdio:'inherit'});
console.log(JSON.stringify({directory:out,launcher:join(out,'launch-code.sh'),mode:'Direct VS Code application integration; no extension APIs or installed extension.'},null,2));
