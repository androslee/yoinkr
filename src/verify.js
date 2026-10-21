import {selectReplayExamples,retainReplayRun,prepareReplayStore} from './replay.js';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdir,readFile,stat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {inside,readJson,saveJson,sha256,containedFile,validateRecipe,writeState} from './workspace.js';
export async function runOracle(job,{timeoutMs=5000,maxOutput=1024*1024}={}){
 return new Promise(resolveJob=>{
  let bytes=0,log='',result=null,failure=null,killTimer;
  const child=fork(fileURLToPath(new URL('./oracle-worker.mjs',import.meta.url)),[],{cwd:job.cwd,execArgv:['--max-old-space-size=128'],stdio:['ignore','pipe','pipe','ipc']});
  const stop=message=>{failure??=message;child.kill('SIGTERM');killTimer??=setTimeout(()=>child.kill('SIGKILL'),300);};
  const timer=setTimeout(()=>stop('verification timed out'),timeoutMs);
  const data=chunk=>{bytes+=chunk.length;log=(log+chunk.toString()).slice(-8192);if(bytes>maxOutput)stop('verification output exceeded limit');};child.stdout.on('data',data);child.stderr.on('data',data);
  child.on('message',message=>{if(result){stop('multiple result messages');return;}if(Buffer.byteLength(JSON.stringify(message))>maxOutput){stop('verification result exceeded limit');return;}result=message;});
  child.on('error',err=>{failure=err.message;});
  child.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);resolveJob({result:failure?null:result,failure:failure??(code!==0&&result?.kind!=='fatal'?`worker exited ${signal??code}`:null),log});});
  child.send(job,err=>{if(err)stop(err.message);});
 });
}
export async function verifyWorkspace(workspacePath,{timeoutMs=5000,exampleIds}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>30000)throw Error('timeout must be 50–30000 ms');
 const root=await (await import('node:fs/promises')).realpath(resolve(workspacePath));
 const metadata=await containedFile(root,'.modkit/workspace.json'),w=await readJson(metadata);
 if(w.schema!==1)throw Error('unsupported workspace');
 const recipeFile=await containedFile(root,'.modkit/recipe.json');if(sha256(await readFile(recipeFile))!==w.recipeSha256)throw Error('workspace recipe changed');
 const recipe=validateRecipe(await readJson(recipeFile));
 for(const f of w.featureFiles){const file=await containedFile(root,'.modkit/oracle/'+f.path);if(sha256(await readFile(file))!==f.sha256)throw Error('donor oracle snapshot changed');}
 const modulePackage=await readJson(await containedFile(root,'.modkit/oracle/package.json'));if((modulePackage.type??'commonjs')!==recipe.moduleType)throw Error('donor module context changed');
 const selection=exampleIds===undefined?null:await selectReplayExamples(w,exampleIds),acceptanceCases=selection?.cases??recipe.cases;
 if(selection)await prepareReplayStore(selection);
 const runsRoot=join(root,'.modkit/runs');await mkdir(runsRoot,{recursive:true,mode:0o700});if(!inside(root,await realpath(runsRoot)))throw Error('verification runs directory escaped workspace');
 const oracle=await containedFile(root,'.modkit/oracle/'+recipe.oracle.module),recipient=await containedFile(root,'app/'+recipe.recipient.module);
 const jobs=[{cwd:join(root,'.modkit/oracle'),module:oracle,export:recipe.oracle.export,cases:acceptanceCases},{cwd:join(root,'app'),module:recipient,export:recipe.recipient.export,cases:acceptanceCases}];
 const outputs=[];for(const job of jobs)outputs.push(await runOracle(job,{timeoutMs}));
 const cases=acceptanceCases.map((c,i)=>{
  const a=outputs[0].result?.kind==='results'?outputs[0].result.results[i]:null,b=outputs[1].result?.kind==='results'?outputs[1].result.results[i]:null;
  let passed=!!a&&!!b&&isDeepStrictEqual(a,b)&&a.kind!=='unsupported';
  if(c.expectedError)passed=passed&&a.kind==='throw'&&a.name===c.expectedError.name&&a.message===c.expectedError.message;
  else {passed=passed&&a?.kind==='value';if(Object.hasOwn(c,'expected'))passed=passed&&isDeepStrictEqual(a?.output,{type:'json',value:c.expected});}
  return{name:c.name??'Case '+(i+1),args:c.args,passed,donor:a,recipient:b,...(Object.hasOwn(c,'expected')?{expected:c.expected}:{}),...(c.expectedError?{expectedError:c.expectedError}:{})};
 });
 const passed=outputs.every(o=>!o.failure&&o.result?.kind==='results')&&cases.every(c=>c.passed),id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
 const inputs={};for(const f of [...w.baselineFiles.map(f=>'app/'+f.path),...w.featureFiles.map(f=>'app/'+w.mount+'/'+f.path)]){try{inputs[f]=sha256(await readFile(await containedFile(root,f)));}catch{inputs[f]=null;}}
 const report={schema:1,id,selection:selection?'examples':'recipe',workspacePath:root,recipeSha256:w.recipeSha256,...(selection?{exampleBindings:selection.bindings}:{}),workspaceId:w.id,caseId:w.caseId,at:new Date().toISOString(),passed,evidenceLevel:'recovered-donor-snapshot versus recipient working-copy module',
  cases,workers:outputs,inputHashes:inputs,limits:'JSON-callable Node modules only. This does not verify UI behavior, network behavior or arbitrary side effects. Execution uses normal user permissions, not a hostile-code sandbox.'};
 if(!inside(root,await realpath(runsRoot)))throw Error('verification runs directory escaped workspace');
 const runDir=join(runsRoot,id);await mkdir(runDir,{recursive:true,mode:0o700});await saveJson(join(runDir,'verification.json'),report);
 if(selection)await retainReplayRun(selection,report);
 await writeState(metadata,{...w,status:passed?'verified':'verification-failed',acceptance:{status:passed?(selection?'passed-selected-examples':'passed-within-recipe'):'failed',selection:selection?'examples':'recipe',passed:cases.filter(c=>c.passed).length,total:cases.length},latestRun:id});
 return{directory:runDir,...report};
}
export async function workspaceStatus(path){const root=resolve(path),w=await readJson(await containedFile(root,'.modkit/workspace.json'));return w;}
