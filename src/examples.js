// Human-authored observable examples, kept separate from automated acceptance.
import {mkdir,readFile,readdir,realpath,rm,stat} from 'node:fs/promises';
import {validateReplay} from './replay-input.js';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readCase} from './investigation.js';
import {inside,containedFile,readJson,saveJson,sha256} from './workspace.js';
const outcomes=['planned','observed-match','observed-difference','blocked'];
const maxPNG=4*1024*1024,maxExamples=64;
export function validateExample(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('example object required');
 if(Object.keys(input).some(k=>!['title','steps','expected','observation','outcome','side','replay'].includes(k)))throw Error('unsupported example field');
 if(Object.hasOwn(input,'replay'))validateReplay(input.replay);
 const text=(v,name,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(name+' must be nonempty text up to '+max+' characters');return v;};
 text(input.title,'title',200);text(input.expected,'expected result',4000);
 if(!Array.isArray(input.steps)||!input.steps.length||input.steps.length>32)throw Error('give 1 to 32 ordered action steps');
 input.steps.forEach(s=>text(s,'action step',500));
 if(!outcomes.includes(input.outcome))throw Error('unsupported example outcome');
 if(!['donor','recipient','both'].includes(input.side))throw Error('side must be donor, recipient or both');
 if(typeof input.observation!=='string'||input.observation.length>4000)throw Error('observation must be text up to 4000 characters');
 if(input.outcome!=='planned'&&!input.observation.trim())throw Error('an observed outcome needs an observation');
 if(Buffer.byteLength(JSON.stringify(input))>32768)throw Error('example text exceeds 32 KiB');
 return input;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
export function validatePNG(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>maxPNG||bytes.length<57||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('screenshot must be a PNG up to 4 MiB');
 let pos=8,chunks=0,width,height,data=false,end=false;
 while(pos<bytes.length){
  if(++chunks>2048||pos+12>bytes.length)throw Error('invalid PNG chunks');
  const n=bytes.readUInt32BE(pos),type=bytes.toString('latin1',pos+4,pos+8),next=pos+12+n;
  if(next>bytes.length||!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(pos+4,pos+8+n))!==bytes.readUInt32BE(pos+8+n))throw Error('invalid PNG chunk or checksum');
  if(chunks===1){
   if(type!=='IHDR'||n!==13)throw Error('PNG must start with IHDR');width=bytes.readUInt32BE(pos+8);height=bytes.readUInt32BE(pos+12);
   if(!width||!height||width>8192||height>8192||width*height>16000000)throw Error('PNG dimensions exceed limits');
  }else if(type==='IHDR')throw Error('duplicate PNG header');
  if(type==='acTL')throw Error('animated PNG screenshots are not supported');
  if(type==='IDAT')data=true;
  if(type==='IEND'){if(n!==0||!data||next!==bytes.length)throw Error('invalid PNG end');end=true;}
  pos=next;
 }
 if(!end)throw Error('incomplete PNG');return {width,height,bytes:bytes.length,sha256:sha256(bytes)};
}
export function screenshotBytes(base64){
 if(base64===undefined||base64==='')return undefined;
 if(typeof base64!=='string'||base64.length>Math.ceil(maxPNG/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('invalid screenshot base64');
 const bytes=Buffer.from(base64,'base64');if(bytes.toString('base64')!==base64)throw Error('invalid screenshot base64');validatePNG(bytes);return bytes;
}
export async function saveExample(casePath,input,{screenshot}={}){
 validateExample(input);const image=screenshot?validatePNG(screenshot):null;
 const {root,record}=await readCase(casePath),parent=join(root,'examples');
 await mkdir(parent,{recursive:true,mode:0o700});if(!inside(root,await realpath(parent)))throw Error('examples directory escaped case');
 if((await readdir(parent)).length>=maxExamples)throw Error('case has reached 64 examples');
 const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID(),directory=join(parent,id);await mkdir(directory,{mode:0o700});
 try{
  const example={schema:1,id,caseId:record.id,createdAt:new Date().toISOString(),...input,screenshot:image?{...image,path:'screenshot.png'}:null,evidenceLevel:'user-recorded-example'};
  if(screenshot){const {writeFile}=await import('node:fs/promises');await writeFile(join(directory,'screenshot.png'),screenshot,{flag:'wx',mode:0o600});}
  await saveJson(join(directory,'example.json'),example);
  await saveJson(join(directory,'record.json'),{schema:1,id,caseId:record.id,exampleSha256:sha256(await readFile(join(directory,'example.json'))),parentCaseSha256:sha256(await readFile(await containedFile(root,'case.json'))),parentEvidenceHashes:record.evidenceHashes});
  return {directory,...example,note:'Human-recorded example only; original case acceptance and automatic verification are unchanged.'};
 }catch(e){await rm(directory,{recursive:true,force:true});throw e;}
}
export async function readExamples(casePath,{limit=16,includeImages=true,ids}={}){
 if(!Number.isInteger(limit)||limit<0||limit>32)throw Error('example limit must be 0 to 32');
 if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>16||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(id))))throw Error('select 1 to 16 example IDs');
 const {root,record}=await readCase(casePath),parent=join(root,'examples'),warnings=[],items=[];
 let entries;try{if(!inside(root,await realpath(parent)))throw Error('examples directory escaped case');entries=await readdir(parent,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return {items,warnings,total:0,omitted:0};throw e;}
 const dirs=entries.filter(e=>e.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name));
 let imageBytes=0;
 const caseSha=sha256(await readFile(await containedFile(root,'case.json')));
 for(const entry of entries.filter(e=>e.isSymbolicLink()))warnings.push({id:entry.name,error:'symlink example ignored'});
 for(const entry of dirs.filter(e=>ids===undefined||ids.includes(e.name)).slice(0,Math.min(limit,maxExamples))){
  try{
   const dir=await realpath(join(parent,entry.name));if(!inside(parent,dir))throw Error('example escaped root');
   const manifest=await readJson(await containedFile(dir,'record.json')),file=await containedFile(dir,'example.json');
   if((await stat(file)).size>40000)throw Error('example exceeds limit');const bytes=await readFile(file),example=JSON.parse(bytes);
   if(manifest.schema!==1||example.schema!==1||example.id!==entry.name||manifest.id!==entry.name||example.caseId!==record.id||manifest.caseId!==record.id||example.evidenceLevel!=='user-recorded-example'||sha256(bytes)!==manifest.exampleSha256||manifest.parentCaseSha256!==caseSha||JSON.stringify(manifest.parentEvidenceHashes)!==JSON.stringify(record.evidenceHashes))throw Error('example identity, hash or parent binding changed');
   const {title,steps,expected,observation,outcome,side,replay}=example;validateExample({title,steps,expected,observation,outcome,side,...(replay===undefined?{}:{replay})});
   let screenshot=null;
   if(example.screenshot){
    if(example.screenshot.path!=='screenshot.png')throw Error('invalid screenshot path');
    const pngFile=await containedFile(dir,'screenshot.png');if((await stat(pngFile)).size>maxPNG)throw Error('screenshot exceeds limit');
    const png=await readFile(pngFile),info=validatePNG(png);
    if(info.sha256!==example.screenshot.sha256||info.width!==example.screenshot.width||info.height!==example.screenshot.height||info.bytes!==example.screenshot.bytes)throw Error('screenshot hash or dimensions changed');
    const embed=includeImages&&imageBytes+png.length<=8*1024*1024;if(embed)imageBytes+=png.length;
    screenshot={...info,...(embed?{dataURL:'data:image/png;base64,'+png.toString('base64')}:{imageOmitted:includeImages?'Report screenshot budget exceeded; original remains in the case.':'Image data not requested.'})};
   }
   items.push({...example,screenshot,provenance:manifest});
  }catch(e){warnings.push({id:entry.name,error:e.message});}
 }
 return {items,warnings,total:dirs.length,omitted:Math.max(0,dirs.length-dirs.filter(e=>ids===undefined||ids.includes(e.name)).slice(0,Math.min(limit,maxExamples)).length),scope:'Human-authored plans and observations, not automated behavioral acceptance. Hashes bind records and screenshots to this case snapshot.'};
}
