import {readFile,mkdir,readdir,realpath,stat} from 'node:fs/promises';import {join} from 'node:path';
import {readCase} from './investigation.js';import {readExamples} from './examples.js';import {inside,containedFile,saveJson,readJson,sha256} from './workspace.js';
export async function selectReplayExamples(workspace,exampleIds){
 if(!Array.isArray(exampleIds)||!exampleIds.length||exampleIds.length>16||new Set(exampleIds).size!==exampleIds.length)throw Error('select 1 to 16 distinct replay examples');
 const {record,root}=await readCase(workspace.casePath);if(record.id!==workspace.caseId)throw Error('workspace belongs to a different case');
 const result=await readExamples(root,{ids:exampleIds,limit:16,includeImages:false}),indexed=new Map(result.items.map(e=>[e.id,e]));
 const selected=exampleIds.map(id=>{const e=indexed.get(id);if(!e)throw Error('selected example is missing or invalid: '+id);if(!e.replay)throw Error('selected example has no explicit replay data: '+e.title);return e;});
 return {casePath:root,cases:selected.map(e=>({name:e.title,...e.replay})),bindings:selected.map(e=>({id:e.id,title:e.title,exampleSha256:e.provenance.exampleSha256,parentCaseSha256:e.provenance.parentCaseSha256,parentEvidenceHashes:e.provenance.parentEvidenceHashes})),parentCaseSha256:sha256(await readFile(await containedFile(root,'case.json')))};
}
export async function prepareReplayStore(selection){const root=selection.casePath,parent=join(root,'checks');await mkdir(parent,{recursive:true,mode:0o700});if(!inside(root,await realpath(parent)))throw Error('checks directory escaped case');return parent;}
export async function retainReplayRun(selection,report){
 const parent=await prepareReplayStore(selection);
 const directory=join(parent,report.id);await mkdir(directory,{mode:0o700});
 await saveJson(join(directory,'verification.json'),report);await saveJson(join(directory,'record.json'),{schema:1,id:report.id,caseId:report.caseId,parentCaseSha256:selection.parentCaseSha256,reportSha256:sha256(await readFile(join(directory,'verification.json'))),workspaceId:report.workspaceId});
 return directory;
}
const preview=value=>{const text=JSON.stringify(value,null,2);return text===undefined?'Not declared':text.length>8000?text.slice(0,8000)+'\n[Display truncated; complete result remains in verification.json.]':text;};
export async function readReplayRuns(casePath,{limit=8}={}){
 if(!Number.isInteger(limit)||limit<0||limit>32)throw Error('run limit must be 0 to 32');
 const {root,record}=await readCase(casePath),parent=join(root,'checks'),items=[],warnings=[];let entries;
 try{if(!inside(root,await realpath(parent)))throw Error('checks directory escaped case');entries=await readdir(parent,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return {items,warnings,total:0,omitted:0};throw e;}
 const dirs=entries.filter(e=>e.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name));const caseHash=sha256(await readFile(await containedFile(root,'case.json')));
 for(const e of entries.filter(e=>e.isSymbolicLink()))warnings.push({id:e.name,error:'symlink run ignored'});
 for(const e of dirs.slice(0,limit))try{
  const dir=await realpath(join(parent,e.name));if(!inside(parent,dir))throw Error('run escaped case');
  const binding=await readJson(await containedFile(dir,'record.json')),file=await containedFile(dir,'verification.json');if((await stat(file)).size>8*1024*1024)throw Error('verification report exceeds 8 MiB');
  const bytes=await readFile(file),run=JSON.parse(bytes);
  if(binding.schema!==1||run.schema!==1||run.id!==e.name||binding.id!==e.name||run.caseId!==record.id||binding.caseId!==record.id||run.workspaceId!==binding.workspaceId||sha256(bytes)!==binding.reportSha256||caseHash!==binding.parentCaseSha256||run.selection!=='examples'||typeof run.passed!=='boolean'||!Array.isArray(run.cases)||!run.cases.length||run.cases.length>16)throw Error('verification identity, hash or case binding changed');
  items.push({id:run.id,at:run.at,passed:run.passed,workspaceId:run.workspaceId,workspacePath:run.workspacePath,evidenceLevel:run.evidenceLevel,recipeSha256:run.recipeSha256,bindings:run.exampleBindings,cases:run.cases.map(c=>({name:c.name,passed:c.passed,args:preview(c.args),expected:preview(c.expectedError?{expectedError:c.expectedError}:c.expected),donor:preview(c.donor),recipient:preview(c.recipient)})),workers:run.workers.map(w=>({failure:w.failure,fatal:w.result?.kind==='fatal'?w.result:null,log:w.log?.slice(0,2000)})),provenance:binding});
 }catch(err){warnings.push({id:e.name,error:err.message});}
 items.sort((a,b)=>b.at.localeCompare(a.at));return {items,warnings,total:dirs.length,omitted:Math.max(0,dirs.length-limit)};
}
