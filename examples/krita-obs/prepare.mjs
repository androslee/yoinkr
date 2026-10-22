// Copy a supplied Linux OBS distribution into an isolated, ignored lab runtime.
import {readFile,writeFile,readdir,mkdir,cp,stat,rm,rename} from 'node:fs/promises';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url)),input=resolve(process.argv[2]||'/usr');
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Linux x86-64 runtime only.');
const binary=join(input,'bin/obs'),library=join(input,'lib/x86_64-linux-gnu');await stat(binary);
const env={...process.env,LD_LIBRARY_PATH:library+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')};
const version=execFileSync(binary,['--version'],{env,encoding:'utf8',timeout:15000}).trim();
if(!/OBS Studio - 30\.0\.2/.test(version))throw new Error('This accepted runtime recipe requires OBS 30.0.2. Received '+version);
const stage=join(root,'.local/runtime-'+randomUUID());await mkdir(stage,{recursive:true});
try{
 await mkdir(join(stage,'bin'),{recursive:true});await cp(binary,join(stage,'bin/obs'));
 await cp(join(input,'share/obs'),join(stage,'share/obs'),{recursive:true});
 await cp(join(library,'obs-plugins'),join(stage,'lib/obs-plugins'),{recursive:true,dereference:true});
 await cp(join(library,'qt6/plugins'),join(stage,'lib/qt6/plugins'),{recursive:true,dereference:true,filter:path=>!path.endsWith('libqtslibplugin.so')&&(!path.includes('/platforms/')||/\/libq(xcb|minimal|offscreen)\.so$/.test(path))});
 const targets=[binary];
 for(const name of await readdir(library))if(/^libobs.*\.so(?:\.\d+)*$/.test(name)){await cp(join(library,name),join(stage,'lib',name),{dereference:true});targets.push(join(library,name));}
 try{await cp(join(library,'obs-scripting'),join(stage,'lib/obs-scripting'),{recursive:true,dereference:true});}catch(error){if(error.code!=='ENOENT')throw error;}async function scan(path){for(const item of await readdir(path,{withFileTypes:true})){if(item.isDirectory())await scan(join(path,item.name));else if(item.name.endsWith('.so'))targets.push(join(path,item.name));}}
 await scan(join(stage,'lib/obs-plugins'));try{await scan(join(stage,'lib/obs-scripting'));}catch(error){if(error.code!=='ENOENT')throw error;}await scan(join(stage,'lib/qt6/plugins'));
 const copied=new Set();
 for(const target of targets){
  const output=execFileSync('ldd',[target],{env,encoding:'utf8',timeout:10000});
  if(/=> not found/.test(output))throw new Error('Incomplete OBS runtime dependencies:\n'+output);
  for(const line of output.split('\n')){
   const match=line.match(/^\s*(\S+)\s+=>\s+(\/\S+)/);if(!match)continue;
   const [,name,path]=match;
   // Retain the host OS loader/libc/C++ ABI; this is an OS-dependent lab, not a container image.
   if(/^(lib(c|m|dl|pthread|rt|stdc\+\+|gcc_s)\.|ld-linux)/.test(name)||copied.has(name))continue;
   await cp(path,join(stage,'lib',name),{dereference:true});copied.add(name);
  }
 }
 const files={};async function hashes(path,prefix=''){for(const entry of await readdir(path,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())await hashes(join(path,entry.name),name+'/');else files[name]=createHash('sha256').update(await readFile(join(path,entry.name))).digest('hex');}}
 await hashes(stage);await writeFile(join(stage,'RUNTIME.json'),JSON.stringify({schema:1,version,platform:process.platform,arch:process.arch,files,note:'Local copied OBS runtime, dependent on host OS/graphics drivers. Not included in Git/npm.'},null,2)+'\n');
 await stat(join(root,'.local/runtime')).then(()=>{throw new Error('Runtime already exists; use a new lab or explicitly remove the old generated runtime first.');},error=>{if(error.code!=='ENOENT')throw error;});
 await rename(stage,join(root,'.local/runtime'));console.log('Prepared .local/runtime; the supplied OBS installation was not modified.');
}finally{await rm(stage,{recursive:true,force:true});}
