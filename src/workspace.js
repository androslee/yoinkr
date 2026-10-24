import {readFile,writeFile,mkdir,readdir,lstat,realpath,stat,rename,rm} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {applicationRoot,safeRelative,canonicalTarget} from './research.js';
import {readHeader,readEntryBuffer} from './asar.js';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const inside=(root,path)=>{const r=relative(root,path);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\');};
export async function readJson(file){if((await stat(file)).size>4*1024*1024)throw Error('metadata exceeds 4 MiB');return JSON.parse(await readFile(file,'utf8'));}
export async function saveJson(file,value){await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function writeState(file,value){const tmp=file+'.'+randomUUID()+'.tmp';try{await saveJson(tmp,value);await rename(tmp,file);}finally{await rm(tmp,{force:true});}}
export async function containedFile(root,name){safeRelative(name);const base=await realpath(root),file=await realpath(join(base,name));if(!inside(base,file)||!(await stat(file)).isFile())throw Error('file escaped root or is not ordinary: '+name);return file;}
export async function newDestination(path,protectedRoots){
 const dest=resolve(path),canonical=await canonicalTarget(dest);
 // Compare both spellings: a protected root may itself be given uncanonicalized.
 for(const root of protectedRoots){
  const resolved=resolve(root),real=await realpath(resolved).catch(err=>{if(err.code==='ENOENT')return resolved;throw err;});
  for(const [base,target] of [[resolved,dest],[real,canonical]])if(target===base||inside(base,target))throw Error('workspace must be outside the case, donor and recipient');
 }
 return canonical;
}
const digestPattern=/^[a-f0-9]{64}$/;
export function validateRecipe(r){
 if(!r||r.schema!==1||!['module','commonjs'].includes(r.moduleType))throw Error('recipe requires schema 1 and moduleType module/commonjs');
 safeRelative(r.entry);safeRelative(r.mount);
 if(r.mount.split('/')[0]==='.modkit')throw Error('feature mount conflicts with workspace metadata');
 if(!Array.isArray(r.patches)||r.patches.length>32)throw Error('recipe patches must be an array (max 32)');
 const patchFiles=new Set();for(const p of r.patches){safeRelative(p.file);if(patchFiles.has(p.file))throw Error('combine changes to each file in one patch');patchFiles.add(p.file);
  if(!digestPattern.test(p.beforeSha256)||typeof p.find!=='string'||!p.find||typeof p.replace!=='string'||p.find.length>256000||p.replace.length>256000)throw Error('patch requires beforeSha256 and bounded nonempty find/replace');}
 if(!r.oracle||!r.recipient)throw Error('recipe requires oracle and recipient exports');
 for(const endpoint of [r.oracle,r.recipient]){safeRelative(endpoint.module);if(typeof endpoint.export!=='string'||!/^[$A-Z_a-z][$\w]*$/.test(endpoint.export))throw Error('expected a named module export');}
 if(!Array.isArray(r.cases)||!r.cases.length||r.cases.length>32)throw Error('recipe requires 1–32 behavior cases');
 if(Buffer.byteLength(JSON.stringify(r))>512000)throw Error('recipe exceeds 512 KiB');
 for(const c of r.cases){if(!c||!Array.isArray(c.args))throw Error('each case requires an args array');if(c.expectedError&&(!c.expectedError.name||typeof c.expectedError.message!=='string'))throw Error('expectedError requires name and message');}
 return r;
}

/** Enumerate bounded, regular source files. No dependency installs, hooks or symlink traversal. */
async function sourceFiles(source){
 const result=[];let bytes=0;
 const add=(name,data)=>{safeRelative(name);bytes+=data.length;if(data.length>16*1024*1024||bytes>256*1024*1024||result.length>=10000)throw Error('recipient copy exceeds file/count/total limits');result.push({path:name,bytes:data,sha256:sha256(data)});};
 if((await stat(source)).isFile()){
  const {header}=readHeader(source);const walk=node=>{const list=[];for(const [name,entry]of Object.entries(node.files??{})){if(entry.files)for(const child of walk(entry))list.push(name+'/'+child);else if(entry.link||entry.unpacked)throw Error('recipient ASAR has links/unpacked companions; use an extracted working tree');else list.push(name);}return list;};
  for(const name of walk(header)){safeRelative(name);const b=readEntryBuffer(source,name,16*1024*1024);if(b===null)throw Error('missing recipient archive entry: '+name);add(name,b);}
 }else{
  const walk=async(dir,prefix='')=>{for(const e of await readdir(dir,{withFileTypes:true})){
   if(['node_modules','.git','.modkit'].includes(e.name))continue;
   const name=prefix?prefix+'/'+e.name:e.name,full=join(dir,e.name),s=await lstat(full);
   if(s.isSymbolicLink())throw Error('recipient contains symlinks; provide a regular extracted tree');
   if(s.isDirectory())await walk(full,name);else if(s.isFile()){if(s.size>16*1024*1024)throw Error('recipient file exceeds 16 MiB');add(name,await readFile(full));}else throw Error('recipient contains a special file');
  }};await walk(source);
 }return result;
}

export async function integrateFeature(casePath,{exportDirectory,recipe:recipePath,out}){
 const caseRoot=await realpath(resolve(casePath)),record=await readJson(join(caseRoot,'case.json'));
 const exportedRoot=await realpath(resolve(exportDirectory)),exported=await readJson(join(exportedRoot,'EXPORT.json'));
 if(record.schema!==1||exported.schema!==1||exported.caseId!==record.id||!inside(caseRoot,exportedRoot))throw Error('export does not belong to this investigation case');
 if(record.status!=='investigated')throw Error('investigate a matching feature before integration');
 if(record.route.selected!=='direct')throw Error('this integration recipe currently supports the direct transfer route');
 const recipeBytes=await readFile(resolve(recipePath)),recipe=validateRecipe(JSON.parse(recipeBytes));
 const original=await applicationRoot(record.recipient.path),donor=await applicationRoot(record.donor.path),dest=await newDestination(out,[caseRoot,original,donor]);
 const evidence=record.evidenceHashes??{};for(const [name,digest]of Object.entries(evidence)){
  if(!['donor.json','recipient.json','trace.json'].includes(name)||sha256(await readFile(await containedFile(caseRoot,'evidence/'+name)))!==digest)throw Error('case Evidence changed');
 }
 if(!Array.isArray(exported.files)||!exported.files.length||exported.files.length>256)throw Error('invalid feature export file list');
 const payload=[];const names=new Set();for(const f of exported.files){safeRelative(f.path);if(names.has(f.path)||!digestPattern.test(f.sha256))throw Error('invalid/duplicate export path');names.add(f.path);const file=await containedFile(exportedRoot,'files/'+f.path);if((await stat(file)).size>16*1024*1024)throw Error('exported file exceeds limit');const bytes=await readFile(file);if(sha256(bytes)!==f.sha256)throw Error('export file changed: '+f.path);payload.push({path:f.path,bytes,sha256:f.sha256});}
 if(!names.has(recipe.entry)||!names.has(recipe.oracle.module))throw Error('entry and oracle module must be included in the export');
 if(payload.reduce((n,f)=>n+f.bytes.length,0)>64*1024*1024)throw Error('export exceeds 64 MiB');
 const files=await sourceFiles(original),originalFiles=files.map(({path,sha256})=>({path,sha256}));
 const indexed=new Map(files.map(f=>[f.path,f]));
 // Bind the recipient working tree to its retained analysis where files were observed.
 for(const f of record.recipient.files??[]){const current=indexed.get(f.path);if(current&&current.sha256!==f.sha256)throw Error('recipient changed since analysis: '+f.path);}
 if(files.some(f=>f.path===recipe.mount||f.path.startsWith(recipe.mount+'/')||recipe.mount.startsWith(f.path+'/')))throw Error('feature mount collides with recipient content');
 for(const p of recipe.patches){const f=indexed.get(p.file);if(!f||f.sha256!==p.beforeSha256)throw Error('recipient patch base differs: '+p.file);
  const text=f.bytes.toString('utf8');if(!Buffer.from(text).equals(f.bytes))throw Error('patch source is not UTF-8 text');if(text.indexOf(p.find)<0||text.indexOf(p.find)!==text.lastIndexOf(p.find))throw Error('patch must match exactly once: '+p.file);
  f.bytes=Buffer.from(text.replace(p.find,()=>p.replace));f.sha256=sha256(f.bytes);
 }
 if(!indexed.has(recipe.recipient.module)&&!recipe.recipient.module.startsWith(recipe.mount+'/'))throw Error('recipient verification module is absent');
 // Give recovered .js files an explicit module context without altering their bytes.
 const packageFile=payload.find(f=>f.path==='package.json');if(packageFile){const pkg=JSON.parse(packageFile.bytes.toString());if((pkg.type??'commonjs')!==recipe.moduleType)throw Error('export package type differs from recipe');}
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 try{
  await mkdir(join(dest,'.modkit'),{mode:0o700});
  const write=async(base,f)=>{const target=join(base,f.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,f.bytes,{flag:'wx',mode:0o600});};
  for(const f of files)await write(join(dest,'app'),f);
  for(const f of payload){await write(join(dest,'app',recipe.mount),f);await write(join(dest,'.modkit','oracle'),f);}
  if(!packageFile)for(const base of [join(dest,'app',recipe.mount),join(dest,'.modkit','oracle')])await saveJson(join(base,'package.json'),{type:recipe.moduleType});
  await saveJson(join(dest,'.modkit','recipe.json'),recipe);
  const workspace={schema:1,id:randomUUID(),createdAt:new Date().toISOString(),caseId:record.id,casePath:caseRoot,feature:record.feature,route:'direct',status:'prepared',recipientSource:original,mount:recipe.mount,
   recipeSha256:sha256(await readFile(join(dest,'.modkit','recipe.json'))),exportManifestSha256:sha256(await readFile(join(exportedRoot,'EXPORT.json'))),originalFiles,
   baselineFiles:files.map(({path,sha256})=>({path,sha256})),featureFiles:payload.map(({path,sha256})=>({path,sha256})),moduleType:recipe.moduleType,
   skipped:['node_modules','.git','.modkit'],acceptance:{status:'not-run'},latestRun:null};
  await saveJson(join(dest,'.modkit','workspace.json'),workspace);return{directory:dest,...workspace};
 }catch(err){await rm(dest,{recursive:true,force:true});throw err;}
}
