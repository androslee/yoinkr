/** Shared adapter operations. Recipient-specific imports stay behind this registry. */
import {readJson,containedFile} from '../workspace.js';
import {realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
const supported='vscode-raw-diff-linux-x64-v1',second='joplin-raw-diff-linux-x64-v1',third='vscode-zlib-bridge-linux-x64-v1',fourth='vscode-element-search-linux-x64-v1';
const select=id=>id===supported?import('./vscode.js'):id===second?import('./joplin.js'):id===third?import('./vscode-bridge.js'):id===fourth?import('./vscode-element.js'):Promise.reject(Error('Unsupported host adapter; inspect host-adapters for verified bindings'));
const names=id=>id===fourth?['planVsCodeElement','installVsCodeElement','vsCodeElementStatus','rollbackVsCodeElement']:id===supported?['planVsCodeAdapter','installVsCodeAdapter','vsCodeAdapterStatus','rollbackVsCodeAdapter']:id===third?['planVsCodeBridge','installVsCodeBridge','vsCodeBridgeStatus','rollbackVsCodeBridge']:['planJoplinAdapter','installJoplinAdapter','joplinAdapterStatus','rollbackJoplinAdapter'];
export const hostAdapterCatalog=()=>[{id:supported,recipient:'VS Code',version:'1.142.0',verifiedVersions:['1.142.0','1.141.0'],platform:'linux',arch:'x64',surface:'application-owned tool window',capabilities:['editor.selection','theme','clipboard.writeText','feature.settings'],extensionsUsed:false},{id:second,recipient:'Joplin',version:'3.7.21',platform:'linux',arch:'x64',surface:'application-owned tool window',capabilities:['note.selection','theme','clipboard.writeText','feature.settings'],extensionsUsed:false},{id:third,recipient:'VS Code',version:'1.142.0',platform:'linux',arch:'x64',surface:'application-owned saved-file checksum window',capabilities:['file.savedPath','file.readBytes','bridge.crc32'],extensionsUsed:false},{id:fourth,recipient:'VS Code',version:'1.142.0',platform:'linux',arch:'x64',surface:'application-owned transcript search window',capabilities:['local.transcript.open','transcript.search'],extensionsUsed:false,acceptance:'native recipient verified; original Element app baseline pending'}];
async function adapter(recipe){const r=await readJson(recipe);if(r.kind!=='feature-host-adapter')throw Error('Unsupported host adapter');return {module:await select(r.id),names:names(r.id)};}
export async function planHostAdapter(recipe,{runtime,featurePackage,python}){const a=await adapter(recipe);return a.module[a.names[0]](runtime,featurePackage,recipe,python);}
export async function applyHostAdapter(recipe,{runtime,featurePackage,out,python}){const a=await adapter(recipe);return a.module[a.names[1]](runtime,featurePackage,recipe,out,python);}
async function installed(directory){const root=await realpath(directory),r=await readJson(await containedFile(root,'ADAPTER.json'));return {module:await select(r.adapter),names:names(r.adapter)}}
export async function hostAdapterStatus(directory){const a=await installed(directory);return a.module[a.names[2]](directory);}
export async function rollbackHostAdapter(directory,options){const a=await installed(directory);return a.module[a.names[3]](directory,options);}

export async function activateHostAdapter(directory,{profile='demo',noSandbox=false}={}){
 const status=await hostAdapterStatus(directory);if(!status.clean)throw Error('Adapter/runtime drift detected; activation refused');if(!/^[a-zA-Z0-9_-]{1,24}$/.test(profile))throw Error('Invalid lab profile');
 const child=spawn(process.execPath,[join(status.directory,'launch.mjs'),join(status.directory,'workspace'),...(noSandbox?['--no-sandbox']:[])],{env:{...process.env,YOINKR_PROFILE_SUFFIX:profile,MODKIT_PROFILE_SUFFIX:profile},stdio:'inherit'});return child;
}
