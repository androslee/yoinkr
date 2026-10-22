import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=dirname(fileURLToPath(import.meta.url));
const sdk=resolve(process.argv[2]||'/');
const binary=resolve(process.argv[3]||join(sdk,'usr/bin/obs'));
const xvfb=process.env.YOINKR_XVFB;
if(!xvfb)throw new Error('Set YOINKR_XVFB to an Xvfb executable; native acceptance always uses a private display.');
const local=join(root,'.local'),out=join(local,'verification');await mkdir(out,{recursive:true});
const distribution=dirname(dirname(binary));
let runtimeLib=join(distribution,'lib/x86_64-linux-gnu');try{await readFile(join(runtimeLib,'libobs.so.0'));}catch{runtimeLib=join(distribution,'lib');}
const lib=join(sdk,'usr/lib/x86_64-linux-gnu'),qt=join(sdk,'usr/include/x86_64-linux-gnu/qt6');
const env={...process.env,LD_LIBRARY_PATH:runtimeLib+':'+lib+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:''),QT_PLUGIN_PATH:join(runtimeLib,'qt6/plugins'),OBS_DATA_PATH:join(distribution,'share/obs/obs-studio')+'/',OBS_PLUGINS_PATH:join(runtimeLib,'obs-plugins'),OBS_PLUGINS_DATA_PATH:join(distribution,'share/obs/obs-plugins'),QT_QPA_PLATFORM:'xcb',LIBGL_ALWAYS_SOFTWARE:'1',XDG_CONFIG_HOME:join(local,'verify-config'),XDG_CACHE_HOME:join(local,'verify-cache'),XDG_DATA_HOME:join(local,'verify-data'),YOINKR_LAB:'1',YOINKR_VERIFY_OUT:out};
const flags=['-std=c++17','-O2','-fPIC','-DQT_WIDGETS_LIB','-DQT_GUI_LIB','-shared','-I'+join(sdk,'usr/include'),'-I'+join(sdk,'usr/include/obs'),...['','QtCore','QtGui','QtWidgets','QtTest'].map(name=>'-I'+join(qt,name))];
const observer=join(out,'yoinkr-native-observer.so');
execFileSync(process.env.CXX||'c++',[...flags,join(root,'native/verify_driver.cpp'),'-L'+lib,'-Wl,-rpath,'+lib,'-lobs','-lobs-frontend-api','-lQt6Test','-lQt6Widgets','-lQt6Gui','-lQt6Core','-o',observer],{env,timeout:60000});
const receipt=JSON.parse(await readFile(join(local,'build/BUILD.json')));
const module=join(local,'build/yoinkr-krita-ink.so');
if(createHash('sha256').update(await readFile(module)).digest('hex')!==receipt.moduleSha256)throw new Error('Built module changed. Rebuild first.');
const integrity=[];
async function changedFile(path,command,pattern){
 const before=await readFile(path);
 try{await writeFile(path,Buffer.concat([before,Buffer.from('\n// drift probe\n')]));const result=spawnSync(process.execPath,command,{cwd:root,env,encoding:'utf8',timeout:20000});assert.notEqual(result.status,0);assert.match(result.stderr,pattern);}
 finally{await writeFile(path,before);}
}
await changedFile(join(local,'upstream',receipt.recipe.files[0].path),['build.mjs',sdk],/Original source integrity mismatch/);integrity.push('Source drift refused before build output replacement');
await changedFile(module,['launch.mjs'],/Module changed since build/);integrity.push('Changed module refused before launch');
if(distribution===join(local,'runtime')){await changedFile(join(distribution,'share/obs/obs-studio/locale/en-US.ini'),['launch.mjs'],/Copied OBS runtime changed/);integrity.push('Changed copied OBS runtime refused before launch');}
for(const [name,path] of [['yoinkr-krita-ink',module],['yoinkr-native-observer',observer]]){
 const destination=join(env.XDG_CONFIG_HOME,'obs-studio/plugins',name,'bin/64bit');await mkdir(destination,{recursive:true});await cp(path,join(destination,name+'.so'));
}
const config=join(env.XDG_CONFIG_HOME,'obs-studio');await mkdir(config,{recursive:true});
await writeFile(join(config,'global.ini'),'[General]\nFirstRun=false\n[Basic]\nProfile=Yoinkr Lab\nProfileDir=YoinkrLab\nSceneCollection=Yoinkr Lab\nSceneCollectionFile=YoinkrLab\n[BasicWindow]\nWarnBeforeStartingStream=false\nWarnBeforeStoppingStream=false\n');
await rm(join(out,'RESULT.json'),{force:true});
const display=spawn(xvfb,['-displayfd','3','-screen','0','1600x1000x24','+extension','GLX','-nolisten','tcp','-ac'],{stdio:['ignore','ignore','pipe','pipe']});
let displayLog='',log='',app=null;display.stderr.on('data',chunk=>displayLog+=chunk);
try{
 const number=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Xvfb startup timeout')),10000);display.once('error',reject);display.once('exit',()=>reject(new Error('Xvfb exited')));display.stdio[3].once('data',chunk=>{clearTimeout(timeout);resolve(String(chunk).trim());});});
 if(!/^\d+$/.test(number))throw new Error('Invalid display number');
 const runs=[];
 async function run(mode,extra={},launcher=false){
  await rm(join(out,'RESULT.json'),{force:true});let output='';
  app=spawn(launcher?process.execPath:binary,launcher?[join(root,'launch.mjs')]:['--multi','--disable-shutdown-check','--disable-updater','--verbose'],{cwd:launcher?root:distribution,env:{...env,YOINKR_LAB_CONFIG:env.XDG_CONFIG_HOME,DISPLAY:':'+number,...extra},stdio:['ignore','pipe','pipe'],detached:true});
  for(const stream of [app.stdout,app.stderr])stream.on('data',chunk=>{output+=chunk;log+=chunk;process.stdout.write(chunk);});
  const status=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{try{process.kill(-app.pid,'SIGKILL');}catch{}reject(new Error('OBS native acceptance timed out'));},60000);app.once('error',reject);app.once('exit',code=>{clearTimeout(timeout);resolve(code);});});
  const result=JSON.parse(await readFile(join(out,'RESULT.json')));
  await writeFile(join(out,mode+'.json'),JSON.stringify({...result,exitCode:status},null,2)+'\n');
  if(status!==0||result.status!=='passed')throw new Error(`Native acceptance failed (exit ${status}): ${result.failure}`);
  assert.match(output,/Number of memory leaks: 0/);runs.push({mode,checks:result.checks.length,exitCode:status,trackedLeaks:0});
 }
 await run('feature');await run('restart');
 const installed=join(env.XDG_CONFIG_HOME,'obs-studio/plugins/yoinkr-krita-ink/bin/64bit/yoinkr-krita-ink.so');
 const rollbackEnv={...env,YOINKR_LAB_CONFIG:env.XDG_CONFIG_HOME};
 const saved=await readFile(installed);
 try{await writeFile(installed,Buffer.concat([saved,Buffer.from('\n')]));const refused=spawnSync(process.execPath,['rollback.mjs'],{cwd:root,env:rollbackEnv,encoding:'utf8'});assert.notEqual(refused.status,0);assert.match(refused.stderr,/refusing rollback/);}finally{await writeFile(installed,saved);}
 integrity.push('Changed installed module refused before rollback');
 execFileSync(process.execPath,['rollback.mjs'],{cwd:root,env:rollbackEnv});
 await run('rollback',{YOINKR_VERIFY_BASELINE:'1'});
 if(distribution===join(local,'runtime')){
  const launcherConfig=join(local,'verify-launcher-config');await rm(launcherConfig,{recursive:true,force:true});
  const observerDirectory=join(launcherConfig,'obs-studio/plugins/yoinkr-native-observer/bin/64bit');await mkdir(observerDirectory,{recursive:true});await cp(observer,join(observerDirectory,'yoinkr-native-observer.so'));
  await run('launcher',{YOINKR_LAB_CONFIG:launcherConfig,YOINKR_VERIFY_FRESH:'1'},true);
 }
 await writeFile(join(out,'ACCEPTANCE.json'),JSON.stringify({schema:1,status:'passed',runs,integrity,scope:'Actual copied OBS Linux x86-64 runtime, original Krita Qt widget, rendered source/scene frames, restart, guarded rollback and clean shutdown. No original full Krita app, ICC/HDR, brush engine or cross-platform proof.'},null,2)+'\n');
 console.log('Native OBS acceptance passed: feature, restart, rollback and integrity checks.');
}finally{
 if(app&&app.exitCode===null){try{process.kill(-app.pid,'SIGKILL');}catch{}}
 if(display.exitCode===null)display.kill('SIGTERM');
 await writeFile(join(out,'obs.log'),log);await writeFile(join(out,'display.log'),displayLog);
}
