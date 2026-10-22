import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),local=join(root,'.local'),runtime=join(local,'runtime');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(await readFile(join(local,'build/BUILD.json')));
const module=join(local,'build/yoinkr-krita-ink.so');
if(sha(await readFile(module))!==receipt.moduleSha256)throw new Error('Module changed since build; rebuild before launch.');
const runtimeReceipt=JSON.parse(await readFile(join(runtime,'RUNTIME.json')));
for(const [name,expected] of Object.entries(runtimeReceipt.files)){
 const target=resolve(runtime,name);if(!target.startsWith(runtime+sep))throw new Error('Invalid runtime receipt path');
 if(sha(await readFile(target))!==expected)throw new Error('Copied OBS runtime changed: '+name);
}
const config=resolve(process.env.YOINKR_LAB_CONFIG||join(local,'lab-config'));if(!config.startsWith(local+sep))throw new Error('Configuration must belong to this lab.');
const destination=join(config,'obs-studio/plugins/yoinkr-krita-ink/bin/64bit');
await mkdir(destination,{recursive:true});await cp(module,join(destination,'yoinkr-krita-ink.so'));
const env={...process.env,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:join(local,'lab-cache'),XDG_DATA_HOME:join(local,'lab-data'),LD_LIBRARY_PATH:join(runtime,'lib'),QT_PLUGIN_PATH:join(runtime,'lib/qt6/plugins'),QT_QPA_PLATFORM:'xcb',OBS_DATA_PATH:join(runtime,'share/obs/obs-studio')+'/',OBS_PLUGINS_PATH:join(runtime,'lib/obs-plugins'),OBS_PLUGINS_DATA_PATH:join(runtime,'share/obs/obs-plugins'),YOINKR_LAB:'1'};
await mkdir(join(config,'obs-studio'),{recursive:true});
let fresh=false;try{await writeFile(join(config,'obs-studio/global.ini'),'[General]\nFirstRun=true\n[Basic]\nProfile=Yoinkr Live Ink\nProfileDir=YoinkrLiveInk\nSceneCollection=Yoinkr Live Ink\nSceneCollectionFile=YoinkrLiveInk\n',{flag:'wx'});fresh=true;}catch(error){if(error.code!=='EEXIST')throw error;}
if(fresh){
 const basic=join(config,'obs-studio/basic');await mkdir(join(basic,'profiles/YoinkrLiveInk'),{recursive:true});await mkdir(join(basic,'scenes'),{recursive:true});
 await writeFile(join(basic,'profiles/YoinkrLiveInk/basic.ini'),'[General]\nName=Yoinkr Live Ink\n[Video]\nBaseCX=1280\nBaseCY=720\nOutputCX=1280\nOutputCY=720\nFPSType=0\nFPSCommon=30\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n');
 await writeFile(join(basic,'scenes/YoinkrLiveInk.json'),JSON.stringify({name:'Yoinkr Live Ink',current_scene:'Live ink',current_program_scene:'Live ink',scene_order:[{name:'Live ink'}],sources:[{name:'Live ink',id:'scene',versioned_id:'scene',settings:{id_counter:0,custom_size:false,items:[]},mixers:0,enabled:true}],groups:[]}));
}
const app=spawn(join(runtime,'bin/obs'),['--multi','--disable-shutdown-check','--disable-updater'],{cwd:runtime,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.kill(signal));
app.once('error',error=>{console.error(error.message);process.exitCode=1;});app.once('exit',code=>{process.exitCode=code??1;});
