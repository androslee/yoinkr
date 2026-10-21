import {request} from 'node:http';import test from 'node:test';import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tempDir} from './helpers.js';import {sha256} from '../src/workspace.js';import {startWorkbench} from '../src/workbench.js';
async function fixture(){const root=tempDir();await mkdir(join(root,'evidence'));const hashes={};for(const side of ['donor','recipient','trace']){const text=JSON.stringify({ok:true,data:{evidence_id:side,normalized_result:{graph:{nodes:[]}}}});hashes[side+'.json']=sha256(text);await writeFile(join(root,'evidence',side+'.json'),text);}await writeFile(join(root,'case.json'),JSON.stringify({schema:1,id:'case',feature:'<script>window.bad=1</script>',donor:{evidenceId:'donor'},recipient:{evidenceId:'recipient'},trace:{evidenceId:'trace'},evidenceHashes:hashes}));return root;}
async function setup(operations){const root=await fixture(),app=await startWorkbench({cases:[root],port:0,reportRoot:tempDir(),operations});const response=await fetch(app.url),cookie=response.headers.get('set-cookie').split(';')[0];return {app,root,cookie,headers:{'X-Yoinkr-Token':app.boot.token,'Content-Type':'application/json'}};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('workbench registers explicit cases, binds loopback, escapes boot data and closes cleanly',async()=>{const {app}=await setup();try{assert.equal(app.server.address().address,'127.0.0.1');const html=await (await fetch(app.url)).text();assert.ok(html.includes('\\u003cscript\\u003e'));assert.ok(!html.includes('<script>window.bad=1'));assert.equal((await fetch(app.url+'/app.js')).status,200);assert.equal((await fetch(app.url+'/api/state')).status,403);}finally{await app.close();}});
test('API rejects foreign Origin/Host, missing token, arbitrary case/output and oversized requests',async()=>{const {app,headers}=await setup();try{assert.equal((await fetch(app.url+'/api/state',{headers:{...headers,Origin:'https://evil.invalid'}})).status,403);const hostileHost=await new Promise((resolve,reject)=>{const req=request(app.url+'/api/state',{headers:{...headers,Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(hostileHost,403);const run=body=>fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await run({caseId:'unknown',action:'query'})).status,400);assert.equal((await run({caseId:app.boot.cases[0].id,action:'query',options:{out:'/tmp/arbitrary'}})).status,400);assert.equal((await run({caseId:app.boot.cases[0].id,action:'report',options:{exportId:'unknown'}})).status,400);assert.equal((await run({padding:'x'.repeat(33000)})).status,413);assert.equal((await fetch(app.url+'/api/run',{method:'POST',headers:{'X-Yoinkr-Token':app.boot.token},body:'{}'})).status,415);}finally{await app.close();}});
test('one active job is allowed, results are retained, and backend errors become failed jobs',async()=>{let release;const gate=new Promise(r=>release=r),operations={query:async()=>{await gate;return {directory:'/retained',result:'done'};},trace:async()=>{throw Error('REA failure');}};const {app,headers}=await setup(operations);try{const run=action=>fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify({caseId:app.boot.cases[0].id,action})});assert.equal((await run('query')).status,202);assert.equal((await run('trace')).status,409);release();let state;for(let i=0;i<100;i++){state=await (await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}assert.equal(state.jobs[0].status,'complete');assert.equal(state.jobs[0].directory,'/retained');assert.equal((await run('trace')).status,202);for(let i=0;i<100;i++){state=await (await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}assert.equal(state.jobs[1].status,'failed');assert.match(state.jobs[1].error,/REA failure/);}finally{release();await app.close();}});
test('reports require session cookie, use generated paths and cannot serve arbitrary files',async()=>{const operations={report:async(root,out)=>{await writeFile(out,'<!doctype html><p>private report</p>');return {path:out};}};const {app,headers,cookie}=await setup(operations);try{await fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify({caseId:app.boot.cases[0].id,action:'report'})});let state;for(let i=0;i<100;i++){state=await (await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}const url=state.jobs[0].reportUrl;assert.ok(url.startsWith('/reports/'));assert.equal((await fetch(app.url+url)).status,403);assert.match(await (await fetch(app.url+url,{headers:{Cookie:cookie}})).text(),/private report/);assert.equal((await fetch(app.url+'/reports/unknown',{headers:{Cookie:cookie}})).status,404);assert.equal((await fetch(app.url+'/etc/passwd',{headers})).status,404);}finally{await app.close();}});

test('report output root cannot create files inside original donor trees',async()=>{const root=await fixture(),donor=tempDir(),record=JSON.parse(await readFile(join(root,'case.json'),'utf8'));record.donor.path=donor;await writeFile(join(root,'case.json'),JSON.stringify(record));await assert.rejects(startWorkbench({cases:[root],port:0,reportRoot:donor}),/outside/);});

async function creationSetup(operations={}){
 const donor=tempDir(),recipient=tempDir();await writeFile(join(donor,'feature.js'),'export const answer=42;');
 const app=await startWorkbench({cases:[],applications:[donor,recipient],port:0,reportRoot:tempDir(),caseRoot:tempDir(),operations});
 const headers={'X-Yoinkr-Token':app.boot.token,'Content-Type':'application/json'};
 const options={donorId:app.boot.applications[0].id,recipientId:app.boot.applications[1].id,feature:'Recover answer',seed:'feature.js',seedKind:'module',route:'direct'};
 const run=(action,opts=options,caseId)=>fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify({caseId,action,options:opts})});
 const wait=async()=>{for(let i=0;i<200;i++){const state=await(await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)return state;await sleep(5);}throw Error('job did not finish');};
 return {app,donor,recipient,headers,options,run,wait};
}
test('investigation wizard restricts apps, options, source selections and output destinations before analysis',async()=>{
 let calls=0;const {app,options,run}=await creationSetup({investigate:async()=>{calls++;}});
 try{
  for(const patch of [{donorId:'/etc'},{recipientId:options.donorId},{out:'/tmp/arbitrary'},{feature:''},{route:'magic'},{seedKind:'shell'},{donorSources:['../secret']},{recipientSources:['/absolute']},{donorSources:Array(257).fill('x')}])assert.equal((await run('investigate',{...options,...patch})).status,400);
  assert.equal(calls,0);assert.equal(app.boot.cases.length,0);
 }finally{await app.close();}
});
test('new investigation registers dynamically and explicit exports become report choices without restart',async()=>{
 const {cp}=await import('node:fs/promises');let captured;
 const context=await creationSetup({investigate:async options=>{
  captured=options;await cp(await fixture(),options.out,{recursive:true});
  const file=join(options.out,'case.json'),record=JSON.parse(await readFile(file,'utf8'));
  record.feature=options.feature;record.donor.path=options.donor;record.recipient.path=options.recipient;record.donor.files=[{path:'feature.js',sha256:sha256('export const answer=42;')}];record.trace.files=['feature.js'];record.route={selected:options.route};await writeFile(file,JSON.stringify(record));
 }});
 const {app,run,wait,options,donor}=context;
 try{
  assert.equal((await run('investigate',{...options,donorSources:['feature.js']})).status,202);
  let state=await wait();assert.equal(state.jobs[0].status,'complete');assert.equal(state.cases.length,1);assert.ok(captured.out.startsWith(app.caseRoot+'/case-'));assert.equal(captured.donor,donor);assert.deepEqual(captured.donorSources,['feature.js']);
  const selected=state.cases[0];assert.deepEqual(selected.tracedFiles,['feature.js']);const original=await readFile(join(selected.path,'case.json'),'utf8');
  assert.equal((await run('export',{files:[]},selected.id)).status,400);assert.equal((await run('export',{files:['../secret']},selected.id)).status,400);
  assert.equal((await run('export',{files:['feature.js']},selected.id)).status,202);
  state=await wait();assert.equal(state.jobs[1].status,'complete');assert.equal(state.cases[0].exports.length,1);assert.equal(state.jobs[1].exportId,state.cases[0].exports[0].id);
  const manifest=JSON.parse(state.jobs[1].detail);assert.equal(manifest.files[0].analysisBound,true);assert.equal(await readFile(join(manifest.directory,'files/feature.js'),'utf8'),'export const answer=42;');
  assert.equal(await readFile(join(selected.path,'case.json'),'utf8'),original);
  assert.match(await (await fetch(app.url)).text(),/Recover answer/);
  await writeFile(join(donor,'feature.js'),'changed');assert.equal((await run('export',{files:['feature.js']},selected.id)).status,202);state=await wait();assert.equal(state.jobs[2].status,'failed');assert.match(state.jobs[2].error,/changed/);
 }finally{await app.close();}
});
test('a replaced application path or redirected creation root fails safely and releases the job slot',async()=>{
 const {rename,symlink}=await import('node:fs/promises');let called=false;
 const {app,run,wait,donor}=await creationSetup({investigate:async()=>{called=true;}});
 try{
  await rename(donor,donor+'-original');await symlink(tempDir(),donor);
  await run('investigate');let state=await wait();assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].error,/path changed/);assert.equal(called,false);
 }finally{await app.close();}
 const next=await creationSetup({investigate:async()=>{called=true;}});
 try{
  await rename(next.app.caseRoot,next.app.caseRoot+'-original');await symlink(tempDir(),next.app.caseRoot);
  await next.run('investigate');const state=await next.wait();assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].error,/output root changed/);assert.equal(called,false);
 }finally{await next.app.close();}
});
test('creation output root cannot write inside an application and startup application paths must exist',async()=>{
 const donor=tempDir(),recipient=tempDir();await assert.rejects(startWorkbench({cases:[],applications:[donor,recipient],port:0,caseRoot:donor}),/outside/);
 await assert.rejects(startWorkbench({cases:[],applications:[donor,join(recipient,'missing')],port:0}),/ENOENT/);
});
test('failed investigations retain their diagnostic directory without registering a successful case',async()=>{
 const {app,run,wait}=await creationSetup({investigate:async({out})=>{await mkdir(out);await writeFile(join(out,'FAILED.txt'),'backend diagnostic');throw Error('REA analysis failed');}});
 try{await run('investigate');const state=await wait();assert.equal(state.busy,false);assert.equal(state.cases.length,0);assert.equal(state.jobs[0].status,'failed');assert.ok(state.jobs[0].directory.startsWith(app.caseRoot+'/case-'));assert.equal(await readFile(join(state.jobs[0].directory,'FAILED.txt'),'utf8'),'backend diagnostic');}finally{await app.close();}
});
test('observable examples use authenticated bounded requests and do not change case metadata',async()=>{
 const {app,root,headers}=await setup();
 const options={title:'JSON view',steps:['Select JSON message'],expected:'Indented object',observation:'Raw payload instead',outcome:'observed-difference',side:'recipient'};
 const post=(path,input,extra={})=>fetch(app.url+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)});
 try{
  const input={caseId:app.boot.cases[0].id,action:'example',options},before=await readFile(join(root,'case.json'),'utf8');
  assert.equal((await post('/api/example',input,{'X-Yoinkr-Token':''})).status,403);
  assert.equal((await post('/api/example',{...input,action:'query'})).status,400);
  assert.equal((await post('/api/example',{...input,options:{...options,out:'/tmp/arbitrary'}})).status,400);
  assert.equal((await post('/api/run',{...input,options:{...options,screenshotBase64:'x'.repeat(33000)}})).status,413);
  assert.equal((await post('/api/example',{...input,options:{...options,screenshotBase64:'x'.repeat(6*1024*1024)}})).status,413);
  const png=await readFile(new URL('./fixtures/screenshot.png',import.meta.url));
  assert.equal((await post('/api/example',{...input,options:{...options,screenshotBase64:png.toString('base64')}})).status,202);
  let state;for(let i=0;i<100;i++){state=await(await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}
  assert.equal(state.jobs[0].status,'complete');assert.match(state.jobs[0].detail,/user-recorded-example/);assert.equal(await readFile(join(root,'case.json'),'utf8'),before);
 }finally{await app.close();}
});
test('browser verification requires an explicitly registered workspace belonging to the selected case',async()=>{
 const {replayFixture}=await import('./replay-fixture.js');const f=await replayFixture(),e=await f.make({args:[1],expected:'1%'});let calls=0;
 const app=await startWorkbench({cases:[],workspaces:[f.workspace],port:0,reportRoot:tempDir(),caseRoot:tempDir(),operations:{verify:async(_path,options)=>{calls++;assert.deepEqual(options.exampleIds,[e.id]);return {passed:false,cases:[],directory:'/retained'};}}});
 const headers={'X-Yoinkr-Token':app.boot.token,'Content-Type':'application/json'},base={caseId:app.boot.cases[0].id,action:'verify',options:{workspaceId:app.boot.workspaces[0].id,exampleIds:[e.id]}};
 try{
  assert.equal(calls,0);assert.equal((await fetch(app.url+'/api/examples?caseId='+base.caseId)).status,403);const records=await(await fetch(app.url+'/api/examples?caseId='+base.caseId,{headers})).json();assert.equal(records.items[0].replay,true);
  const run=input=>fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify(input)});
  for(const options of [{...base.options,workspaceId:'not-registered'},{...base.options,workspacePath:'/tmp/any'},{...base.options,exec:'sh'},{...base.options,exampleIds:[]},{...base.options,exampleIds:['../outside']}])assert.equal((await run({...base,options})).status,400);
  assert.equal(calls,0);assert.equal((await run(base)).status,202);let state;for(let i=0;i<100;i++){state=await(await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}assert.equal(calls,1);assert.equal(state.jobs[0].status,'complete');assert.equal(state.jobs[0].outcome,'differences');
 }finally{await app.close();}
});
test('UI checks only run explicitly registered immutable recipes belonging to the selected case',async()=>{
 const {uiFixture}=await import('./ui-fixture.js'),f=await uiFixture();let calls=0;const app=await startWorkbench({cases:[],uiRecipes:[f.recipePath],port:0,reportRoot:tempDir(),caseRoot:tempDir(),operations:{ui:async registration=>{calls++;assert.equal(registration.path,f.recipePath);return {passed:false,directory:'/retained'};}}});const headers={'X-Yoinkr-Token':app.boot.token,'Content-Type':'application/json'},input={caseId:app.boot.cases[0].id,action:'ui',options:{recipeId:app.boot.uiRecipes[0].id}};
 try{assert.equal(calls,0);const run=v=>fetch(app.url+'/api/run',{method:'POST',headers,body:JSON.stringify(v)});assert.equal((await run({...input,options:{recipeId:'/tmp/arbitrary'}})).status,400);assert.equal((await run({...input,options:{...input.options,exec:'sh'}})).status,400);assert.equal(calls,0);assert.equal((await run(input)).status,202);let state;for(let i=0;i<100;i++){state=await(await fetch(app.url+'/api/state',{headers})).json();if(!state.busy)break;await sleep(5);}assert.equal(calls,1);assert.equal(state.jobs[0].outcome,'differences');}finally{await app.close();}
});
