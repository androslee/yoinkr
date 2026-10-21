import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink,unlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {exportDeliveryBundle,importDeliveryBundle,inspectDeliveryBundle,checkDelivery,loadDeliveryConfig,runDelivery} from '../src/delivery.js';
import {createAgent} from '../src/agent.js';
import {startWorkbench} from '../src/workbench.js';
const fixture=async()=>{const root=await mkdtemp(join(tmpdir(),'yoinkr-delivery-test-'));const bundle=join(root,'reference');await exportDeliveryBundle(bundle);const config=join(root,'delivery.json');await writeFile(config,JSON.stringify({schema:1,bundle:'reference',donor:'missing-donor',source:'missing-source',runtimes:{vscode:'missing-code',joplin:'missing-joplin'},outputRoot:'runs',xvfb:'missing-display',playwrightModule:'missing-playwright'}));return {root,bundle,config,clean:()=>rm(root,{recursive:true,force:true})};};
test('recipe export/import has a stable digest and no private paths or donor payloads',async()=>{
 const f=await fixture();try{const before=await inspectDeliveryBundle(f.bundle),imported=await importDeliveryBundle(f.bundle,join(f.root,'imported'));assert.equal(before.digest,imported.digest);assert.equal(before.files.length,8);for(const file of before.files){const s=await readFile(join(f.bundle,file.path),'utf8');assert.ok(!/\/home\/[^/]+\//.test(s));assert.ok(!s.includes('builds/vscode-raw'));}await assert.rejects(importDeliveryBundle(f.bundle,join(f.root,'imported')),/EEXIST/);await assert.rejects(importDeliveryBundle(f.bundle,join(f.bundle,'nested')),/outside/);}finally{await f.clean();}
});
test('bundle integrity rejects tampering, symlinks, extra files, duplicate/traversal manifest entries',async()=>{
 const f=await fixture();try{
 const sample=join(f.bundle,'samples.json'),original=await readFile(sample);await writeFile(sample,'changed');await assert.rejects(inspectDeliveryBundle(f.bundle),/changed/);await writeFile(sample,original);
 await unlink(sample);await symlink(join(f.bundle,'NOTICE.md'),sample);await assert.rejects(inspectDeliveryBundle(f.bundle),/Symlink/);await unlink(sample);await writeFile(sample,original);
 await writeFile(join(f.bundle,'credentials.txt'),'not shared');await assert.rejects(inspectDeliveryBundle(f.bundle),/Untracked/);await unlink(join(f.bundle,'credentials.txt'));
 const manifest=join(f.bundle,'BUNDLE.json'),raw=await readFile(manifest),m=JSON.parse(raw);m.files[0].path='../outside';await writeFile(manifest,JSON.stringify(m));await assert.rejects(inspectDeliveryBundle(f.bundle));await writeFile(manifest,raw);
 }finally{await f.clean();}
});
test('doctor reports missing prerequisites and run refuses before creating output',async()=>{
 const f=await fixture();try{const result=await checkDelivery(f.config);assert.equal(result.status,'blocked');assert.ok(result.checks.some(c=>c.name==='donor pins and recovery source'&&c.status==='blocked'));await assert.rejects(runDelivery(f.config),/Prerequisites blocked/);const loaded=await loadDeliveryConfig(f.config);assert.equal(loaded.config.donor,join(f.root,'missing-donor'));const raw=JSON.parse(await readFile(f.config));raw.command='execute arbitrary script';await writeFile(f.config,JSON.stringify(raw));await assert.rejects(loadDeliveryConfig(f.config));}finally{await f.clean();}
});
test('standalone delivery tools use registered IDs and preserve permission gates',async()=>{
 const f=await fixture();let agent;try{
 const config=join(f.root,'agent.json');await writeFile(config,JSON.stringify({schema:1,outputRoot:'agent-results',deliveryConfig:'delivery.json'}));agent=await createAgent(config);
 assert.ok(agent.tools.has('yoinkr_delivery_check'));assert.ok(!agent.tools.has('yoinkr_delivery_run'));assert.ok(!agent.tools.has('yoinkr_delivery_export'));assert.equal((await agent.call('yoinkr_delivery_check',{})).status,'blocked');await assert.rejects(agent.call('yoinkr_delivery_inspect',{bundleId:'../../private'}));await assert.rejects(agent.call('yoinkr_delivery_check',{path:'/etc/passwd'}));await agent.close();agent=null;
 await writeFile(config,JSON.stringify({schema:1,outputRoot:'agent-results',deliveryConfig:'delivery.json',allowWrites:true}));agent=await createAgent(config);assert.ok(agent.tools.has('yoinkr_delivery_export'));assert.ok(!agent.tools.has('yoinkr_delivery_run'));
 const job=await agent.call('yoinkr_delivery_import',{bundleId:'reference'});let status;for(let i=0;i<200;i++){status=await agent.call('yoinkr_job',{jobId:job.id});if(status.status!=='running')break;await new Promise(r=>setTimeout(r,5));}assert.equal(status.status,'succeeded',status.error);
 const loaded=JSON.parse(await readFile(f.config));loaded.outputRoot='other';await writeFile(f.config,JSON.stringify(loaded));await assert.rejects(agent.call('yoinkr_delivery_check',{}),/changed/);
 }finally{await agent?.close();await f.clean();}
});
test('workbench can start with only delivery, authenticates routes and retains blocked diagnosis',async()=>{
 const f=await fixture();let app;try{
 app=await startWorkbench({cases:[],deliveryConfig:f.config,caseRoot:join(f.root,'cases'),reportRoot:join(f.root,'reports'),findingRoot:join(f.root,'findings'),port:0});assert.equal(app.boot.deliveryEnabled,true);
 const call=async(body,token=app.boot.token)=>fetch(app.url+'/api/delivery',{method:'POST',headers:{'Content-Type':'application/json','X-Yoinkr-Token':token,Origin:app.url},body:JSON.stringify(body)});
 assert.equal((await call({action:'check'},'wrong')).status,403);assert.equal((await call({action:'check',path:'/etc/passwd'})).status,400);
 const accepted=await call({action:'check'});assert.equal(accepted.status,202);const {id}=await accepted.json();let state;
 for(let i=0;i<200;i++){state=await(await fetch(app.url+'/api/state',{headers:{'X-Yoinkr-Token':app.boot.token}})).json();if(!state.busy)break;await new Promise(r=>setTimeout(r,5));}
 const job=state.jobs.find(j=>j.id===id);assert.equal(job.status,'failed');assert.match(job.detail,/missing-donor/);
 }finally{await app?.close();await f.clean();}
});
test('minimal preview server is released if browser startup fails',async()=>{
 const {minimalFeatureDriver}=await import('../src/feature-drivers/minimal.js');
 const {canonical}=await import('../src/feature-package.js');const {sha256}=await import('../src/workspace.js');
 const root=await mkdtemp(join(tmpdir(),'yoinkr-delivery-startup-'));
 try{
  const recipe=JSON.parse(await readFile(new URL('../recipes/mqtt-raw-diff/recipe.json',import.meta.url))),files=[];
  for(const path of ['payload/feature.js','payload/index.html','RECIPE.json','DEPENDENCIES.json','TRANSFORMS.json','PROVENANCE.json']){const bytes=Buffer.from(path);await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes);files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const semantic={schema:1,kind:'recovered-renderer-package',id:'mqtt-raw-diff',version:'1.1.0',route:'source',runtime:{renderer:'Chromium >=120',isolation:'own document/root; never share host React'},api:['mount','update','snapshot','dispose'],entry:'payload/feature.js',capabilities:recipe.capabilities,limits:recipe.limits,files};await writeFile(join(root,'FEATURE.json'),canonical({...semantic,digest:sha256(canonical(semantic))}));
  const before=process.getActiveResourcesInfo().filter(x=>x==='TCPServerWrap').length;
  await assert.rejects(minimalFeatureDriver({featurePackage:root,playwright:{chromium:{launch:async()=>{throw Error('deliberate unavailable browser');}}}}),/deliberate unavailable browser/);
  for(let i=0;i<50&&process.getActiveResourcesInfo().filter(x=>x==='TCPServerWrap').length>before;i++)await new Promise(r=>setTimeout(r,10));assert.equal(process.getActiveResourcesInfo().filter(x=>x==='TCPServerWrap').length,before);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('read-only prerequisite check never imports operator-selected tooling code',async()=>{
 const f=await fixture();try{const tooling=join(f.root,'untrusted-tooling');await mkdir(tooling);const sentinel=join(f.root,'MUST-NOT-EXECUTE');await writeFile(join(tooling,'index.mjs'),'import {writeFileSync} from "node:fs";writeFileSync('+JSON.stringify(sentinel)+',"executed");');await writeFile(join(tooling,'package.json'),JSON.stringify({name:'playwright',version:'1.61.1'}));const c=JSON.parse(await readFile(f.config));c.playwrightModule='untrusted-tooling/index.mjs';await writeFile(f.config,JSON.stringify(c));const checked=await checkDelivery(f.config);assert.equal(checked.status,'blocked');await assert.rejects(readFile(sentinel),/ENOENT/);}finally{await f.clean();}
});
