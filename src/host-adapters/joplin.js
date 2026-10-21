/** Exact-version, fresh-copy Joplin adapter. No extension API or donor rewrites. */
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {sha256,readJson,containedFile,newDestination,saveJson,inside} from '../workspace.js';
import {verifyFeaturePackage} from '../feature-package.js';
import {planElectronPlaybook,applyElectronPlaybook,electronPlaybookStatus,rollbackElectronPlaybook} from '../electron-playbook.js';
const pin=z.string().regex(/^[a-f0-9]{64}$/);
const requiredFiles=['resources/app/package.json','resources/app/main.bundle.js','resources/app/main-html.bundle.js','resources/app/index.html','resources/app/bridge.js','joplin'];
const recipeSchema=z.object({schema:z.literal(1),kind:z.literal('feature-host-adapter'),id:z.literal('joplin-raw-diff-linux-x64-v1'),platform:z.literal('linux'),arch:z.literal('x64'),target:z.object({name:z.literal('@joplin/app-desktop'),version:z.literal('3.7.21'),main:z.literal('main.bundle.js'),type:z.literal('commonjs')}).strict(),files:z.array(z.object({path:z.enum(requiredFiles),sha256:pin}).strict()).length(6),feature:z.object({id:z.literal('mqtt-raw-diff'),digest:pin}).strict(),surface:z.literal('application-owned comparison tool window'),commands:z.tuple([z.literal('open'),z.literal('capture-baseline'),z.literal('compare-selection'),z.literal('reset')]),capabilities:z.tuple([z.literal('note.selection'),z.literal('theme'),z.literal('clipboard.writeText'),z.literal('feature.settings')]),extensionsUsed:z.literal(false)}).strict();
export function validateJoplinAdapter(value){const r=recipeSchema.parse(value);if(new Set(r.files.map(f=>f.path)).size!==requiredFiles.length)throw Error('Adapter requires all six distinct target fingerprints');return r;}
const WORKBENCH='resources/app/main-html.bundle.js';
export const startupMarker='n("app/listen for main process events",()=>{';
export function patchJoplinWorkbench(text){if(text.split(startupMarker).length!==2)throw Error('Joplin startup hook is missing or ambiguous');return text.replace(startupMarker,()=>startupMarker+'require("./modkit-comparison/host.cjs").install({ipcRenderer:TMe.ipcRenderer,store:this.store(),commands:xBl.default.instance(),Setting:Co.default});');}
export const ipcProfileMarker='(0,$bi.default)("",(0,Qbi.default)(!0,this.env()==="dev"),"").rootProfileDir';
export function patchJoplinMain(text){if(text.split(ipcProfileMarker).length!==2)throw Error('Joplin IPC profile hook is missing or ambiguous');return text.replace(ipcProfileMarker,'(0,$bi.default)((process.env.YOINKR_JOPLIN_PROFILE??process.env.MODKIT_JOPLIN_PROFILE),(0,Qbi.default)(!0,this.env()==="dev"),"").rootProfileDir');}
async function inputBytes(root,name,max=256*1024*1024){const file=await containedFile(root,name);if((await stat(file)).size>max)throw Error('Adapter input too large: '+name);return readFile(file);}
export async function probeJoplinAdapter(source,recipePath){
 const root=await realpath(source),recipe=validateJoplinAdapter(await readJson(recipePath));
 if(process.platform!==recipe.platform||process.arch!==recipe.arch)throw Error('Adapter is verified only on Linux x86-64');
 for(const f of recipe.files){if(sha256(await inputBytes(root,f.path))!==f.sha256)throw Error('Unsupported/changed Joplin input: '+f.path+'; investigate this version before integration');}
 const pkg=JSON.parse(await inputBytes(root,'resources/app/package.json'));for(const [key,value] of Object.entries(recipe.target))if((key==='type'?(pkg[key]??'commonjs'):pkg[key])!==value)throw Error('Recipient identity differs: '+key);
 patchJoplinMain((await inputBytes(root,'resources/app/main.bundle.js')).toString('utf8'));
 const original=await inputBytes(root,WORKBENCH,32*1024*1024),patched=Buffer.from(patchJoplinWorkbench(original.toString('utf8')));
 return {root,recipe,original,patched,identity:{...recipe.target,files:recipe.files},hook:{path:WORKBENCH,beforeSha256:sha256(original),afterSha256:sha256(patched),selectionMatches:1,themeMatches:1}};
}
export async function planJoplinAdapter(source,featurePackage,recipePath){
 const probe=await probeJoplinAdapter(source,recipePath),feature=await verifyFeaturePackage(featurePackage,{expectedDigest:probe.recipe.feature.digest});
 return {schema:1,kind:'feature-host-adapter-plan',adapter:probe.recipe.id,recipient:probe.identity,feature,surface:probe.recipe.surface,commands:probe.recipe.commands,capabilities:probe.recipe.capabilities,hook:probe.hook,sourceModified:false,extensionsUsed:false,executesApplication:false,rollback:'Hash-checked playbook restores package/workbench and removes all added adapter/feature files. Separate lab profiles are retained.'};
}
export async function installJoplinAdapter(source,featurePackage,recipePath,out){
 const sourceRoot=await realpath(source),featureRoot=await realpath(featurePackage),recipeFile=await realpath(recipePath),plan=await planJoplinAdapter(sourceRoot,featureRoot,recipeFile);
 const dest=await newDestination(out,[sourceRoot,featureRoot,dirname(recipeFile)]);if(inside(dest,sourceRoot)||inside(dest,featureRoot))throw Error('Output cannot contain selected inputs');
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 const book=join(dest,'playbook');await mkdir(book);const operations=[];
 const add=async(role,file,bytes,beforeSha256=null)=>{const payload=String(operations.length);await writeFile(join(book,payload),bytes,{flag:'wx',mode:0o600});operations.push({role,file,payload,beforeSha256,afterSha256:sha256(bytes)});};
 try {
  const originalPackage=await inputBytes(sourceRoot,'resources/app/package.json'),pkg=JSON.parse(originalPackage);
  await add('main','package.json',Buffer.from(JSON.stringify({...pkg,main:'./modkit-comparison-bootstrap.cjs'},null,2)+'\n'),sha256(originalPackage));
  await add('main','modkit-comparison-bootstrap.cjs',Buffer.from("if(!(process.env.YOINKR_JOPLIN_PROFILE??process.env.MODKIT_JOPLIN_PROFILE))throw Error('Use the isolated Yoinkr launcher');\nprocess.argv=process.argv.filter(a=>!/^--inspect(?:=|$)/.test(a)&&a!=='--disable-dev-shm-usage'&&!a.startsWith('--js-flags='));\nrequire('./modkit-comparison/main.cjs');\nrequire('./main.bundle.js');\n"));
  const original=await inputBytes(sourceRoot,WORKBENCH,32*1024*1024);await add('renderer',WORKBENCH.slice('resources/app/'.length),Buffer.from(patchJoplinWorkbench(original.toString('utf8'))),sha256(original));
  const mainBytes=await inputBytes(sourceRoot,'resources/app/main.bundle.js');await add('main','main.bundle.js',Buffer.from(patchJoplinMain(mainBytes.toString('utf8'))),sha256(mainBytes));
  for(const name of ['main.cjs','preload.cjs','panel.html','renderer.js','host.cjs'])await add(name==='main.cjs'?'main':name==='preload.cjs'?'preload':'renderer','modkit-comparison/'+name,await readFile(new URL('./joplin/runtime/'+name,import.meta.url)));
  const manifest=await readJson(await containedFile(featureRoot,'FEATURE.json'));
  await add('asset','modkit-comparison/binding.json',Buffer.from(JSON.stringify({schema:1,adapterId:plan.adapter,featureDigest:plan.feature.digest,payload:Object.fromEntries(manifest.files.filter(f=>['payload/feature.js','payload/index.html'].includes(f.path)).map(f=>[f.path,f.sha256]))},null,2)+'\n'));
  const featureFiles=[...manifest.files,{path:'FEATURE.json',sha256:sha256(await inputBytes(featureRoot,'FEATURE.json'))}];
  for(const f of featureFiles){const bytes=await inputBytes(featureRoot,f.path,32*1024*1024);if(sha256(bytes)!==f.sha256)throw Error('Feature changed during adapter preparation: '+f.path);await add('asset','modkit-comparison/feature/'+f.path,bytes);}
  const playbook={schema:1,kind:'electron-playbook',id:plan.adapter,target:{app:'resources/app',...plan.recipient},files:operations};delete playbook.target.files;
  await saveJson(join(book,'playbook.json'),playbook);await saveJson(join(dest,'PLAN.json'),plan);
  await saveJson(join(dest,'PLAYBOOK-PLAN.json'),await planElectronPlaybook(sourceRoot,join(book,'playbook.json')));
  await applyElectronPlaybook(sourceRoot,join(book,'playbook.json'),join(dest,'workspace'));
  const adapter={schema:1,kind:'feature-host-adapter-workspace',adapter:plan.adapter,featureDigest:plan.feature.digest,featureLocation:'runtime/resources/app/modkit-comparison/feature',workspace:'workspace',source:sourceRoot,identity:plan.recipient,hook:plan.hook,recipe:JSON.parse(await readFile(recipeFile)),surface:plan.surface,extensionsUsed:false,sourceModified:false,createdFiles:operations.filter(f=>f.beforeSha256===null).length};
  await saveJson(join(dest,'ADAPTER.json'),adapter);
  await writeFile(join(dest,'launch.mjs'),await readFile(new URL('./joplin/launch.mjs',import.meta.url)),{flag:'wx'});
  await writeFile(join(dest,'launch-joplin.sh'),'#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$ROOT/launch.mjs" "$ROOT/workspace" "$@"\n',{flag:'wx',mode:0o755});
  return {directory:dest,...adapter,status:'prepared'};
 }catch(e){await saveJson(join(dest,'FAILED.json'),{schema:1,status:'failed',message:e.message}).catch(()=>{});throw e;}
}
export async function joplinAdapterStatus(directory){
 const root=await realpath(directory),adapter=await readJson(await containedFile(root,'ADAPTER.json'));if(adapter.kind!=='feature-host-adapter-workspace'||adapter.adapter!=='joplin-raw-diff-linux-x64-v1'||adapter.workspace!=='workspace'||adapter.featureLocation!=='runtime/resources/app/modkit-comparison/feature')throw Error('Invalid Joplin adapter workspace');
 const recipe=validateJoplinAdapter(adapter.recipe);if(recipe.feature.digest!==adapter.featureDigest)throw Error('Adapter feature binding changed');
 const playbook=await electronPlaybookStatus(join(root,'workspace'));const recipient=[];
 for(const f of recipe.files){const file=f.path.slice('resources/app/'.length),patched=f.path.startsWith('resources/app/')?playbook.files.find(p=>p.file===file):null;const expected=patched?patched.expected:f.sha256;let actual;try{actual=sha256(await inputBytes(join(root,'workspace/runtime'),f.path))}catch(e){if(e.code!=='ENOENT')throw e;actual=null}recipient.push({path:f.path,expected,actual,clean:actual===expected});}
 let feature=null;if(playbook.status==='applied')feature=await verifyFeaturePackage(join(root,'workspace',adapter.featureLocation),{expectedDigest:adapter.featureDigest});
 return {directory:root,adapter:adapter.adapter,status:playbook.status,clean:playbook.clean&&recipient.every(f=>f.clean),featureDigest:adapter.featureDigest,feature,recipient,playbook};
}
export async function rollbackJoplinAdapter(directory,{dryRun=false}={}){const status=await joplinAdapterStatus(directory);if(!status.clean)throw Error('Adapter changed; rollback refused');return rollbackElectronPlaybook(join(status.directory,'workspace'),{dryRun});}
