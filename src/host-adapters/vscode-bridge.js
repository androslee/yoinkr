/** Exact-version, fresh-copy VS Code adapter. No extension API or donor rewrites. */
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {sha256,readJson,containedFile,newDestination,saveJson,inside} from '../workspace.js';
import component from '../component-package.cjs';import supervisor from '../component-bridge.cjs';
const {verifyComponentPackage}=component,{fingerprintPython}=supervisor;
import {planElectronPlaybook,applyElectronPlaybook,electronPlaybookStatus,rollbackElectronPlaybook} from '../electron-playbook.js';
const pin=z.string().regex(/^[a-f0-9]{64}$/);
const requiredFiles=['resources/app/package.json','resources/app/product.json','resources/app/out/main.js','resources/app/out/vs/workbench/workbench.desktop.main.js','resources/app/out/vs/base/parts/sandbox/electron-browser/preload.js','code'];
const recipeSchema=z.object({schema:z.literal(1),kind:z.literal('feature-host-adapter'),id:z.literal('vscode-zlib-bridge-linux-x64-v1'),platform:z.literal('linux'),arch:z.literal('x64'),target:z.object({name:z.literal('Code'),version:z.literal('1.142.0'),main:z.literal('./out/main.js'),type:z.literal('module')}).strict(),files:z.array(z.object({path:z.enum(requiredFiles),sha256:pin}).strict()).length(6),feature:z.object({id:z.literal('zlib-crc32'),digest:pin}).strict(),surface:z.literal('application-owned saved-file checksum window'),commands:z.tuple([z.literal('open'),z.literal('checksum-saved-file'),z.literal('cancel')]),capabilities:z.tuple([z.literal('file.savedPath'),z.literal('file.readBytes'),z.literal('bridge.crc32')]),extensionsUsed:z.literal(false)}).strict();
export function validateVsCodeBridge(value){const r=recipeSchema.parse(value);if(new Set(r.files.map(f=>f.path)).size!==requiredFiles.length)throw Error('Adapter requires all six distinct target fingerprints');return r;}
const WORKBENCH='resources/app/out/vs/workbench/workbench.desktop.main.js';
export const selectionMarker='Vc.on("vscode:runAction",async(t,...i)=>{let n=i[0],r=n.args||[];';
// Original service references are supplied by the pinned surrounding class.
const hook=`if(n.id==="yoinkr.savedFile"){try{let e=this.editorService.activeTextEditorControl;if(e&&typeof e.getModifiedEditor==="function")e=e.getModifiedEditor();const m=e?.getModel?.();if(!m||m.uri.scheme!=="file")throw Error("Open a saved local file first");Vc.send("vscode:modkit:file",{requestId:n.modkitRequestId,path:m.uri.fsPath})}catch(e){Vc.send("vscode:modkit:file",{requestId:n.modkitRequestId,error:String(e.message).slice(0,300)})}return;}`;
export function patchVsCodeWorkbench(text){if(text.split(selectionMarker).length!==2)throw Error('VS Code saved-file hook missing or ambiguous');return text.replace(selectionMarker,()=>selectionMarker+hook);}
async function inputBytes(root,name,max=256*1024*1024){const file=await containedFile(root,name);if((await stat(file)).size>max)throw Error('Adapter input too large: '+name);return readFile(file);}
export async function probeVsCodeBridge(source,recipePath){
 const root=await realpath(source),recipe=validateVsCodeBridge(await readJson(recipePath));
 if(process.platform!==recipe.platform||process.arch!==recipe.arch)throw Error('Adapter is verified only on Linux x86-64');
 for(const f of recipe.files){if(sha256(await inputBytes(root,f.path))!==f.sha256)throw Error('Unsupported/changed VS Code input: '+f.path+'; investigate this version before integration');}
 const pkg=JSON.parse(await inputBytes(root,'resources/app/package.json'));for(const [key,value] of Object.entries(recipe.target))if(pkg[key]!==value)throw Error('Recipient identity differs: '+key);
 const original=await inputBytes(root,WORKBENCH,32*1024*1024),patched=Buffer.from(patchVsCodeWorkbench(original.toString('utf8')));
 return {root,recipe,original,patched,identity:{...recipe.target,files:recipe.files},hook:{path:WORKBENCH,beforeSha256:sha256(original),afterSha256:sha256(patched),filePathMatches:1}};
}
export async function planVsCodeBridge(source,featurePackage,recipePath,python){
 const probe=await probeVsCodeBridge(source,recipePath),feature=await verifyComponentPackage(featurePackage,probe.recipe.feature.digest),interpreter=await fingerprintPython(python);
 return {schema:1,kind:'feature-host-adapter-plan',adapter:probe.recipe.id,recipient:probe.identity,feature,surface:probe.recipe.surface,commands:probe.recipe.commands,capabilities:probe.recipe.capabilities,python:interpreter,hook:probe.hook,sourceModified:false,extensionsUsed:false,executesApplication:false,rollback:'Hash-checked playbook restores package/workbench and removes all added adapter/feature files. Separate lab profiles are retained.'};
}
export async function installVsCodeBridge(source,featurePackage,recipePath,out,python){
 const sourceRoot=await realpath(source),featureRoot=await realpath(featurePackage),recipeFile=await realpath(recipePath),plan=await planVsCodeBridge(sourceRoot,featureRoot,recipeFile,python);
 const dest=await newDestination(out,[sourceRoot,featureRoot,dirname(recipeFile)]);if(inside(dest,sourceRoot)||inside(dest,featureRoot))throw Error('Output cannot contain selected inputs');
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 const book=join(dest,'playbook');await mkdir(book);const operations=[];
 const add=async(role,file,bytes,beforeSha256=null)=>{const payload=String(operations.length);await writeFile(join(book,payload),bytes,{flag:'wx',mode:0o600});operations.push({role,file,payload,beforeSha256,afterSha256:sha256(bytes)});};
 try {
  const originalPackage=await inputBytes(sourceRoot,'resources/app/package.json'),pkg=JSON.parse(originalPackage);
  await add('main','package.json',Buffer.from(JSON.stringify({...pkg,main:'./modkit-native-bootstrap.mjs'},null,2)+'\n'),sha256(originalPackage));
  await add('main','modkit-native-bootstrap.mjs',Buffer.from("import './modkit-native/main.cjs';\nawait import('./out/main.js');\n"));
  const original=await inputBytes(sourceRoot,WORKBENCH,32*1024*1024);await add('renderer',WORKBENCH.slice('resources/app/'.length),Buffer.from(patchVsCodeWorkbench(original.toString('utf8'))),sha256(original));
  for(const name of ['main.cjs','preload.cjs','panel.html','renderer.js'])await add(name==='main.cjs'?'main':name==='preload.cjs'?'preload':'renderer','modkit-native/'+name,await readFile(new URL('./vscode-bridge/runtime/'+name,import.meta.url)));
  const manifest=await readJson(await containedFile(featureRoot,'COMPONENT.json'));
  await add('asset','modkit-native/binding.json',Buffer.from(JSON.stringify({schema:1,adapterId:plan.adapter,componentDigest:plan.feature.digest,python:plan.python},null,2)+'\n'));
  for(const name of ['component-bridge.cjs','component-package.cjs'])await add('main','modkit-native/'+name,await readFile(new URL('../'+name,import.meta.url)));
  const componentFiles=[...manifest.files,{path:'COMPONENT.json',sha256:sha256(await inputBytes(featureRoot,'COMPONENT.json'))}];
  for(const f of componentFiles){const bytes=await inputBytes(featureRoot,f.path);if(sha256(bytes)!==f.sha256)throw Error('Component changed during preparation');await add('asset','modkit-native/component/'+f.path,bytes);}
  const playbook={schema:1,kind:'electron-playbook',id:plan.adapter,target:{app:'resources/app',...plan.recipient},files:operations};delete playbook.target.files;
  await saveJson(join(book,'playbook.json'),playbook);await saveJson(join(dest,'PLAN.json'),plan);
  await saveJson(join(dest,'PLAYBOOK-PLAN.json'),await planElectronPlaybook(sourceRoot,join(book,'playbook.json')));
  await applyElectronPlaybook(sourceRoot,join(book,'playbook.json'),join(dest,'workspace'));
  const adapter={schema:1,kind:'feature-host-adapter-workspace',adapter:plan.adapter,featureDigest:plan.feature.digest,featureLocation:'runtime/resources/app/modkit-native/component',workspace:'workspace',source:sourceRoot,identity:plan.recipient,hook:plan.hook,recipe:JSON.parse(await readFile(recipeFile)),surface:plan.surface,extensionsUsed:false,sourceModified:false,createdFiles:operations.filter(f=>f.beforeSha256===null).length};
  await saveJson(join(dest,'ADAPTER.json'),adapter);
  await writeFile(join(dest,'launch.mjs'),await readFile(new URL('./vscode/launch.mjs',import.meta.url)),{flag:'wx'});
  await writeFile(join(dest,'launch-code.sh'),'#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$ROOT/launch.mjs" "$ROOT/workspace" "$@"\n',{flag:'wx',mode:0o755});
  return {directory:dest,...adapter,status:'prepared'};
 }catch(e){await saveJson(join(dest,'FAILED.json'),{schema:1,status:'failed',message:e.message}).catch(()=>{});throw e;}
}
export async function vsCodeBridgeStatus(directory){
 const root=await realpath(directory),adapter=await readJson(await containedFile(root,'ADAPTER.json'));if(adapter.kind!=='feature-host-adapter-workspace'||adapter.adapter!=='vscode-zlib-bridge-linux-x64-v1'||adapter.workspace!=='workspace'||adapter.featureLocation!=='runtime/resources/app/modkit-native/component')throw Error('Invalid VS Code adapter workspace');
 const recipe=validateVsCodeBridge(adapter.recipe);if(recipe.feature.digest!==adapter.featureDigest)throw Error('Adapter feature binding changed');
 const playbook=await electronPlaybookStatus(join(root,'workspace'));const recipient=[];
 for(const f of recipe.files){const file=f.path.slice('resources/app/'.length),patched=f.path.startsWith('resources/app/')?playbook.files.find(p=>p.file===file):null;const expected=patched?patched.expected:f.sha256;let actual;try{actual=sha256(await inputBytes(join(root,'workspace/runtime'),f.path))}catch(e){if(e.code!=='ENOENT')throw e;actual=null}recipient.push({path:f.path,expected,actual,clean:actual===expected});}
 let feature=null;if(playbook.status==='applied')feature=await verifyComponentPackage(join(root,'workspace',adapter.featureLocation),adapter.featureDigest);
 return {directory:root,adapter:adapter.adapter,status:playbook.status,clean:playbook.clean&&recipient.every(f=>f.clean),featureDigest:adapter.featureDigest,feature,recipient,playbook};
}
export async function rollbackVsCodeBridge(directory,{dryRun=false}={}){const status=await vsCodeBridgeStatus(directory);if(!status.clean)throw Error('Adapter changed; rollback refused');return rollbackElectronPlaybook(join(status.directory,'workspace'),{dryRun});}
