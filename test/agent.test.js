import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {libraryFixture} from '../scripts/fixtures/library.mjs';
import {createAgent,loadAgentConfig,RESULT_PAGE} from '../src/agent.js';
import {writeMcpClientConfig} from '../src/agent-mcp.js';
async function fixture(extra={}){
 const f=await libraryFixture(),file=join(f.root,'agent.json');
 await writeFile(file,JSON.stringify({schema:1,outputRoot:'output',cases:[{id:'mqtt',path:'records/mqtt'}],knowledgeRoots:['records'],...extra}));
 return {...f,file,async clean(){await rm(f.root,{recursive:true,force:true});}};
}
async function result(a,job){for(let i=0;i<500;i++){const status=await a.call('yoinkr_job',{jobId:job.id});if(status.status!=='running'){assert.equal(status.status,'succeeded',status.error);let raw='',offset=0;do{const p=await a.call('yoinkr_result',{jobId:job.id,offset});raw+=p.text;offset=p.nextOffset;}while(offset!==null);return JSON.parse(raw);}await new Promise(r=>setTimeout(r,10));}throw Error('job timed out');}

test('read-only server exposes bounded prior-work and case tools, without write/execute tools',async()=>{
 const f=await fixture();let a;try{a=await createAgent(f.file);const c=await a.call('yoinkr_catalog');assert.equal(c.capabilities.writes,false);assert.equal(c.registrations.cases[0].id,'mqtt');assert.equal(a.tools.has('yoinkr_export'),false);assert.equal(a.tools.has('yoinkr_verify'),false);assert.equal((await a.call('yoinkr_case',{caseId:'mqtt'})).id,'mqtt');const found=await a.call('yoinkr_search',{query:'MQTT'});assert.ok(found.items.length);const doc=await a.call('yoinkr_document',{documentId:found.items[0].id});assert.ok(doc);await assert.rejects(a.call('yoinkr_case',{caseId:'../other'}));await assert.rejects(a.call('yoinkr_case',{caseId:'mqtt',path:'/etc/passwd'}));await assert.rejects(a.call('yoinkr_export',{caseId:'mqtt',traced:true}),/disabled/);}finally{await a?.close();await f.clean();}
});
test('config rejects unknown keys, duplicate ids, implicit execution, invalid exports and unsafe output roots',async()=>{
 for(const extra of [{shell:'sh'},{allowExecution:true},{cases:[{id:'a',path:'records/mqtt'},{id:'a',path:'records/chart'}]},{exports:[{id:'x',caseId:'absent',path:'records/chart'}]},{outputRoot:'records/mqtt/output'}]){const f=await fixture(extra);try{await assert.rejects(loadAgentConfig(f.file));}finally{await f.clean();}}
 const f=await fixture();try{await symlink(f.records,join(f.root,'output'));await assert.rejects(loadAgentConfig(f.file),/ordinary directory/);}finally{await f.clean();}
});
test('client config is portable MCP, opt-in REA, exclusive output, and does not alter registration bytes',async()=>{
 const f=await fixture();try{const original=await readFile(f.file),out=join(f.root,'client.json');const r=await writeMcpClientConfig(f.file,out);assert.equal(r.installed,false);const c=JSON.parse(await readFile(out));assert.deepEqual(Object.keys(c.mcpServers),['yoinkr']);assert.ok(c.mcpServers.yoinkr.args.includes('mcp'));assert.ok(c.mcpServers.yoinkr.args.includes(f.file));await assert.rejects(writeMcpClientConfig(f.file,out),/EEXIST/);const both=join(f.root,'both.json');await writeMcpClientConfig(f.file,both,{includeRea:true});const servers=JSON.parse(await readFile(both));assert.equal(servers.mcpServers.rea.args.at(-1),'--mcp');assert.deepEqual(await readFile(f.file),original);}finally{await f.clean();}
});
test('long results are retained with page integrity and jobs reject overlapping work',async()=>{
 const f=await fixture({allowWrites:true});let a;try{a=await createAgent(f.file);a.tools.set('fixture',{run:async()=>({body:'large ☀️ text '.repeat(5000)})});const j=await a.call('fixture');assert.ok(j.id);const value=await result(a,j);assert.ok(value.body.length>RESULT_PAGE);const p=await a.call('yoinkr_result',{jobId:j.id});assert.ok(p.text.length<=RESULT_PAGE);await assert.rejects(a.call('yoinkr_result',{jobId:j.id,offset:999999}));await writeFile(join(j.directory,'RESULT.json'),'tampered');await assert.rejects(a.call('yoinkr_result',{jobId:j.id}),/changed/);
 // Exercise the same reservation used by every mutating tool with a real, fast export.
 const c=JSON.parse(await readFile(join(f.cases[0],'case.json')));c.donor.files=[];await writeFile(join(f.cases[0],'case.json'),JSON.stringify(c));await writeFile(join(f.donor,'format.js'),'export const x=1;');
 const jobs=await Promise.allSettled([a.call('yoinkr_export',{caseId:'mqtt',files:['format.js']}),a.call('yoinkr_export',{caseId:'mqtt',files:['format.js']})]);assert.equal(jobs.filter(x=>x.status==='fulfilled').length,1);await result(a,jobs.find(x=>x.status==='fulfilled').value);
 }finally{await a?.close();await f.clean();}
});
test('writes and execution are separate explicit server capabilities',async()=>{
 const f=await fixture({allowWrites:true});let a;try{a=await createAgent(f.file);assert.ok(a.tools.has('yoinkr_investigate'));assert.ok(a.tools.has('yoinkr_integrate'));assert.ok(!a.tools.has('yoinkr_verify'));assert.equal(a.tools.get('yoinkr_query').annotations.readOnlyHint,false);await assert.rejects(a.call('yoinkr_integrate',{caseId:'mqtt',exportId:'missing',recipeId:'x'}),/unknown registered/);await assert.rejects(a.call('yoinkr_query',{caseId:'missing'}),/unknown registered/);}finally{await a?.close();await f.clean();}
});
test('failed submitted operations retain an error record and release the slot for the next job',async()=>{
 const f=await fixture({allowWrites:true});let a;try{
  a=await createAgent(f.file);const record=JSON.parse(await readFile(join(f.cases[0],'case.json')));record.donor.files=[];await writeFile(join(f.cases[0],'case.json'),JSON.stringify(record));
  const failed=await a.call('yoinkr_export',{caseId:'mqtt',files:['missing.js']});let status;
  for(let i=0;i<100;i++){status=await a.call('yoinkr_job',{jobId:failed.id});if(status.status!=='running')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(status.status,'failed');assert.match(status.error,/ENOENT/);assert.equal(JSON.parse(await readFile(join(status.directory,'JOB.json'))).status,'failed');await assert.rejects(a.call('yoinkr_result',{jobId:failed.id}),/no successful result/);
  await writeFile(join(f.donor,'okay.js'),'export const value=7;');const next=await a.call('yoinkr_export',{caseId:'mqtt',files:['okay.js']});const recovered=await result(a,next);assert.equal(recovered.files[0].path,'okay.js');
 }finally{await a?.close();await f.clean();}
});
