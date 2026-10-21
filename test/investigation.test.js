import test from 'node:test';import assert from 'node:assert/strict';
import {join} from 'node:path';import {writeFile,mkdir,readFile,symlink,access,rm} from 'node:fs/promises';
import {tempDir} from './helpers.js';import {sha256} from '../src/workspace.js';
import {readCase,followupTrace,searchNotes,createCaseReport,graphView} from '../src/investigation.js';
async function fixture(){
 const root=tempDir(),donor=tempDir(),recipient=tempDir();await mkdir(join(root,'evidence'));
 const graph={schema:'JavaScriptApplicationGraph',graph_id:'g',nodes:[{node_id:'n1',kind:'javascript-module',observations:[{label:'format.js',properties:{path:'format.js'},source_map_reference:{source:'original.ts'},evidence:{location:{value:{source:'format.js',start:{line:1,column:0}}}}}]},{node_id:'n2',kind:'import',observations:[{label:'helper.js'}]}],edges:[{edge_id:'e1',source_node_id:'n1',target_node_id:'n2',relation:'imports'}],coverage:{status:'partial'}};
 const evidenceHashes={},ids={donor:'ev_donor',recipient:'ev_recipient',trace:'ev_trace'};
 for(const side of ['donor','recipient','trace']){const bytes=JSON.stringify({ok:true,data:{evidence_id:ids[side],normalized_result:{graph,seed_matches:[],limitations:['Dynamic imports unknown']}}});await writeFile(join(root,'evidence',side+'.json'),bytes);evidenceHashes[side+'.json']=sha256(bytes);}
 const record={schema:1,id:'case1',feature:'formatter </script><script>window.bad=1</script>',provider:{version:'test'},donor:{path:donor,evidenceId:ids.donor,artifactSha256:'artifactA'},recipient:{path:recipient,evidenceId:ids.recipient},trace:{evidenceId:ids.trace},route:{selected:'direct'},status:'investigated',acceptance:{status:'not-run'},evidenceHashes};await writeFile(join(root,'case.json'),JSON.stringify(record));await writeFile(join(root,'FIELD-NOTE.md'),'# Formatter\n\nFix: circular import requires explicit module import.\nVerified only on fixture revision.\n');return {root,donor,recipient,record,graph};
}
test('retained case identity and every source Evidence hash are validated before browsing',async()=>{const f=await fixture();assert.equal((await readCase(f.root)).record.id,'case1');await writeFile(join(f.root,'evidence','recipient.json'),'tampered');await assert.rejects(readCase(f.root),/Evidence changed/);});
test('case readers refuse absent hashes, identity mismatch and external Evidence symlinks',async()=>{
 const f=await fixture();const record={...f.record,evidenceHashes:{...f.record.evidenceHashes}};delete record.evidenceHashes['donor.json'];await writeFile(join(f.root,'case.json'),JSON.stringify(record));await assert.rejects(readCase(f.root),/missing retained/);
 record.evidenceHashes=f.record.evidenceHashes;record.trace={evidenceId:'different'};await writeFile(join(f.root,'case.json'),JSON.stringify(record));await assert.rejects(readCase(f.root),/identities differ/);
 const g=await fixture();const file=join(tempDir(),'outside.json');await writeFile(file,'{}');await rm(join(g.root,'evidence','donor.json'));await symlink(file,join(g.root,'evidence','donor.json'));await assert.rejects(readCase(g.root),/escaped/);
});
test('follow-up reuses exact retained parent, keeps the original case immutable and retains output hashes',async()=>{
 const f=await fixture(),before=await readFile(join(f.root,'case.json'),'utf8');let calls=0;
 const backend=async(args,out)=>{calls++;assert.equal(args[0],'trace-application-feature');const r=JSON.parse(await readFile(args[1],'utf8'));assert.equal(r.application.evidence_id,'ev_recipient');assert.equal(r.seed.kind,'channel');assert.equal(r.direction,'incoming');const result={evidence_id:'ev_followup',normalized_result:{graph:f.graph,seed_matches:[{node_id:'n1'}],coverage:{status:'partial'}}};await writeFile(out,JSON.stringify({ok:true,data:result}));return result;};
 const result=await followupTrace(f.root,{side:'recipient',seed:'mqtt:publish',seedKind:'ipc',direction:'incoming'},backend);assert.equal(calls,1);assert.equal(result.status,'traced');assert.equal(result.parentEvidenceId,'ev_recipient');assert.equal(await readFile(join(f.root,'case.json'),'utf8'),before);assert.equal(result.evidenceSha256,sha256(await readFile(join(result.directory,'evidence.json'))));
});
test('follow-up invalid options and escaping output are refused without invoking REA',async()=>{
 const f=await fixture(),backend=()=>{throw Error('must not run');};for(const options of [{seed:'x',side:'trace'},{seed:'x',direction:'elsewhere'},{seed:'x',seedKind:'script'},{}])await assert.rejects(followupTrace(f.root,options,backend),/side|direction|seed/);
 await symlink(tempDir(),join(f.root,'followups'));await assert.rejects(followupTrace(f.root,{seed:'x'},backend),/escaped/);
});
test('failed and unmatched follow-ups are retained without declaring successful integration',async()=>{
 const f=await fixture();await assert.rejects(followupTrace(f.root,{seed:'x'},async()=>{throw Error('provider unavailable');}),/provider unavailable/);const {readdir}=await import('node:fs/promises');const [id]=await readdir(join(f.root,'followups'));assert.match(await readFile(join(f.root,'followups',id,'FAILED.txt'),'utf8'),/provider unavailable/);
 const result=await followupTrace(f.root,{seed:'x'},async(args,out)=>{const result={evidence_id:'ev_none',normalized_result:{graph:f.graph,seed_matches:[]}};await writeFile(out,JSON.stringify(result));return result;});assert.equal(result.status,'no-matching-seed');
});
test('field-note search finds AND terms, reports locations, and handles a case as search root',async()=>{
 const f=await fixture();const result=await searchNotes(f.root,'circular import');assert.equal(result.matches.length,1);assert.equal(result.matches[0].noteLine,3);assert.equal(result.matches[0].donorArtifact,'artifactA');assert.match(result.matches[0].scope,/not verified/);assert.equal((await searchNotes(f.root,'not-present')).matches.length,0);await assert.rejects(searchNotes(f.root,''),/search text/);await assert.rejects(searchNotes(f.root,'x',{limit:0}),/limit/);
});
test('note search skips symlink directories and reports bounds or malformed case warnings',async()=>{
 const f=await fixture(),search=tempDir();await symlink(f.root,join(search,'linked'));assert.equal((await searchNotes(search,'formatter')).matches.length,0);await mkdir(join(search,'bad'));await writeFile(join(search,'bad','case.json'),'invalid');await writeFile(join(search,'bad','FIELD-NOTE.md'),'formatter');assert.equal((await searchNotes(search,'formatter')).warnings.length,1);assert.equal((await searchNotes(search,'formatter',{maxDirectories:1})).truncated,true);
});
test('offline report escapes embedded data, restricts active content and refuses overwrite/source outputs',async()=>{
 const f=await fixture(),out=join(tempDir(),'report.html');const report=await createCaseReport(f.root,out),html=await readFile(out,'utf8');assert.equal(report.graphs.length,3);assert.ok(html.includes('\\u003c/script\\u003e'));assert.ok(!html.includes('<script>window.bad=1'));assert.match(html,/default-src 'none'/);assert.match(html,/sha256-/);assert.match(html,/original.ts/);assert.match(html,/Dynamic imports unknown/);await assert.rejects(createCaseReport(f.root,out),/EEXIST/);await assert.rejects(createCaseReport(f.root,join(f.donor,'report.html')),/outside/);await assert.rejects(createCaseReport(f.root,join(f.root,'evidence','report.html')),/conflicts/);await assert.rejects(access(join(f.donor,'report.html')));
});
test('graph display caps are explicit and separate from upstream coverage',()=>{const g={nodes:Array.from({length:4001},(_,i)=>({node_id:String(i),kind:'x'})),edges:[],unknowns:Array(1001).fill({reason:'unknown'}),coverage:{status:'partial'}};const result=graphView(g);assert.equal(result.nodes.length,4000);assert.deepEqual(result.displayOmitted,{nodes:1,edges:0,unknowns:1});assert.equal(result.coverage.status,'partial');});
