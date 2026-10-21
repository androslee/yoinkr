/** Declarative, local-file Electron transfers. Planning never executes application code. */
import {readFile,writeFile,mkdir,readdir,lstat,realpath,readlink,cp,rm,rmdir,chmod,rename} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safeRelative} from './research.js';
import {sha256,inside,readJson,saveJson,writeState,newDestination} from './workspace.js';
const hash=/^[a-f0-9]{64}$/;
const roles=new Set(['main','preload','renderer','asset']);
const LIMIT=96*1024*1024;
function pathName(value){safeRelative(value);if(value.split('/').some(s=>s==='.modkit-playbook'))throw Error('reserved playbook path');return value;}
export function validateElectronPlaybook(p){
 if(!p||p.schema!==1||p.kind!=='electron-playbook'||typeof p.id!=='string'||! /^[a-z0-9][a-z0-9._-]{0,79}$/.test(p.id))throw Error('expected schema 1 electron-playbook and stable id');
 pathName(p.target?.app);for(const k of ['name','version','main','type'])if(typeof p.target[k]!=='string'||!p.target[k]||p.target[k].length>256)throw Error('target requires exact name/version/main/type');
 if(!['module','commonjs'].includes(p.target.type))throw Error('unsupported package type');
 if(!Array.isArray(p.files)||!p.files.length||p.files.length>256)throw Error('playbook requires 1–256 files');
 const seen=new Set();for(const f of p.files){pathName(f.file);pathName(f.payload);if(seen.has(f.file)||[...seen].some(s=>s.startsWith(f.file+'/')||f.file.startsWith(s+'/')))throw Error('duplicate or overlapping target');seen.add(f.file);
  if(!roles.has(f.role)||!(f.beforeSha256===null||hash.test(f.beforeSha256))||!hash.test(f.afterSha256))throw Error('file requires role, beforeSha256 (or null for creation), afterSha256');
 }
 return p;
}
async function optionalStat(file){try{return await lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// Walk each component, including missing paths: no symlink parents or special files.
async function ordinary(root,name,{missing=false}={}){
 pathName(name);let file=root;const pieces=name.split('/');for(let i=0;i<pieces.length;i++){file=join(file,pieces[i]);const s=await optionalStat(file);if(!s){if(missing)return null;throw Error('missing file: '+name);}if(s.isSymbolicLink()||(i<pieces.length-1?!s.isDirectory():!s.isFile()))throw Error('non-ordinary path: '+name);}
 const s=await lstat(file);if(s.size>32*1024*1024)throw Error('playbook file exceeds 32 MiB');return {bytes:await readFile(file),mode:s.mode&0o777};
}
async function inventory(root){let files=0,bytes=0;const walk=async dir=>{for(const e of await readdir(dir,{withFileTypes:true})){const file=join(dir,e.name),s=await lstat(file);if(++files>50000)throw Error('runtime exceeds 50,000 entries');if(s.isSymbolicLink()){const link=await readlink(file),dest=await realpath(file);if(isAbsolute(link)||!inside(root,dest))throw Error('runtime has external/absolute symlink: '+relative(root,file));}else if(s.isDirectory())await walk(file);else if(s.isFile()){bytes+=s.size;if(bytes>3*1024*1024*1024)throw Error('runtime exceeds 3 GiB');}else throw Error('runtime contains a special file');}};await walk(root);return {entries:files,bytes};}
async function prepare(source,playbook){
 const root=await realpath(resolve(source));if(!(await lstat(root)).isDirectory())throw Error('use an extracted Electron runtime directory, not an ASAR');
 const manifestPath=await realpath(resolve(playbook)),payloadRoot=dirname(manifestPath),p=validateElectronPlaybook(await readJson(manifestPath));
 const packagePath=p.target.app+'/package.json',pkgFile=await ordinary(root,packagePath),pkg=JSON.parse(pkgFile.bytes);
 for(const key of ['name','version','main','type'])if((key==='type'?(pkg[key]??'commonjs'):pkg[key])!==p.target[key])throw Error('Electron target '+key+' differs; re-investigate this version');
 const changes=[];let total=0;for(const f of p.files){const payload=await ordinary(payloadRoot,f.payload),before=await ordinary(root,p.target.app+'/'+f.file,{missing:true});
  if(sha256(payload.bytes)!==f.afterSha256)throw Error('payload hash differs: '+f.payload);
  if((before?sha256(before.bytes):null)!==f.beforeSha256)throw Error('recipient hash differs: '+f.file);
  total+=payload.bytes.length+(before?.bytes.length??0);if(total>LIMIT)throw Error('playbook changes exceed 96 MiB');changes.push({...f,bytes:payload.bytes,before:before?.bytes??null,mode:before?.mode??0o644});
 }
 return {root,manifestPath,p,changes,packageSha256:sha256(pkgFile.bytes)};
}
const overview=x=>({schema:1,kind:'electron-playbook-plan',id:x.p.id,source:x.root,target:x.p.target,packageSha256:x.packageSha256,files:x.changes.map(({file,role,beforeSha256,afterSha256,bytes})=>({file,role,beforeSha256,afterSha256,bytes:bytes.length})),executesApplication:false});
export async function planElectronPlaybook(source,playbook){const x=await prepare(source,playbook);return {...overview(x),runtime:await inventory(x.root)};}
async function atomicFile(file,bytes,mode){const tmp=file+'.modkit-'+randomUUID();try{await writeFile(tmp,bytes,{flag:'wx',mode});await chmod(tmp,mode);await rename(tmp,file);}finally{await rm(tmp,{force:true});}}
export async function applyElectronPlaybook(source,playbook,out){
 const x=await prepare(source,playbook),runtimeInventory=await inventory(x.root),dest=await newDestination(out,[x.root,dirname(x.manifestPath)]);
 if(inside(dest,x.root)||inside(dest,dirname(x.manifestPath)))throw Error('output cannot contain source or playbook');
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 try{
  const runtime=join(dest,'runtime'),meta=join(dest,'.modkit-playbook');await mkdir(meta,{mode:0o700});await mkdir(join(meta,'before'),{mode:0o700});
  await cp(x.root,runtime,{recursive:true,dereference:false,preserveTimestamps:true,verbatimSymlinks:true,errorOnExist:true,force:false});
  // Check copy before mutation, including the package even when it is not patched.
  if(sha256((await ordinary(runtime,x.p.target.app+'/package.json')).bytes)!==x.packageSha256)throw Error('package changed during copy');
  for(const f of x.changes){const current=await ordinary(runtime,x.p.target.app+'/'+f.file,{missing:true});if((current?sha256(current.bytes):null)!==f.beforeSha256)throw Error('recipient changed during copy');}
  const createdDirectories=new Set();for(const [i,f] of x.changes.entries()){
   if(f.before!==null)await writeFile(join(meta,'before',String(i)),f.before,{flag:'wx',mode:0o600});
   const file=join(runtime,x.p.target.app,f.file);let parent=dirname(file),missing=[];while(!(await optionalStat(parent))){missing.push(parent);parent=dirname(parent);}for(const d of missing.reverse()){await mkdir(d);createdDirectories.add(relative(runtime,d));}
   await atomicFile(file,f.bytes,f.mode);
  }
  await saveJson(join(meta,'playbook.json'),x.p);
  const state={schema:1,kind:'electron-playbook-workspace',id:x.p.id,status:'applied',createdAt:new Date().toISOString(),source:x.root,playbookSha256:sha256(await readFile(join(meta,'playbook.json'))),packageSha256:x.packageSha256,runtimeInventory,files:x.changes.map(({file,role,beforeSha256,afterSha256,mode})=>({file,role,beforeSha256,afterSha256,mode})),createdDirectories:[...createdDirectories]};
  await saveJson(join(meta,'state.json'),state);return {directory:dest,...state};
 }catch(e){await rm(dest,{recursive:true,force:true});throw e;}
}
async function loadWorkspace(directory){
 const root=await realpath(resolve(directory)),meta=join(root,'.modkit-playbook');
 for(const name of ['state.json','playbook.json']){const s=await lstat(join(meta,name));if(s.isSymbolicLink()||!s.isFile()||s.size>4*1024*1024)throw Error('invalid playbook metadata');}
 if((await lstat(meta)).isSymbolicLink()||(await lstat(join(root,'runtime'))).isSymbolicLink())throw Error('workspace directories must be ordinary');
 const state=await readJson(join(meta,'state.json')),p=validateElectronPlaybook(await readJson(join(meta,'playbook.json')));
 if(!hash.test(state.packageSha256))throw Error('invalid package hash');
 if(state.schema!==1||state.kind!=='electron-playbook-workspace'||!['applied','rolled-back'].includes(state.status)||state.id!==p.id||state.playbookSha256!==sha256(await readFile(join(meta,'playbook.json')))||!Array.isArray(state.files)||state.files.length!==p.files.length)throw Error('playbook metadata differs');
 for(const [i,f] of state.files.entries()){const original=p.files[i];if(['file','role','beforeSha256','afterSha256'].some(k=>f[k]!==original[k])||!Number.isInteger(f.mode)||f.mode<0||f.mode>0o777)throw Error('invalid retained file record');}
 if(!Array.isArray(state.createdDirectories)||state.createdDirectories.length>1024)throw Error('invalid directory record');
 for(const d of state.createdDirectories){pathName(d);if(!state.files.some(f=>(p.target.app+'/'+f.file).startsWith(d+'/')))throw Error('unrelated directory record');}
 return {root,meta,state,p,runtime:join(root,'runtime')};
}
async function packageState(x){const f=x.state.files.find(f=>f.file==='package.json'),expected=x.state.status==='applied'&&f?f.afterSha256:x.state.packageSha256;const actual=sha256((await ordinary(x.runtime,x.p.target.app+'/package.json')).bytes);return {expected,actual,clean:actual===expected};}
export async function electronPlaybookStatus(directory){const x=await loadWorkspace(directory),files=[];const packageCheck=await packageState(x);for(const f of x.state.files){const current=await ordinary(x.runtime,x.p.target.app+'/'+f.file,{missing:true}),actual=current?sha256(current.bytes):null,expected=x.state.status==='applied'?f.afterSha256:f.beforeSha256;files.push({file:f.file,role:f.role,expected,actual,clean:actual===expected});}return {directory:x.root,id:x.state.id,status:x.state.status,clean:packageCheck.clean&&files.every(f=>f.clean),package:packageCheck,files};}
export async function rollbackElectronPlaybook(directory,{dryRun=false}={}){
 const x=await loadWorkspace(directory);if(x.state.status!=='applied')throw Error('playbook is already rolled back');
 if(!(await packageState(x)).clean)throw Error('rollback refused: application package changed');
 const changes=[];let total=0;for(const [i,f] of x.state.files.entries()){
  const file=join(x.runtime,x.p.target.app,f.file),current=await ordinary(x.runtime,x.p.target.app+'/'+f.file);
  if(sha256(current.bytes)!==f.afterSha256)throw Error('rollback refused: modified recipient '+f.file);
  const before=f.beforeSha256===null?null:await ordinary(x.meta,'before/'+i);if(before&&sha256(before.bytes)!==f.beforeSha256)throw Error('rollback backup hash differs');
  total+=current.bytes.length+(before?.bytes.length??0);if(total>LIMIT)throw Error('rollback changes exceed limit');changes.push({file,before:before?.bytes??null,after:current.bytes,mode:f.mode});
 }
 if(dryRun)return {directory:x.root,status:'rollback-ready',files:x.state.files.map(f=>f.file),executesApplication:false};
 const done=[];try{for(const f of changes){if(f.before===null)await rm(f.file);else await atomicFile(f.file,f.before,f.mode);done.push(f);}await writeState(join(x.meta,'state.json'),{...x.state,status:'rolled-back',rolledBackAt:new Date().toISOString()});}
 catch(e){for(const f of done.reverse())await atomicFile(f.file,f.after,f.mode);throw e;}
 // Remove only empty directories made by this playbook; user-added files survive.
 for(const d of [...x.state.createdDirectories].reverse()){try{await rmdir(join(x.runtime,d));}catch(e){if(!['ENOTEMPTY','EEXIST','ENOENT'].includes(e.code))throw e;}}
 return electronPlaybookStatus(x.root);
}
