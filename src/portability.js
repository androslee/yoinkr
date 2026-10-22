/** Reproducible core portability checks. This is not native recipient acceptance. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {exportDeliveryBundle,importDeliveryBundle,inspectDeliveryBundle} from './delivery.js';
import {newDestination,saveJson,sha256} from './workspace.js';
import {YOINKR_VERSION} from './version.js';
const project=fileURLToPath(new URL('..',import.meta.url));
const method=['src/portability.js','scripts/general/verify-portability.mjs','test/delivery.test.js','package.json','package-lock.json'];
export function portabilityScope(){return {platform:process.platform,arch:process.arch,node:process.versions.node,nativeRecipientAcceptance:'not-run',milestone24Complete:false,limitation:'Core recipe/CLI/MCP/workbench portability checks do not validate native Windows application integration.'};}
async function testDelivery(root){
 const file=join(root,'DELIVERY-TESTS.log'),log=createWriteStream(file,{flags:'wx',mode:0o600});await once(log,'open');
 const child=spawn(process.execPath,['--test','test/delivery.test.js'],{cwd:project,stdio:['ignore','pipe','pipe']});let timedOut=false,launchError=null,total=0,tooLarge=false;
 const output=bytes=>{total+=bytes.length;if(total<=16*1024*1024)log.write(bytes);else{tooLarge=true;child.kill('SIGTERM');}};
 child.stdout.on('data',output);child.stderr.on('data',output);
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},120000);timer.unref();
 let force;const stop=()=>{force=setTimeout(()=>child.kill('SIGKILL'),3000);force.unref();};
 // Force termination only after this owned runner exceeds its deadline/output cap.
 const guard=setInterval(()=>{if((timedOut||tooLarge)&&!force)stop();},100);guard.unref();
 const exited=await new Promise(resolve=>{child.once('error',e=>{launchError=e.message;});child.once('close',(code,signal)=>resolve({code,signal}));});
 clearTimeout(timer);clearTimeout(force);clearInterval(guard);await new Promise((resolve,reject)=>{log.once('error',reject);log.end(resolve);});
 return {status:exited.code===0&&!timedOut&&!tooLarge&&!launchError?'passed':'failed',...exited,timedOut,tooLarge,launchError,log:'DELIVERY-TESTS.log',bytes:total};
}
export async function verifyPortability(out){
 const root=await newDestination(out,[project]);if(root===dirname(project))throw Error('Select a new output directory outside the source checkout');await mkdir(root,{recursive:false,mode:0o700});
 const sources=[];for(const path of method){const bytes=await readFile(join(project,path));sources.push({path,sha256:sha256(bytes)});}await saveJson(join(root,'METHOD.json'),{schema:1,files:sources});
 const result={schema:1,kind:'modkit-core-portability-check',version:YOINKR_VERSION,...portabilityScope(),status:'running',checks:[],errors:[]};
 try{
  const bundled=await inspectDeliveryBundle(join(project,'recipes/reference-raw-diff'));result.checks.push({name:'published reference bundle integrity',status:'passed',digest:bundled.digest});
  const exported=await exportDeliveryBundle(join(root,'exported')),imported=await importDeliveryBundle(exported.directory,join(root,'imported'));if(exported.digest!==imported.digest)throw Error('Recipe round-trip digest differs');
  result.checks.push({name:'fresh recipe export/import round trip',status:'passed',digest:exported.digest});
  const tests=await testDelivery(root);result.checks.push({name:'delivery regression tests',...tests});if(tests.status!=='passed')throw Error('Delivery tests failed; inspect DELIVERY-TESTS.log');
  for(const source of sources)if(sha256(await readFile(join(project,source.path)))!==source.sha256)throw Error('Check implementation changed during execution: '+source.path);
  result.status='passed';
 }catch(e){result.status='failed';result.errors.push(e.stack??e.message);}
 await saveJson(join(root,'RESULT.json'),result);
 const safe=String(result.platform).replace(/[^A-Za-z0-9_-]/g,'');await writeFile(join(root,'SUMMARY.txt'),`${result.status}: Yoinkr core portability on ${safe}/${result.arch}\nNative recipient acceptance: NOT RUN\nMilestone 24 complete: NO\n${result.limitation}\n`,{flag:'wx',mode:0o600});
 return {directory:root,...result};
}
