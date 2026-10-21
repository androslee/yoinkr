// Investigation cases combine REA Evidence with Universal-Modder-style route,
// provenance and a private working set. No source/recipient execution here.
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {readFile,writeFile,mkdir,realpath,stat,rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {runRea,reaInfo} from './rea.js';
import {readEntryBuffer} from './asar.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const inside=(root,path)=>{const rel=relative(root,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'));};
export function safeRelative(path){
 if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.includes(':')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('expected a relative artifact path without traversal');return path;
}
export async function applicationRoot(path){
 const root=await realpath(resolve(path)),s=await stat(root);if(s.isFile()){if(!root.endsWith('.asar'))throw Error('this first REA workflow accepts JS directories or .asar archives');return root;}
 // Accept both installed app roots and extracted JS projects.
 for(const rel of ['resources/app.asar','resources/app','Contents/Resources/app.asar','Contents/Resources/app']){
  const p=join(root,rel);try{await stat(p);return realpath(p);}catch{}
 }
 return root;
}
export function summarizeEvidence(e){
 const r=e.normalized_result;if(r?.graph?.schema!=='JavaScriptApplicationGraph')throw Error('unsupported REA application Evidence contract');
 const files=new Map();
 for(const node of r.graph.nodes)for(const o of node.observations??[]){const p=o.properties?.path;if(p&&o.evidence?.artifact?.sha256)files.set(p,{path:p,sha256:o.evidence.artifact.sha256,kind:node.kind});}
 return {evidenceId:e.evidence_id,artifactSha256:r.root_artifact_sha256,graphId:r.graph.graph_id,coverage:r.graph.coverage,summary:r.summary,files:[...files.values()],limitations:[...(e.limitations??[]),...(r.limitations??[])]};
}
export const ROUTES={
 direct:'Extract an isolated donor module and its dependencies; integrate its existing behavior in the recipient.',
 convert:'Extract selected donor assets/data and convert them to recipient formats with a local converter.',
 bridge:'Keep donor behavior in a separate process/service and connect the recipient through an explicit contract.',
 rebuild:'Recover the donor behavior from Evidence and reproduce it in the recipient runtime; compare outputs.',
 undecided:'Inspect the feature closure, side effects and recipient APIs before choosing a route.'
};
export async function investigate({donor,recipient,feature,seed,seedKind='module',out,route='undecided',donorSources=[],recipientSources=[]},backend=runRea){
 if(typeof feature!=='string'||!feature.trim()||feature.length>1000)throw Error('give a feature description (up to 1000 characters)');
 if(typeof seed!=='string'||!seed.trim()||seed.length>1000)throw Error('give a concrete module/string/API/IPC trace seed');
 if(!['module','string','api','ipc','route','node-id','native-export'].includes(seedKind))throw Error('unsupported trace seed kind');
 if(!Object.hasOwn(ROUTES,route))throw Error('unknown transfer route');
 const a=await applicationRoot(donor),b=await applicationRoot(recipient),dest=resolve(out);
 // Never put a growing analysis case inside either analyzed directory.
 if(dest===a||dest===b||inside(a,dest)||inside(b,dest))throw Error('case output must be outside donor and recipient');
 for(const p of [...donorSources,...recipientSources])safeRelative(p);
 await mkdir(dirname(dest),{recursive:true});const caseDir=await realpath(dirname(dest));if(caseDir===a||caseDir===b||inside(a,caseDir)||inside(b,caseDir))throw Error('case parent resolves inside an application');
 await mkdir(dest,{mode:0o700}); // Fail if a case already exists; never overwrite evidence.
 try{
  const evidence=join(dest,'evidence');await mkdir(evidence,{mode:0o700});
  const args=(path,sources)=>['analyze-javascript-application',path,'--analysis-timeout-ms','30000','--max-heap-mb','512',...sources.flatMap(p=>['--source-path',p])];
  const donorEvidence=await backend(args(a,donorSources),join(evidence,'donor.json'));
  const recipientEvidence=await backend(args(b,recipientSources),join(evidence,'recipient.json'));
  const request={application:donorEvidence,seed:{kind:seedKind==='ipc'?'channel':seedKind,value:seed,match:seedKind==='string'?'contains':'exact',case_sensitive:true},direction:'outgoing'};
  const requestPath=join(evidence,'trace-request.json');await json(requestPath,request);
  const trace=await backend(['trace-application-feature',requestPath],join(evidence,'trace.json'));
  const tr=trace.normalized_result;if(!tr?.graph?.nodes||!Array.isArray(tr.seed_matches))throw Error('unsupported REA trace contract');
  const ds=summarizeEvidence(donorEvidence),rs=summarizeEvidence(recipientEvidence),known=new Map(ds.files.map(f=>[f.path,f]));
  const tracedPaths=[...new Set(tr.graph.nodes.flatMap(n=>(n.observations??[]).map(o=>o.properties?.path).filter(p=>p&&known.has(p))))].sort();
  const record={schema:1,id:randomUUID(),createdAt:new Date().toISOString(),feature,provider:{name:'REA',version:reaInfo().version,upstream:reaInfo().upstream},donor:{path:a,...ds},recipient:{path:b,...rs},seed:request.seed,route:{selected:route,description:ROUTES[route],alternatives:ROUTES},
   trace:{evidenceId:trace.evidence_id,seedMatches:tr.seed_matches.length,files:tracedPaths,coverage:tr.coverage,nativeHandoffs:tr.native_handoffs??[],limitations:tr.limitations??[]},
   scope:{donorSources,recipientSources},status:tr.seed_matches.length?'investigated':'no-matching-seed',acceptance:{status:'not-run',note:'Static graph reachability is not proof of behavioral equivalence.'},
   evidenceHashes:Object.fromEntries(await Promise.all(['donor.json','recipient.json','trace.json'].map(async f=>[f,hash(await readFile(join(evidence,f)))])))};
  await json(join(dest,'case.json'),record);
  await writeFile(join(dest,'REPORT.md'),`# ${feature.replace(/[\r\n]/g,' ')}\n\nREA ${record.provider.version}; route: ${route}. Status: ${record.status}.\n\nDonor: ${a}\nRecipient: ${b}\n\n## Traced files\n\n${tracedPaths.map(p=>'- '+p).join('\n')||'No concrete files matched; choose a more precise seed.'}\n\n## Transfer routes\n\n${Object.entries(ROUTES).map(([k,v])=>'- '+k+': '+v).join('\n')}\n\n## Evidence\n\nComplete upstream analysis and feature trace are retained in evidence/. case.json records hashes, source identities, native handoffs, coverage and limitations. Follow unresolved IPC/native dependencies before attempting direct transfer.\n\n## Acceptance\n\nNot run. Define donor inputs/actions and expected outputs, then compare the recipient behavior. Exporting files alone is not a working feature transplant.\n`,{flag:'wx',mode:0o600});
  await writeFile(join(dest,'FIELD-NOTE.md'),`# Field note: ${feature.replace(/[\r\n]/g,' ')}\n\nCase: ${record.id}\nREA: ${record.provider.version}\nDonor artifact: ${ds.artifactSha256}\nRecipient artifact: ${rs.artifactSha256}\nRoute: ${route}\n\n## Findings and unknowns\n\nSee case.json and retained Evidence.\n\n## Integration steps\n\nPending. Record the actual host changes, format conversions or bridge contract.\n\n## Verification\n\nStatic investigation only. Add exact commands, versions, pass/fail evidence and rollback after a real run.\n\n## Gotchas\n\nRecord symptom, cause and verified fix for the next investigation.\n`,{flag:'wx',mode:0o600});
  return record;
 }catch(err){await writeFile(join(dest,'FAILED.txt'),'Investigation incomplete: '+err.message+'\n',{mode:0o600}).catch(()=>{});throw err;}
}
export async function exportFeature(casePath,{files=[],traced=false}={}){
 const root=await realpath(resolve(casePath)),record=JSON.parse(await readFile(join(root,'case.json'),'utf8'));
 if(record.schema!==1)throw Error('unsupported investigation case');
 for(const [f,digest] of Object.entries(record.evidenceHashes??{}))if(!['donor.json','recipient.json','trace.json'].includes(f)||hash(await readFile(join(root,'evidence',f)))!==digest)throw Error('case Evidence changed; investigate again');
 const selected=[...new Set([...(traced?record.trace.files:[]),...files])];if(!selected.length)throw Error('select --traced or explicit --file paths');
 if(selected.length>256)throw Error('export is limited to 256 selected files; choose a smaller feature');
 const donor=await applicationRoot(record.donor.path),isArchive=(await stat(donor)).isFile(),known=new Map(record.donor.files.map(f=>[f.path,f]));
 const contents=[];let total=0;
 for(const name of selected){safeRelative(name);let bytes;
  if(isArchive)bytes=readEntryBuffer(donor,name,16*1024*1024);
  else {const path=await realpath(join(donor,name));if(!inside(donor,path))throw Error('selected path escapes donor');const s=await stat(path);if(!s.isFile()||s.size>16*1024*1024)throw Error('selected file is not a bounded ordinary file');bytes=await readFile(path);}
  if(bytes===null)throw Error('selected archive entry is missing or unpacked: '+name);
  const digest=hash(bytes),expected=known.get(name)?.sha256;if(expected&&digest!==expected)throw Error('donor file changed since REA analysis: '+name);
  total+=bytes.length;if(total>64*1024*1024)throw Error('export exceeds 64 MiB');
  contents.push({path:name,bytes,sha256:digest,analysisBound:!!expected});
 }
 const dest=join(root,'private','export-'+randomUUID());await mkdir(dirname(dest),{recursive:true,mode:0o700});
 if(!inside(root,await realpath(dirname(dest))))throw Error('private export directory escaped the case');
 await mkdir(dest,{mode:0o700});
 try{
  for(const f of contents){const to=join(dest,'files',f.path);await mkdir(dirname(to),{recursive:true,mode:0o700});await writeFile(to,f.bytes,{flag:'wx',mode:0o600});}
  const manifest={schema:1,caseId:record.id,feature:record.feature,donor:record.donor.path,donorArtifact:record.donor.artifactSha256,route:record.route.selected,status:'extracted-not-integrated',files:contents.map(({bytes,...rest})=>rest),
   notes:['Original donor bytes retained locally; no destination application was modified.','analysisBound=false means the selected asset was not represented in the REA file graph; its hash records extraction-time bytes only.','Selected files are a working set, not proof of complete dependencies, portability or runtime equivalence.']};
  await json(join(dest,'EXPORT.json'),manifest);return{directory:dest,...manifest};
 }catch(err){await rm(dest,{recursive:true,force:true});throw err;}
}
