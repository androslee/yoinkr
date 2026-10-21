// Source inspection reads only an explicit, hash-checked private export.
import {realpath,readFile,stat} from 'node:fs/promises';
import {resolve,posix} from 'node:path';
import {TraceMap,decodedMappings,originalPositionFor,traceSegment} from '@jridgewell/trace-mapping';
import {readCase} from './investigation.js';
import {safeRelative,summarizeEvidence} from './research.js';
import {inside,containedFile,sha256} from './workspace.js';
const digest=/^[a-f0-9]{64}$/;
const utf8=bytes=>{try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return text.includes('\0')?null:text;}catch{return null;}};
export async function loadSources(casePath,exportDirectory){
 const {root,record,evidence}=await readCase(casePath),directory=await realpath(resolve(exportDirectory));
 if(!inside(root,directory))throw Error('export must belong to the selected investigation case');
 const manifestFile=await containedFile(directory,'EXPORT.json');if((await stat(manifestFile)).size>4*1024*1024)throw Error('export manifest exceeds 4 MiB');const manifestBytes=await readFile(manifestFile);
 const manifest=JSON.parse(manifestBytes);
 if(manifest.schema!==1||manifest.caseId!==record.id||manifest.donorArtifact!==evidence.donor.normalized_result.root_artifact_sha256||manifest.donorArtifact!==record.donor.artifactSha256)throw Error('export case/artifact identity does not match retained Evidence');
 if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>256)throw Error('export requires 1 to 256 files');
 const known=new Map(summarizeEvidence(evidence.donor).files.map(f=>[f.path,f.sha256])),files=[],seen=new Set();let total=0;
 for(const entry of manifest.files){
  safeRelative(entry.path);if(entry.path.length>2000||seen.has(entry.path)||!digest.test(entry.sha256))throw Error('invalid/duplicate export file');seen.add(entry.path);
  const file=await containedFile(directory,'files/'+entry.path);if((await stat(file)).size>16*1024*1024)throw Error('export file exceeds 16 MiB');
  const bytes=await readFile(file);total+=bytes.length;if(total>64*1024*1024)throw Error('export exceeds 64 MiB');
  const hash=sha256(bytes),observed=known.get(entry.path);if(hash!==entry.sha256)throw Error('export file changed: '+entry.path);
  if(observed&&observed!==hash)throw Error('source differs from retained REA bytes: '+entry.path);
  if(entry.analysisBound===true&&!observed)throw Error('export claims analysis-bound source without retained file identity: '+entry.path);
  files.push({path:entry.path,sha256:hash,bytes:bytes.length,basis:observed?'analysis-bound':'extraction-only',text:utf8(bytes)});
 }
 return {caseId:record.id,directory,manifestSha256:sha256(manifestBytes),donorArtifact:manifest.donorArtifact,files};
}
function parseMap(file){
 if(file.text===null||file.bytes>4*1024*1024)throw Error('source map must be UTF-8 JSON under 4 MiB');
 const raw=JSON.parse(file.text);
 if(raw.version!==3||raw.sections||!Array.isArray(raw.sources)||raw.sources.length>256||!raw.sources.every(s=>typeof s==='string'&&s.length<=2000)||!Array.isArray(raw.names)||!raw.names.every(s=>typeof s==='string')||typeof raw.mappings!=='string'||raw.mappings.length>256*1024||raw.sourceRoot!==undefined&&typeof raw.sourceRoot!=='string'||raw.file!==undefined&&typeof raw.file!=='string')throw Error('unsupported/oversized source map (flat version 3 required)');
 if(raw.sourcesContent!==undefined&&(!Array.isArray(raw.sourcesContent)||raw.sourcesContent.length!==raw.sources.length||!raw.sourcesContent.every(s=>s===null||typeof s==='string')))throw Error('invalid embedded source contents');
 const map=new TraceMap(raw),lines=decodedMappings(map);let count=0;
 for(const line of lines)for(const seg of line){count++;if(count>50000)throw Error('source map exceeds 50000 mapping segments');if(![1,4,5].includes(seg.length)||!seg.every(n=>Number.isSafeInteger(n)&&n>=0)||seg.length>1&&(seg[1]>=raw.sources.length||seg.length===5&&seg[4]>=raw.names.length))throw Error('invalid source-map segment');}
 return {raw,map,lines};
}
const position=(line,column)=>{if(!Number.isSafeInteger(line)||line<1||line>10000000||!Number.isSafeInteger(column)||column<0||column>10000000)throw Error('line must be positive and column nonnegative (max 10000000)');};
export async function inspectSource(casePath,{exportDirectory,file,line=1,column=0,map:mapPath}={}){
 position(line,column);safeRelative(file);const sources=await loadSources(casePath,exportDirectory),source=sources.files.find(f=>f.path===file);if(!source)throw Error('file is not in the explicit export');
 const lines=source.text?.split('\n'),start=Math.max(0,line-11),end=Math.min(lines?.length??0,line+10);
 const result={caseId:sources.caseId,manifestSha256:sources.manifestSha256,path:file,sha256:source.sha256,bytes:source.bytes,basis:source.basis,binary:source.text===null,lineCount:lines?.length??null,requested:{line,column},excerpt:lines?lines.slice(start,end).map((text,i)=>({line:start+i+1,text:text.slice(0,4000),omittedCharacters:Math.max(0,text.length-4000)})):[],mapping:null};
 if(mapPath){safeRelative(mapPath);const mapFile=sources.files.find(f=>f.path===mapPath);if(!mapFile)throw Error('map is not in the explicit export');const {raw,map}=parseMap(mapFile);
  if(!associated(raw,mapPath,source))throw Error('map file field or local sourceMappingURL does not identify the selected generated file');
  const mapped=originalPositionFor(map,{line,column});let original=null;
  if(mapped.source!==null){const segment=traceSegment(map,line-1,column),sourceIndex=segment?.length>1?segment[1]:-1,text=raw.sourcesContent?.[sourceIndex];const originalLines=typeof text==='string'?text.split('\n'):null;
   original={...mapped,embedded:typeof text==='string',sha256:typeof text==='string'?sha256(Buffer.from(text)):null,basis:'source-map embedded text; not independently established original artifact bytes',excerpt:originalLines?originalLines.slice(Math.max(0,mapped.line-6),mapped.line+5).map((text,i)=>({line:Math.max(0,mapped.line-6)+i+1,text:text.slice(0,4000),omittedCharacters:Math.max(0,text.length-4000)})):[]};
  }
  result.mapping={mapPath,mapSha256:mapFile.sha256,status:original?'mapped':'unmapped',match:'greatest lower bound on the same generated line',original,note:'Source names are labels only. No URLs or filesystem paths are fetched; source-map claims are not behavioral proof.'};
 }
 return result;
}
function associated(raw,mapPath,source){
 if(typeof raw.file==='string'&&raw.file)return raw.file===source.path||posix.normalize(posix.join(posix.dirname(mapPath),raw.file))===source.path;
 const match=/(?:\/\/\s*[#@]\s*sourceMappingURL=([^\s]+)|\/\*\s*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\/)\s*$/.exec(source.text??'');
 const ref=match?.[1]??match?.[2];if(!ref||/^[a-z][a-z0-9+.-]*:|^[\/\\]|[?#]/i.test(ref))return false;
 let decoded;try{decoded=decodeURIComponent(ref);}catch{return false;}
 if(/^[a-z][a-z0-9+.-]*:|^[\/\\]|[?#]/i.test(decoded)||decoded.includes('\\'))return false;
 return posix.normalize(posix.join(posix.dirname(source.path),decoded))===mapPath;
}
export async function reportSources(casePath,exportDirectory){
 const sources=await loadSources(casePath,exportDirectory);let remaining=2*1024*1024;
 const preview=text=>{if(text===null)return {text:null,omittedCharacters:0};const shown=text.slice(0,Math.min(remaining,256*1024));remaining-=shown.length;return {text:shown,omittedCharacters:text.length-shown.length};};
 const files=sources.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes,basis:f.basis,...preview(f.text)})),maps=[];
 for(const file of sources.files.filter(f=>f.path.endsWith('.map'))){
  try{
   const {raw,map,lines}=parseMap(file),generated=sources.files.filter(f=>associated(raw,file.path,f));
   const originals=raw.sources.map((source,i)=>{const text=raw.sourcesContent?.[i]??null;return {label:map.resolvedSources[i]??source,declaredSource:source,sha256:text===null?null:sha256(Buffer.from(text)),basis:'source-map embedded text',...preview(text)};});
   maps.push({path:file.path,sha256:file.sha256,status:'decoded',generatedFiles:generated.map(f=>f.path),originals,lines,names:raw.names,note:'Flat v3 mapping claims from this exported map; originals are embedded text, not fetched or independently verified artifacts.'});
  }catch(error){maps.push({path:file.path,sha256:file.sha256,status:'unsupported',error:error.message});}
 }
 return {caseId:sources.caseId,manifestSha256:sources.manifestSha256,donorArtifact:sources.donorArtifact,files,maps,limits:{perFileCharacters:256*1024,totalCharacters:2*1024*1024},scope:'Explicit private export only; original bytes hash-checked; embedded map originals have separate provenance. No source execution or external fetch.'};
}
