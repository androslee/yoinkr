// Original-app source build for the reference baseline. No donor feature code is patched.
import {readFile,writeFile,mkdir,cp,readdir,stat,realpath,open} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,saveJson,newDestination,containedFile} from '../../src/workspace.js';
import {safeRelative} from '../../src/research.js';
export const MQTT_REVISION='35f31973c456a024a37450f5961e4610dc9a9ce0';
async function run(command,args,{cwd,log,environment={},timeoutMs=300000}={}){
 const handle=await open(log,'wx',0o600);let timer,killTimer;
 try{await new Promise((done,fail)=>{const child=spawn(command,args,{cwd,env:{...process.env,...environment},stdio:['ignore',handle.fd,handle.fd]});timer=setTimeout(()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),1000);},timeoutMs);child.once('error',fail);child.once('close',(code,signal)=>code===0?done():fail(Error('build step failed ('+(signal??code)+'); see '+log)));});}finally{clearTimeout(timer);clearTimeout(killTimer);await handle.close();}
}
async function files(root,prefix){const out=[];async function walk(rel){for(const e of await readdir(join(root,rel),{withFileTypes:true})){const name=rel+'/'+e.name;if(e.isDirectory())await walk(name);else if(e.isFile()){const bytes=await readFile(join(root,name));out.push({path:name,sha256:sha256(bytes),bytes:bytes.length});}else throw Error('build output contains a non-regular file');}}await walk(prefix);return out.sort((a,b)=>a.path.localeCompare(b.path));}
export async function attestMqttDonor(source,built,{commands=[],dependencyInstallation='npm --ignore-scripts --legacy-peer-deps'}={}){
 const repo=await realpath(source),root=await realpath(built),revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(revision!==MQTT_REVISION)throw Error('reference recipe requires pinned MQTT Explorer revision '+MQTT_REVISION);
 if(execFileSync('git',['-C',repo,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('donor tracked working tree is modified');
 const names=execFileSync('git',['-C',repo,'ls-files','-z'],{encoding:'utf8',maxBuffer:4*1024*1024}).split('\0').filter(Boolean),sources=[];
 for(const name of names){safeRelative(name);const original=await readFile(await containedFile(repo,name)),copy=await readFile(await containedFile(root,name));if(!original.equals(copy))throw Error('built donor source differs: '+name);sources.push({path:name,sha256:sha256(copy),bytes:copy.length});}
 const outputs=[...await files(root,'dist'),...await files(root,'app/build')];
 for(const name of ['MODKIT-NPM-LOCKS/root.json','MODKIT-NPM-LOCKS/renderer.json']){const bytes=await readFile(await containedFile(root,name));outputs.push({path:name,sha256:sha256(bytes),bytes:bytes.length});}
 const electron=JSON.parse(await readFile(join(root,'node_modules/electron/package.json'))),runtime=join(root,'node_modules/electron/dist/electron');if(electron.version!=='39.2.7'||!(await stat(runtime)).isFile())throw Error('reference Electron runtime must be 39.2.7');
 const runtimeHash=sha256(await readFile(runtime));
 const record={schema:1,kind:'original-donor-build',revision,sourceRoot:repo,upstream:'https://github.com/thomasnordquist/MQTT-Explorer',createdAt:new Date().toISOString(),sourceChanges:[],sources,outputs,compiler:{typescript:'5.9.3',webpack:'5.98.0',typeChecking:'disabled by explicit --noCheck; this is a runtime baseline, not upstream type-check acceptance',mode:'development; original webpack configuration and app entry'},runtime:{electron:electron.version,relativeExecutable:'node_modules/electron/dist/electron',sha256:runtimeHash},dependencyInstallation,commands,limitations:['Known upstream webpack type-only-export warnings retained in build logs.','Source identity is checked for every tracked donor file. Build dependencies use retained npm locks; upstream yarn.lock is retained separately.','Runtime baseline applies to this pinned development source build, not arbitrary shipped MQTT Explorer versions.']};
 await saveJson(join(root,'MODKIT-DONOR-BUILD.json'),record);return {root,revision,sourceFiles:sources.length,outputFiles:outputs.length,runtime};
}
export async function buildMqttDonor({source,out,locks,offline=false}={}){
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('reference donor builder currently supports Linux x86-64 only');
 if(offline&&!locks)throw Error('--offline requires a prior attested --locks build with cached Electron runtime');
 const repo=await realpath(resolve(source));
 if(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==MQTT_REVISION||execFileSync('git',['-C',repo,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('provide a clean checkout of the pinned donor revision');
 const dest=await newDestination(out,[repo,...(locks?[await realpath(resolve(locks))]:[])]);await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 const names=execFileSync('git',['-C',repo,'ls-files','-z'],{encoding:'utf8',maxBuffer:4*1024*1024}).split('\0').filter(Boolean);
 for(const name of names){safeRelative(name);const file=await containedFile(repo,name),target=join(dest,name);await mkdir(dirname(target),{recursive:true});await cp(file,target);}
 if(locks)for(const [from,to]of [['MODKIT-NPM-LOCKS/root.json','package-lock.json'],['MODKIT-NPM-LOCKS/renderer.json','app/package-lock.json']])await cp(await containedFile(await realpath(resolve(locks)),from),join(dest,to));
 const commands=[],npm=process.platform==='win32'?'npm.cmd':'npm';
 for(const [name,cwd]of [['root',dest],['renderer',join(dest,'app')]]){
  const args=[locks?'ci':'install','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund',...(offline?['--offline']:[])];commands.push({command:npm,args,workingDirectory:name});await run(npm,args,{cwd,log:join(dest,'yoinkr-install-'+name+'.log')});
 }
 // Record the effective npm locks before restoring tracked upstream lockfiles.
 await mkdir(join(dest,'MODKIT-NPM-LOCKS'),{mode:0o700});
 for(const [from,to]of [['package-lock.json','root.json'],['app/package-lock.json','renderer.json']])await cp(join(dest,from),join(dest,'MODKIT-NPM-LOCKS',to));
 for(const name of names.filter(n=>n==='package-lock.json'||n.endsWith('/package-lock.json')||n==='yarn.lock'||n.endsWith('/yarn.lock')))await cp(await containedFile(repo,name),join(dest,name));
 if(offline){const cached=await realpath(resolve(locks)),record=JSON.parse(await readFile(join(cached,'MODKIT-DONOR-BUILD.json'))),executable=await containedFile(cached,record.runtime.relativeExecutable);if(record.runtime.electron!=='39.2.7'||sha256(await readFile(executable))!==record.runtime.sha256)throw Error('cached Electron runtime identity differs');await cp(join(cached,'node_modules/electron/dist'),join(dest,'node_modules/electron/dist'),{recursive:true});await cp(join(cached,'node_modules/electron/path.txt'),join(dest,'node_modules/electron/path.txt'));commands.push({operation:'reuse-cached-Electron',version:'39.2.7',sha256:record.runtime.sha256});}
 const buildSteps=[{name:'electron',script:'node_modules/electron/install.js',args:[],cwd:dest,env:{}},{name:'typescript',script:'node_modules/typescript/bin/tsc',args:['--noCheck'],cwd:dest,env:{}},{name:'webpack',script:'node_modules/webpack/bin/webpack.js',args:['--mode','development'],cwd:join(dest,'app'),env:{NODE_ENV:'development'}}];
 for(const step of buildSteps){if(offline&&step.name==='electron')continue;commands.push({command:'node',script:step.script,args:step.args,workingDirectory:step.name==='webpack'?'renderer':'root',environment:step.env});await run(process.execPath,[step.script,...step.args],{cwd:step.cwd,log:join(dest,'yoinkr-build-'+step.name+'.log'),environment:step.env});}
 return attestMqttDonor(repo,dest,{commands});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),flags={};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--offline'){flags.offline=true;continue;}if(!['--source','--out','--locks','--attest-existing'].includes(k)||!args[i+1])throw Error('use --source <clean pinned checkout> --out <new build> [--locks <prior build>] [--offline], or --attest-existing <prepared-build>');flags[k.slice(2).replaceAll('-','_')]=args[++i];}
 if(!flags.source||!flags.out&&!flags.attest_existing)throw Error('--source and --out are required');
 console.log(JSON.stringify(flags.attest_existing?await attestMqttDonor(flags.source,flags.attest_existing):await buildMqttDonor(flags),null,2));
}
