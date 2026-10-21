// Read retained Evidence, add immutable follow-ups, and search local case notes.
// Never executes donor/recipient code or silently re-analyzes an installation.
import {readFile,stat,realpath,mkdir,writeFile,readdir} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {containedFile,inside,readJson,saveJson,sha256,newDestination} from './workspace.js';
import {runRea} from './rea.js';
const evidenceNames=['donor.json','recipient.json','trace.json'];
export async function readCase(casePath){
 const root=await realpath(resolve(casePath)),record=await readJson(await containedFile(root,'case.json'));
 if(record.schema!==1||typeof record.id!=='string'||!record.donor||!record.recipient)throw Error('unsupported investigation case');
 const evidence={};
 for(const name of evidenceNames){
  const expected=record.evidenceHashes?.[name];if(!/^[a-f0-9]{64}$/.test(expected??''))throw Error('missing retained Evidence hash: '+name);
  const file=await containedFile(root,'evidence/'+name);if((await stat(file)).size>64*1024*1024)throw Error('Evidence exceeds 64 MiB');
  const bytes=await readFile(file);if(sha256(bytes)!==expected)throw Error('retained Evidence changed: '+name);
  const envelope=JSON.parse(bytes);if(envelope.ok!==true||!envelope.data?.normalized_result?.graph)throw Error('invalid REA Evidence: '+name);
  const value=envelope.data,expectedId=name==='trace.json'?record.trace?.evidenceId:record[name.split('.')[0]]?.evidenceId;
  if(value.evidence_id!==expectedId)throw Error('case and Evidence identities differ: '+name);
  evidence[name.split('.')[0]]=value;
 }
 return {root,record,evidence};
}
export async function followupTrace(casePath,{side='donor',seed,seedKind='module',direction='outgoing'}={},backend=runRea){
 if(!['donor','recipient'].includes(side))throw Error('side must be donor or recipient');
 if(typeof seed!=='string'||!seed.trim()||seed.length>1000)throw Error('give a concrete seed up to 1000 characters');
 if(!['module','string','api','ipc','route','node-id','native-export'].includes(seedKind))throw Error('unsupported trace seed kind');
 if(!['incoming','outgoing','both'].includes(direction))throw Error('direction must be incoming, outgoing or both');
 const {root,record,evidence}=await readCase(casePath),parent=join(root,'followups');
 await mkdir(parent,{recursive:true,mode:0o700});if(!inside(root,await realpath(parent)))throw Error('follow-up directory escaped the case');
 const directory=join(parent,randomUUID());await mkdir(directory,{mode:0o700});
 const request={application:evidence[side],seed:{kind:seedKind==='ipc'?'channel':seedKind,value:seed,match:seedKind==='string'?'contains':'exact',case_sensitive:true},direction};
 await saveJson(join(directory,'request.json'),request);
 try{
  const trace=await backend(['trace-application-feature',join(directory,'request.json')],join(directory,'evidence.json'));
  const result=trace.normalized_result;if(!Array.isArray(result?.seed_matches)||!Array.isArray(result?.graph?.nodes))throw Error('unsupported REA trace contract');
  const output={schema:1,caseId:record.id,createdAt:new Date().toISOString(),side,direction,seed:request.seed,parentEvidenceId:evidence[side].evidence_id,parentEvidenceSha256:record.evidenceHashes[side+'.json'],evidenceId:trace.evidence_id,evidenceSha256:sha256(await readFile(join(directory,'evidence.json'))),requestSha256:sha256(await readFile(join(directory,'request.json'))),status:result.seed_matches.length?'traced':'no-matching-seed',seedMatches:result.seed_matches.length,nodes:result.graph.nodes.length,coverage:result.coverage??result.graph.coverage,limitations:[...(trace.limitations??[]),...(result.limitations??[])],note:'Retained static graph trace only; original case and export selections are unchanged.'};
  await saveJson(join(directory,'FOLLOWUP.json'),output);return {directory,...output};
 }catch(error){await writeFile(join(directory,'FAILED.txt'),error.message+'\n',{flag:'wx',mode:0o600});throw error;}
}
export async function searchNotes(directory,query,{limit=20,maxDirectories=2000,maxDepth=10}={}){
 if(typeof query!=='string'||!query.trim()||query.length>256)throw Error('give search text up to 256 characters');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('limit must be 1 to 100');
 const root=await realpath(resolve(directory)),pending=[{path:root,depth:0}],matches=[],warnings=[];let visited=0,truncated=false;
 const terms=query.toLowerCase().trim().split(/\s+/),skip=new Set(['node_modules','.git','backups','private','evidence','profiles','.browser-profile']);
 while(pending.length){
  if(visited++>=maxDirectories){truncated=true;break;}
  const {path,depth}=pending.shift();let entries;
  try{entries=await readdir(path,{withFileTypes:true});}catch(e){warnings.push({path,error:e.code??e.message});continue;}
  const names=new Set(entries.filter(e=>e.isFile()).map(e=>e.name));
  if(names.has('case.json')&&names.has('FIELD-NOTE.md')){
   try{
    const record=await readJson(await containedFile(root,path===root?'case.json':join(relative(root,path),'case.json')));
    const file=await containedFile(root,path===root?'FIELD-NOTE.md':join(relative(root,path),'FIELD-NOTE.md'));
    if((await stat(file)).size>1024*1024)throw Error('field note exceeds 1 MiB');
    const note=await readFile(file,'utf8'),text=[record.feature,record.route?.selected,record.donor?.artifactSha256,record.recipient?.artifactSha256,note].join('\n'),lower=text.toLowerCase();
    if(record.schema===1&&terms.every(t=>lower.includes(t))){
     const lines=note.split(/\r?\n/),line=lines.findIndex(l=>terms.some(t=>l.toLowerCase().includes(t)));
     matches.push({directory:path,caseId:record.id,feature:record.feature,route:record.route?.selected,donorArtifact:record.donor?.artifactSha256,recipientArtifact:record.recipient?.artifactSha256,noteLine:line<0?null:line+1,excerpt:line<0?String(record.feature??'').slice(0,300):lines.slice(Math.max(0,line-1),line+3).join('\n').slice(0,500),scope:'Local field-note text; not verified behavioral evidence.'});
     if(matches.length>=limit){truncated=true;break;}
    }
   }catch(e){warnings.push({path,error:e.message});}
  }
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(!entry.isDirectory()||skip.has(entry.name))continue;if(depth>=maxDepth){truncated=true;continue;}pending.push({path:join(path,entry.name),depth:depth+1});}
 }
 return {root,query,matches,visitedDirectories:Math.min(visited,maxDirectories),truncated,warnings};
}
const preview=value=>{const text=JSON.stringify(value,null,2)??'null';return text.length>65536?text.slice(0,65536)+'\n[Display truncated; full record remains in retained Evidence.]':text;};
export function graphView(graph){
 if(!Array.isArray(graph?.nodes))throw Error('unsupported graph');
 const nodes=graph.nodes.slice(0,4000).map(n=>({id:n.node_id,kind:n.kind,label:n.label??n.observations?.[0]?.label??n.node_id,path:n.identity?.module_path??n.observations?.map(o=>o.properties?.path??o.properties?.module_path).find(Boolean)??'',detail:preview(n),locations:[...(n.identity?.module_path&&n.identity?.source_range?[{source:n.identity.module_path,...n.identity.source_range}]:[]),...(n.observations??[]).map(o=>o.evidence?.location?.value).filter(l=>l?.kind==='source-range')].filter(l=>typeof l.source==='string'&&Number.isInteger(l.start?.line)&&l.start.line>0).slice(0,20)}));
 const edges=(graph.edges??graph.relations??[]).slice(0,16000).map(e=>({id:e.edge_id??e.relation_id,from:e.source_node_id,to:e.target_node_id,relation:e.relation,detail:preview(e)}));
 return {id:graph.graph_id,schema:graph.schema,nodes,edges,unknowns:(graph.unknowns??[]).slice(0,1000).map(preview),coverage:graph.coverage,limitations:graph.limitations??[],displayOmitted:{nodes:graph.nodes.length-nodes.length,edges:(graph.edges??graph.relations??[]).length-edges.length,unknowns:Math.max(0,(graph.unknowns??[]).length-1000)},totalNodes:graph.nodes.length,totalEdges:(graph.edges??graph.relations??[]).length};
}
export async function createCaseReport(casePath,out,{exportDirectory,historyLimit=8}={}){
 const {root,record,evidence}=await readCase(casePath),graphs=[];
 for(const side of ['donor','recipient','trace']){
  const e=evidence[side],r=e.normalized_result;graphs.push({sourceSide:side==='trace'?'donor':side,name:side+' application',evidenceId:e.evidence_id,...graphView(r.graph),limitations:[...(e.limitations??[]),...(r.limitations??[]),...(r.graph.limitations??[])]});
  if(r.semantic_graph)graphs.push({sourceSide:side,name:side+' semantic',evidenceId:e.evidence_id,...graphView(r.semantic_graph)});
 }
 const retainedHistory=await (await import('./queries.js')).caseHistory(casePath,{limit:historyLimit});
 const history={warnings:retainedHistory.warnings,displayOmitted:retainedHistory.displayOmitted,scope:retainedHistory.scope,items:[]};
 for(const entry of retainedHistory.entries){
  const item={type:entry.type,directory:entry.directory,status:entry.status,record:entry.record??null,detail:entry.detail??'',resultDetail:entry.evidence?preview(entry.evidence.normalized_result):'',resultRows:entry.type==='queries'&&entry.status==='verified-record'?(entry.evidence.normalized_result.rows??[]).slice(0,100).map(row=>({id:row.node_id,kind:row.kind,path:row.path!==undefined?row.path:row.properties?.path,observationId:row.observation_id,properties:JSON.stringify(row.properties??row.basis??row.identity??{}).slice(0,1000)})):[],graphIndex:null};
  if(entry.status==='verified-record'&&entry.type==='followups'){
   const e=entry.evidence,r=e.normalized_result;item.graphIndex=graphs.length;
   graphs.push({sourceSide:entry.record.side,name:'follow-up '+entry.record.side+' · '+entry.record.seed.value+' · '+entry.directory.split('/').at(-1).slice(0,8),evidenceId:e.evidence_id,...graphView(r.graph),limitations:[...(e.limitations??[]),...(r.limitations??[])]});
  }
  history.items.push(item);
 }
 const sources=exportDirectory?await (await import('./sources.js')).reportSources(casePath,exportDirectory):null;
 const examples=await (await import('./examples.js')).readExamples(casePath);
 const verification=await (await import('./replay.js')).readReplayRuns(casePath);
 const uiChecks=await (await import('./ui-checks.js')).readUIRuns(casePath);
 const data={uiChecks,verification,examples,history,sources,caseId:record.id,feature:record.feature,route:record.route,status:record.status,acceptance:record.acceptance,provider:record.provider,donor:record.donor,recipient:record.recipient,evidenceHashes:record.evidenceHashes,graphs};
 // No live source reads: an explicit export is the only source input. No source execution and no changes to original Evidence.
 const encoded=JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Buffer.byteLength(encoded)>24*1024*1024)throw Error('report display exceeds 24 MiB; select a smaller investigation');
 const assets=await Promise.all(['report.html','report.css','report.js'].map(name=>readFile(new URL('./report/'+name,import.meta.url),'utf8')));
 const digest=text=>Buffer.from(sha256(text),'hex').toString('base64');
 const csp="default-src 'none'; script-src 'sha256-"+digest(assets[2])+"'; style-src 'sha256-"+digest(assets[1])+"'; img-src data:; base-uri 'none'; form-action 'none'";
 const html=assets[0].replace('<!--CSP-->',()=>csp).replace('/*CSS*/',()=>assets[1]).replace('/*DATA*/',()=>encoded).replace('/*JS*/',()=>assets[2]);
 const protectedRoots=await Promise.all([record.donor.path,record.recipient.path].map(async p=>{try{return await realpath(p);}catch(e){if(e.code!=='ENOENT')throw e;return resolve(p);}}));
 const target=await newDestination(out,protectedRoots);
 // Keep all retained case metadata immutable, including when a custom filename is used.
 if(inside(join(root,'evidence'),target)||target===join(root,'case.json')||target===join(root,'FIELD-NOTE.md')||inside(join(root,'followups'),target)||inside(join(root,'queries'),target)||inside(join(root,'private'),target))throw Error('report output conflicts with case records');
 await mkdir(dirname(target),{recursive:true});
 await writeFile(target,html,{flag:'wx',mode:0o600});return {path:target,caseId:record.id,graphs:graphs.map(g=>({name:g.name,nodes:g.totalNodes,edges:g.totalEdges,displayOmitted:g.displayOmitted})),bytes:Buffer.byteLength(html),historyItems:history.items.length,historyOmitted:history.displayOmitted,sourceFiles:sources?.files.length??0,sourceMaps:sources?.maps.length??0,scope:'Offline view of hash-checked retained static Evidence; no new runtime or portability proof.'};
}
