/** A second donor, using the existing guarded fresh-copy playbook delivery. */
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {verifySourceSlice} from '../feature-slices.js';
import {planElectronPlaybook,applyElectronPlaybook,electronPlaybookStatus,rollbackElectronPlaybook} from '../electron-playbook.js';
import {containedFile,newDestination,saveJson,sha256,readJson} from '../workspace.js';
const id='vscode-element-search-linux-x64-v1';
async function probe(source,featurePackage,recipePath){
 const recipe=await readJson(recipePath),reviewed=JSON.parse(await readFile(new URL('../../recipes/element-search/vscode.json',import.meta.url)));
 if(JSON.stringify(recipe)!==JSON.stringify(reviewed))throw Error('Unsupported Element/VS Code binding');
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('This binding targets Linux x86-64');
 const runtime=await realpath(source),feature=await verifySourceSlice(featurePackage,'element-search');
 for(const f of recipe.files)if(sha256(await readFile(await containedFile(runtime,f.path)))!==f.sha256)throw Error('VS Code input changed: '+f.path);
 return {runtime,feature,recipe};
}
export async function planVsCodeElement(source,featurePackage,recipePath){const p=await probe(source,featurePackage,recipePath);return {schema:1,adapter:id,featureDigest:p.feature.digest,recipient:p.recipe.target,sourceModified:false,extensionsUsed:false,surface:p.recipe.surface,acceptance:'not-run'};}
export async function installVsCodeElement(source,featurePackage,recipePath,out){
 const p=await probe(source,featurePackage,recipePath),dest=await newDestination(out,[p.runtime,p.feature.root,dirname(await realpath(recipePath))]);await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});const book=join(dest,'playbook');await mkdir(book);const files=[];
 const add=async(file,bytes,role='asset',beforeSha256=null)=>{const payload=String(files.length);await writeFile(join(book,payload),bytes,{flag:'wx'});files.push({file,payload,role,beforeSha256,afterSha256:sha256(bytes)});};
 try{
  const raw=await readFile(await containedFile(p.runtime,'resources/app/package.json')),pkg=JSON.parse(raw);
  await add('package.json',Buffer.from(JSON.stringify({...pkg,main:'./modkit-element-bootstrap.mjs'},null,2)+'\n'),'main',sha256(raw));
  await add('modkit-element-bootstrap.mjs',Buffer.from("import './modkit-element/main.cjs';\nawait import('./out/main.js');\n"),'main');
  for(const n of ['main.cjs','preload.cjs'])await add('modkit-element/'+n,await readFile(new URL('../example-runtime/element/'+n,import.meta.url)),n==='main.cjs'?'main':'preload');
  for(const f of [...p.feature.files,{path:'FEATURE.json',sha256:sha256(await readFile(join(p.feature.root,'FEATURE.json')))}]){const b=await readFile(await containedFile(p.feature.root,f.path));if(sha256(b)!==f.sha256)throw Error('Feature changed during install');await add('modkit-element/feature/'+f.path,b);}
  const playbook={schema:1,kind:'electron-playbook',id,target:{app:'resources/app',...p.recipe.target},files};await saveJson(join(book,'playbook.json'),playbook);await saveJson(join(dest,'PLAN.json'),await planElectronPlaybook(p.runtime,join(book,'playbook.json')));await applyElectronPlaybook(p.runtime,join(book,'playbook.json'),join(dest,'workspace'));
  const record={schema:1,adapter:id,recipe:{...p.recipe,feature:{id:'element-search',digest:p.feature.digest}},source:p.runtime,featureDigest:p.feature.digest,surface:p.recipe.surface,extensionsUsed:false,acceptance:'not-run'};await saveJson(join(dest,'ADAPTER.json'),record);
  await writeFile(join(dest,'launch.mjs'),await readFile(new URL('./vscode/launch.mjs',import.meta.url)),{flag:'wx'});
  await writeFile(join(dest,'launch-code.sh'),'#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$ROOT/launch.mjs" "$ROOT/workspace" "$@"\n',{flag:'wx',mode:0o755});return {directory:dest,...record};
 }catch(e){await saveJson(join(dest,'FAILED.json'),{message:e.message});throw e;}
}
export async function vsCodeElementStatus(directory){
 const root=await realpath(directory),r=await readJson(await containedFile(root,'ADAPTER.json'));if(r.adapter!==id)throw Error('Wrong adapter');
 const reviewed=JSON.parse(await readFile(new URL('../../recipes/element-search/vscode.json',import.meta.url))),expected={...r.recipe,feature:reviewed.feature};if(JSON.stringify(expected)!==JSON.stringify(reviewed))throw Error('Changed recipient binding');
 const playbook=await electronPlaybookStatus(join(root,'workspace'));let feature=null;if(playbook.status==='applied'){feature=await verifySourceSlice(join(root,'workspace/runtime/resources/app/modkit-element/feature'),'element-search');if(feature.digest!==r.featureDigest)throw Error('Feature digest changed');}
 let clean=playbook.clean;for(const f of reviewed.files){const patch=playbook.files.find(p=>'resources/app/'+p.file===f.path),expected=patch?patch.expected:f.sha256;try{if(sha256(await readFile(await containedFile(join(root,'workspace/runtime'),f.path)))!==expected)clean=false;}catch{clean=false;}}
 return {directory:root,adapter:id,status:playbook.status,clean,featureDigest:r.featureDigest,feature,playbook};
}
export async function rollbackVsCodeElement(directory,options){const s=await vsCodeElementStatus(directory);if(!s.clean)throw Error('Drift; rollback refused');return rollbackElectronPlaybook(join(s.directory,'workspace'),options);}
