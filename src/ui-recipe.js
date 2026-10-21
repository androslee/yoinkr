import {realpath,readFile,readdir,lstat,stat} from 'node:fs/promises';import {resolve,join,dirname} from 'node:path';import {readCase} from './investigation.js';import {safeRelative} from './research.js';import {inside,containedFile,sha256} from './workspace.js';
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw Error('unsupported UI recipe fields');};
export function validateUIRecipe(r){
 exact(r,['schema','title','casePath','target','steps','stepTimeoutMs']);if(r.schema!==1||typeof r.title!=='string'||!r.title.trim()||r.title.length>200||typeof r.casePath!=='string')throw Error('UI recipe needs schema 1, title and casePath');
 exact(r.target,['root','entry']);if(typeof r.target.root!=='string')throw Error('target root required');safeRelative(r.target.entry);if(!r.target.entry.endsWith('.html'))throw Error('UI entry must be local HTML');
 if(!Array.isArray(r.steps)||!r.steps.length||r.steps.length>32)throw Error('UI recipe needs 1 to 32 steps');if(r.stepTimeoutMs!==undefined&&(!Number.isInteger(r.stepTimeoutMs)||r.stepTimeoutMs<100||r.stepTimeoutMs>5000))throw Error('step deadline must be 100–5000 ms');
 let assertions=0;for(const s of r.steps){exact(s,['action','selector','value','file','property','expected','match']);if(!['click','fill','select','upload','assert'].includes(s.action)||typeof s.selector!=='string'||!s.selector||s.selector.length>300)throw Error('unsupported UI action or selector');
  const allowed={click:['action','selector'],fill:['action','selector','value'],select:['action','selector','value'],upload:['action','selector','file'],assert:['action','selector','property','expected','match']}[s.action];exact(s,allowed);
  if(['fill','select'].includes(s.action)&&(typeof s.value!=='string'||s.value.length>4000))throw Error('UI value must be bounded text');if(s.action==='upload')safeRelative(s.file);
  if(s.action==='assert'){assertions++;if(!['text','value','count','visible'].includes(s.property)||!['equals','contains'].includes(s.match??'equals'))throw Error('unsupported UI assertion');if(['text','value'].includes(s.property)){if(typeof s.expected!=='string'||s.expected.length>1000)throw Error('text assertion needs expected text');}else if(s.match==='contains'||s.property==='count'&&(!Number.isInteger(s.expected)||s.expected<0||s.expected>10000)||s.property==='visible'&&typeof s.expected!=='boolean')throw Error('invalid count/visibility assertion');}
 }
 if(!assertions)throw Error('UI recipe needs an observable assertion');if(Buffer.byteLength(JSON.stringify(r))>32768)throw Error('UI recipe exceeds 32 KiB');return r;
}
export async function inspectUIRecipe(path){
 const file=await realpath(resolve(path));if((await stat(file)).size>32768)throw Error('UI recipe exceeds 32 KiB');const bytes=await readFile(file),recipe=validateUIRecipe(JSON.parse(bytes)),base=dirname(file),casePath=await realpath(resolve(base,recipe.casePath)),{record}=await readCase(casePath),target=await realpath(resolve(base,recipe.target.root));if(!(await stat(target)).isDirectory())throw Error('target must be an ordinary directory');
 const files=[];let total=0,entriesSeen=0;
 async function add(root,name,kind){const full=await containedFile(root,name),s=await stat(full);if(s.size>4*1024*1024||total+s.size>16*1024*1024||files.length>=128)throw Error('UI inputs exceed file/size limits');const content=await readFile(full);total+=content.length;files.push({kind,path:name,source:full,bytes:content.length,sha256:sha256(content)});}
 async function walk(dir,prefix=''){for(const item of await readdir(dir,{withFileTypes:true})){if(++entriesSeen>512)throw Error('UI target exceeds directory entry limit');const name=prefix?prefix+'/'+item.name:item.name;safeRelative(name);const s=await lstat(join(dir,item.name));if(s.isSymbolicLink())throw Error('UI target contains symlinks');if(s.isDirectory())await walk(join(dir,item.name),name);else if(s.isFile())await add(target,name,'app');else throw Error('UI target contains a special file');}}
 await walk(target);if(!files.some(f=>f.kind==='app'&&f.path===recipe.target.entry))throw Error('UI entry is absent');
 for(const name of new Set(recipe.steps.filter(s=>s.action==='upload').map(s=>s.file)))await add(base,name,'fixture');
 files.sort((a,b)=>(a.kind+'/'+a.path).localeCompare(b.kind+'/'+b.path));
 return {path:file,title:recipe.title,casePath,caseId:record.id,recipe,recipeSha256:sha256(bytes),parentCaseSha256:sha256(await readFile(await containedFile(casePath,'case.json'))),target,files};
}
export function sameUIRegistration(a,b){return a.recipeSha256===b.recipeSha256&&a.parentCaseSha256===b.parentCaseSha256&&a.target===b.target&&a.casePath===b.casePath&&JSON.stringify(a.files)===JSON.stringify(b.files);}
