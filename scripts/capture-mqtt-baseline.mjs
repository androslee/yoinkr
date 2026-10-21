import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus,platform,arch,totalmem} from 'node:os';
import aedes from 'aedes';
import mqtt from 'mqtt';
import {prepareFeatureSession} from '../src/feature-session.js';
import {runOriginalFeatureBaseline} from '../src/feature-electron.js';
import {saveJson,writeState} from '../src/workspace.js';
const until=async(fn,ms=10000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('owned service readiness timed out');await new Promise(r=>setTimeout(r,30));}};
const terminate=async child=>{if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1000).unref())]);if(child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}};
export async function captureMqttBaseline({donorRoot,casePath,out,code,joplin,xvfb,playwrightModule,signal,recipePath=fileURLToPath(new URL('../recipes/mqtt-payload-baseline/recipe.json',import.meta.url))}={}){
 const session=await prepareFeatureSession(recipePath,{donorRoot,casePath,out,recipients:[...(code?[{id:'code',path:code,surface:'application-owned comparison tool window; source-selected text command planned',capabilities:['command','selected-text','theme','clipboard','feature-settings']}]:[]),...(joplin?[{id:'joplin',path:joplin,surface:'application-owned comparison tool window; note/text snapshot action planned',capabilities:['command','note-text','theme','clipboard','feature-settings']}]:[])]});
 const broker=aedes(),sockets=new Set(),server=createServer(broker.handle),root=session.directory;let publisher,displayProcess,display,subscribed=false,result,error;
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});broker.on('subscribe',subscriptions=>{if(subscriptions.some(s=>s.topic==='#'))subscribed=true;});
 try{
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;
  publisher=mqtt.connect('mqtt://127.0.0.1:'+port,{reconnectPeriod:0,connectTimeout:5000});publisher.on('error',()=>{});await until(()=>publisher.connected);
  if(xvfb){let buffer='';displayProcess=spawn(xvfb,['-displayfd','1','-screen','0','1400x1000x24','-nolisten','tcp','-ac'],{stdio:['ignore','pipe','pipe']});let failure;displayProcess.on('error',e=>failure=e);displayProcess.stdout.on('data',b=>buffer+=b);displayProcess.stderr.on('data',()=>{});await until(()=>failure||/^\d+\n/.test(buffer),5000);if(failure)throw failure;display=':'+buffer.trim().split('\n')[0];}
  const publish=async(topic,payload)=>{signal?.throwIfAborted();await until(()=>subscribed,5000);await new Promise((r,j)=>publisher.publish(topic,payload,{qos:1},e=>e?j(e):r()));};
  result=await runOriginalFeatureBaseline(root,{playwrightModule,publish,variables:{brokerPort:String(port)},display,signal});
  await saveJson(join(root,'BENCHMARK-ENVIRONMENT.json'),{schema:1,platform:platform(),arch:arch(),cpu:cpus()[0]?.model??'unknown',logicalCpus:cpus().length,memoryBytes:totalmem(),node:process.versions.node,display:display??'operator-provided',scope:'Original donor single-run development baseline; no recipient or p95 performance claim.'});
 }catch(e){error=e;const status=JSON.parse(await readFile(join(root,'SESSION.json')));if(status.status==='prepared'){status.status=signal?.aborted?'cancelled':'failed';status.passed=false;status.error=e.message;await writeState(join(root,'SESSION.json'),status);}}finally{
  if(publisher)await new Promise(r=>publisher.end(true,{},r));for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));await new Promise(r=>broker.close(r));await terminate(displayProcess);
  await saveJson(join(root,'SERVICES-CLEANUP.json'),{schema:1,brokerClosed:!server.listening,publisherClosed:!publisher?.connected,displayExited:!displayProcess||displayProcess.exitCode!==null||displayProcess.signalCode!==null,scope:'Only this run owns these resources.'});
 }
 if(error)throw error;return {directory:root,...result.record};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),flags={};for(let i=0;i<args.length;i++){const k=args[i];if(!['--donor','--case','--out','--code','--joplin','--xvfb','--recipe'].includes(k)||!args[i+1])throw Error('use --donor <prepared original build> --case <REA case> --out <new session> [--code <runtime>] [--joplin <runtime>] [--xvfb <executable>] [--recipe <json>]');flags[k.slice(2)]=args[++i];}
 const controller=new AbortController();for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>controller.abort(Error('capture cancelled')));
 try{const result=await captureMqttBaseline({donorRoot:flags.donor,casePath:flags.case,out:flags.out,code:flags.code,joplin:flags.joplin,xvfb:flags.xvfb,recipePath:flags.recipe,signal:controller.signal});console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.stack);process.exitCode=1;}
}
