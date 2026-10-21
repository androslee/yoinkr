import{mkdir,writeFile}from'node:fs/promises';
import{spawn}from'node:child_process';import{resolve,join}from'node:path';
const root=resolve(process.argv[2]);const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('VSCODE_')&&key!=='ELECTRON_RUN_AS_NODE'));
const suffix=(process.env.YOINKR_PROFILE_SUFFIX??process.env.MODKIT_PROFILE_SUFFIX)??'default';if(!/^[a-zA-Z0-9_-]+$/.test(suffix))throw Error('invalid lab profile');
if(Buffer.byteLength(join(root,'p',suffix,'user-data','1.14-main.sock'))>107)throw Error('Application path is too long for a Linux IPC socket; move the build to a shorter path or use a shorter YOINKR_PROFILE_SUFFIX');
env.YOINKR_OPEN_MQTT='1';env.VSCODE_PORTABLE=join(root,'p',suffix);
await mkdir(join(env.VSCODE_PORTABLE,'user-data','User'),{recursive:true});await mkdir(join(env.VSCODE_PORTABLE,'extensions'),{recursive:true});
try{await writeFile(join(env.VSCODE_PORTABLE,'user-data','User','settings.json'),JSON.stringify({'telemetry.telemetryLevel':'off','update.mode':'none','extensions.autoUpdate':false,'extensions.autoCheckUpdates':false,'workbench.enableExperiments':false,'workbench.startupEditor':'none','window.titleBarStyle':'native','window.menuBarVisibility':'classic'}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const child=spawn(join(root,'code','code'),['--user-data-dir='+join(root,'profile'),'--extensions-dir='+join(root,'extensions'),...process.argv.slice(3)],{env,stdio:'inherit'});
child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',(code,signal)=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
