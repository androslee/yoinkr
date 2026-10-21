// Reproducible, declared-action baselines against an owned original application.
import {z} from 'zod';
import {readFile,writeFile,mkdir,realpath,stat,lstat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {newDestination,containedFile,readJson,saveJson,writeState,sha256,inside} from './workspace.js';
import {safeRelative} from './research.js';
import {readCase} from './investigation.js';
import {validatePNG} from './examples.js';
import {inspectInstall} from './detect.js';
const short=z.string().min(1).max(1000),key=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const selector=z.string().min(1).max(500);
const stepSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('click'),selector}).strict(),
 z.object({action:z.literal('fill'),selector,value:z.string().max(4000)}).strict(),
 z.object({action:z.literal('press'),selector,key:z.enum(['Enter','Escape','ControlOrMeta+A','ControlOrMeta+C','Tab'])}).strict(),
 z.object({action:z.literal('publish'),topic:z.string().min(1).max(200),payload:z.string().max(1024*1024)}).strict(),
 z.object({action:z.literal('assert'),selector,property:z.enum(['text','count','visible','value','aria-pressed','aria-selected','aria-expanded','background-color','selection','clipboard']),expected:z.union([z.string().max(4000),z.number().int().min(0).max(10000),z.boolean()]),match:z.enum(['equals','contains']).default('equals')}).strict(),
 z.object({action:z.literal('resize'),width:z.number().int().min(320).max(4096),height:z.number().int().min(240).max(2160)}).strict(),
 z.object({action:z.literal('snapshot'),name:key}).strict()
]);
export const featureRecipeSchema=z.object({
 schema:z.literal(1),kind:z.literal('feature-baseline-recipe'),id:key,title:short,
 donor:z.object({revision:z.string().regex(/^[a-f0-9]{40}$/),sourceFiles:z.array(z.string().min(1).max(1000)).min(1).max(128),pageSuffix:z.string().min(1).max(200)}).strict(),
 scope:z.object({required:z.array(short).min(1).max(32),optional:z.array(short).max(32),excluded:z.array(short).max(32)}).strict(),
 scenarios:z.array(z.object({id:key,title:short,steps:z.array(stepSchema).min(1).max(100)}).strict()).min(1).max(32),
 dependencies:z.array(z.object({name:short,disposition:z.enum(['recover','external','host-service','boundary-adaptation','unresolved','excluded']),reason:short,sourcePaths:z.array(z.string().max(1000)).max(32)}).strict()).max(128),
 stepTimeoutMs:z.number().int().min(100).max(10000).default(5000)
}).strict();
export function validateFeatureRecipe(recipe){
 const r=featureRecipeSchema.parse(recipe);if(Buffer.byteLength(JSON.stringify(r))>2*1024*1024)throw Error('feature recipe exceeds 2 MiB');
 for(const p of r.donor.sourceFiles)safeRelative(p);
 const ids=new Set();for(const scenario of r.scenarios){if(ids.has(scenario.id))throw Error('duplicate scenario id');ids.add(scenario.id);let assertions=0;const shots=new Set();for(const step of scenario.steps){if(step.action==='assert'){
  assertions++;if(['text','value','aria-pressed','aria-selected','aria-expanded','background-color','selection','clipboard'].includes(step.property)&&typeof step.expected!=='string'||step.property==='count'&&typeof step.expected!=='number'||step.property==='visible'&&typeof step.expected!=='boolean'||step.match==='contains'&&typeof step.expected!=='string')throw Error('assertion property/expected type differs');
 }if(step.action==='snapshot'){if(shots.has(step.name))throw Error('duplicate screenshot name');shots.add(step.name);}}
 if(!assertions)throw Error('each scenario needs an observable assertion');}
 for(const dep of r.dependencies)for(const p of dep.sourcePaths)safeRelative(p);
 return r;
}
const bounded=async(path,max)=>{if((await stat(path)).size>max)throw Error('input exceeds size limit');return readFile(path);};
export async function probeFeatureRecipient(path,{id,surface,capabilities=[]}={}){
 const root=await realpath(resolve(path)),app=inspectInstall(root);if(!app)throw Error('recipient is not a recognized extracted Electron installation');
 return {schema:1,id,root,name:app.name,version:app.version,artifact:app.asarPath??app.unpackedDir,executable:app.executable,
  identityCoverage:app.asarPath?'whole-ASAR':'package-metadata-only',artifactSha256:sha256(app.asarPath?await bounded(app.asarPath,512*1024*1024):await readFile(await containedFile(await realpath(app.unpackedDir),'package.json'))),
  proposedSurface:surface,requiredCapabilities:capabilities,level:'static-runtime-layout-probe',acceptance:'not-run',limitations:['Runtime layout and package version only; bootstrap compatibility, mounting and host behavior are not verified.']};
}
export async function prepareFeatureSession(recipePath,{donorRoot,out,casePath,recipients=[]}={}){
 const recipeFile=await realpath(resolve(recipePath)),bytes=await bounded(recipeFile,2*1024*1024),recipe=validateFeatureRecipe(JSON.parse(bytes)),donor=await realpath(resolve(donorRoot));
 const buildPath=await containedFile(donor,'MODKIT-DONOR-BUILD.json'),buildBytes=await bounded(buildPath,2*1024*1024),build=JSON.parse(buildBytes);
 if(build.schema!==1||build.kind!=='original-donor-build'||build.revision!==recipe.donor.revision||!Array.isArray(build.outputs)||!build.outputs.length||build.outputs.length>10000)throw Error('matching original donor build required');
 const sourceFiles=[];for(const name of recipe.donor.sourceFiles){const b=await bounded(await containedFile(donor,name),4*1024*1024);const original=build.sources?.find(f=>f.path===name);if(!original||sha256(b)!==original.sha256)throw Error('donor source differs from pinned build: '+name);sourceFiles.push({path:name,sha256:sha256(b),bytes:b.length});}
 const outputNames=new Set();let total=0;for(const f of build.outputs){safeRelative(f.path);if(outputNames.has(f.path)||!hash.safeParse(f.sha256).success)throw Error('invalid/duplicate donor output');outputNames.add(f.path);const file=await containedFile(donor,f.path),s=await stat(file);total+=s.size;if(total>512*1024*1024)throw Error('donor build outputs exceed limit');if(sha256(await readFile(file))!==f.sha256)throw Error('donor build changed: '+f.path);}
 const {root:caseRoot,record}=await readCase(casePath);
 if(await realpath(record.donor.path)!==await realpath(build.sourceRoot))throw Error('REA case does not analyze the pinned clean donor source');
 for(const f of sourceFiles){if(record.donor.files?.find(x=>x.path===f.path)?.sha256!==f.sha256)throw Error('selected feature source missing/different in retained REA analysis: '+f.path);}
 const probes=[];for(const recipient of recipients)probes.push(await probeFeatureRecipient(recipient.path,recipient));
 const directory=await newDestination(out,[donor,caseRoot,dirname(recipeFile),...probes.map(p=>p.root)]);await mkdir(dirname(directory),{recursive:true});await mkdir(directory,{mode:0o700});
 const binding={schema:1,id:randomUUID(),kind:'feature-session',featureId:recipe.id,createdAt:new Date().toISOString(),status:'prepared',donorRoot:donor,recipeSha256:sha256(bytes),buildSha256:sha256(buildBytes),casePath:caseRoot,parentCaseSha256:sha256(await readFile(await containedFile(caseRoot,'case.json'))),parentEvidenceHashes:record.evidenceHashes,sourceFiles,recipients:probes,scope:recipe.scope,
  evidenceLevel:'prepared-baseline; no application actions performed',limitations:['Dependency dispositions are authored hypotheses, not proof of a complete closure.','Static references and runtime script inventory do not establish event causality.']};
 await writeFile(join(directory,'recipe.json'),bytes,{flag:'wx',mode:0o600});await saveJson(join(directory,'DEPENDENCIES.json'),{schema:1,kind:'feature-boundary-plan',caseId:record.id,sourceFiles,items:recipe.dependencies,authority:'authored-plan-with-source-and-REA-bindings',complete:false});binding.dependencySha256=sha256(await readFile(join(directory,'DEPENDENCIES.json')));await saveJson(join(directory,'SESSION.json'),binding);
 return {directory,record:binding,recipe};
}
export async function inspectFeatureSession(path){
 const root=await realpath(resolve(path)),record=await readJson(await containedFile(root,'SESSION.json'));
 if(record.schema!==1||record.kind!=='feature-session')throw Error('unsupported feature session');
 const bytes=await bounded(await containedFile(root,'recipe.json'),2*1024*1024);if(sha256(bytes)!==record.recipeSha256)throw Error('session recipe changed');const recipe=validateFeatureRecipe(JSON.parse(bytes));
 if(sha256(await readFile(await containedFile(record.donorRoot,'MODKIT-DONOR-BUILD.json')))!==record.buildSha256)throw Error('donor build record changed');
 const {record:c}=await readCase(record.casePath);if(sha256(await readFile(join(record.casePath,'case.json')))!==record.parentCaseSha256||JSON.stringify(c.evidenceHashes)!==JSON.stringify(record.parentEvidenceHashes))throw Error('parent case changed');
 if(record.dependencySha256&&sha256(await readFile(await containedFile(root,'DEPENDENCIES.json')))!==record.dependencySha256)throw Error('dependency plan changed');
 if(record.observationsSha256){const bytes=await bounded(await containedFile(root,'OBSERVATIONS.json'),8*1024*1024);if(sha256(bytes)!==record.observationsSha256)throw Error('observations changed');}
 return {root,record,recipe};
}
function substitute(text,variables){return text.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,(_,key)=>{if(!Object.hasOwn(variables,key)||typeof variables[key]!=='string'||variables[key].length>4000)throw Error('missing/bad session variable: '+key);return variables[key];});}
export async function replayFeatureSession(path,{page,publish,readClipboard,variables={},signal}={}){
 const {root,record,recipe}=await inspectFeatureSession(path);if(record.status!=='prepared')throw Error('session already run; prepare a fresh session');
 // Reserve the execution before any action. A crash leaves a visible running/interrupted session.
 const lock=join(root,'RUN.lock');await writeFile(lock,'declared-actions\n',{flag:'wx',mode:0o600});
 const observations=[];let failed=false;
 record.status='running';await writeState(join(root,'SESSION.json'),record);
 try{
  for(const scenario of recipe.scenarios){if(failed)break;for(const [index,step]of scenario.steps.entries()){
   const start=performance.now(),event={schema:1,scenarioId:scenario.id,index,action:step.action,actor:'modkit-declared-action',passed:false};
   try{
    signal?.throwIfAborted();const locator=step.selector?page.locator(step.selector):null;
    if(step.action==='click')await locator.click({timeout:recipe.stepTimeoutMs});
    if(step.action==='fill')await locator.fill(substitute(step.value,variables),{timeout:recipe.stepTimeoutMs});
    if(step.action==='press')await locator.press(step.key,{timeout:recipe.stepTimeoutMs});
    if(step.action==='resize')await page.setViewportSize({width:step.width,height:step.height});
    if(step.action==='publish'){if(!publish)throw Error('no owned publisher registered');await publish(step.topic,step.payload);event.payloadSha256=sha256(step.payload);}
    if(step.action==='assert'){
     const deadline=Date.now()+recipe.stepTimeoutMs;let observed,passed;
     do{signal?.throwIfAborted();observed=step.property==='background-color'?await locator.evaluate(node=>getComputedStyle(node).backgroundColor):step.property==='selection'?await page.evaluate(()=>window.getSelection()?.toString()??''):step.property==='clipboard'?await readClipboard():step.property==='count'?await locator.count():step.property==='visible'?await locator.isVisible():step.property==='value'?await locator.inputValue({timeout:recipe.stepTimeoutMs}):step.property.startsWith('aria-')?await locator.getAttribute(step.property,{timeout:recipe.stepTimeoutMs}):await locator.innerText({timeout:recipe.stepTimeoutMs});passed=step.match==='contains'?String(observed).includes(step.expected):observed===step.expected;if(passed||Date.now()>=deadline)break;await new Promise(r=>setTimeout(r,40));}while(true);
     event.expected=step.expected;event.observed=typeof observed==='string'?{preview:observed.slice(0,8000),characters:observed.length,sha256:sha256(observed),omitted:Math.max(0,observed.length-8000)}:observed;
     if(!passed)throw Error('declared observable assertion did not match');
    }
    if(step.action==='snapshot'){const b=await page.screenshot({timeout:recipe.stepTimeoutMs});const info=validatePNG(b),name=scenario.id+'-'+step.name+'.png';await writeFile(join(root,name),b,{flag:'wx',mode:0o600});event.screenshot={path:name,...info};}
    event.passed=true;
   }catch(e){event.error=String(e.message).slice(0,4000);failed=true;
    try{event.failureContext=(await page.locator('body').innerText({timeout:1000})).slice(0,12000);const b=await page.screenshot({timeout:2000}),info=validatePNG(b),name='failed-'+scenario.id+'-'+index+'.png';await writeFile(join(root,name),b,{flag:'wx',mode:0o600});event.screenshot={path:name,...info};}catch{event.diagnostic='Failure screenshot/context unavailable';}}

   event.durationMs=Math.round((performance.now()-start)*100)/100;observations.push(event);await saveJson(join(root,'action-'+String(observations.length).padStart(3,'0')+'.json'),event);if(failed)break;
  }}
 }finally{
  record.status=signal?.aborted?'cancelled':failed?'failed':'captured';record.finishedAt=new Date().toISOString();record.actions=observations.length;record.assertions=observations.filter(x=>x.action==='assert').length;record.passed=!failed&&!signal?.aborted;
  record.evidenceLevel='declared actions against original donor application; not recipient equivalence';await saveJson(join(root,'OBSERVATIONS.json'),{schema:1,sessionId:record.id,recipeSha256:record.recipeSha256,passed:record.passed,actions:observations,scope:record.evidenceLevel});record.observationsSha256=sha256(await readFile(join(root,'OBSERVATIONS.json')));await writeState(join(root,'SESSION.json'),record);
 }
 return {directory:root,...record};
}
