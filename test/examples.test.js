import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,symlink,readdir} from 'node:fs/promises';import {join} from 'node:path';
import {tempDir} from './helpers.js';import {sha256} from '../src/workspace.js';
import {validateExample,validatePNG,screenshotBytes,saveExample,readExamples} from '../src/examples.js';
const png=await readFile(new URL('./fixtures/screenshot.png',import.meta.url));
const example={title:'Format topic payload',steps:['Select a topic','Choose JSON view'],expected:'Indented object',observation:'',outcome:'planned',side:'donor'};
export async function fixture(){const root=tempDir();await mkdir(join(root,'evidence'));const hashes={};for(const side of ['donor','recipient','trace']){const text=JSON.stringify({ok:true,data:{evidence_id:side,normalized_result:{graph:{nodes:[]}}}});hashes[side+'.json']=sha256(text);await writeFile(join(root,'evidence',side+'.json'),text);}await writeFile(join(root,'case.json'),JSON.stringify({schema:1,id:'case',feature:'Feature',donor:{evidenceId:'donor'},recipient:{evidenceId:'recipient'},trace:{evidenceId:'trace'},evidenceHashes:hashes}));return root;}
test('observable examples require bounded ordered actions and explicit manual observation outcomes',()=>{
 assert.equal(validateExample(example),example);
 for(const patch of [{title:''},{steps:[]},{steps:Array(33).fill('x')},{steps:[{}]},{expected:''},{observation:null},{side:'remote'},{outcome:'passed'},{outcome:'observed-match'},{outcome:'blocked'},{out:'elsewhere'},{title:'x'.repeat(201)}])assert.throws(()=>validateExample({...example,...patch}));
 assert.ok(validateExample({...example,outcome:'observed-difference',observation:'Raw text instead of JSON'}));
});
test('PNG attachments validate format, CRC, size and canonical base64',()=>{
 assert.deepEqual(validatePNG(png),{width:2,height:2,bytes:png.length,sha256:sha256(png)});assert.ok(screenshotBytes(png.toString('base64')).equals(png));assert.equal(screenshotBytes(undefined),undefined);
 for(const bytes of [Buffer.from('<svg onload="alert(1)">'),Buffer.alloc(4*1024*1024+1),png.subarray(0,png.length-4),Buffer.concat([png,Buffer.from('trailing')])])assert.throws(()=>validatePNG(bytes));
 const damaged=Buffer.from(png);damaged[35]^=1;assert.throws(()=>validatePNG(damaged),/checksum/);
 for(const b of ['data:image/png;base64,AA==','!bad','AB==','A==='])assert.throws(()=>screenshotBytes(b));
});
test('saved examples and screenshots retain hashes and parent identities without changing case acceptance',async()=>{
 const root=await fixture(),before=await readFile(join(root,'case.json'),'utf8');
 assert.equal((await readExamples(root)).total,0);
 const a=await saveExample(root,example,{screenshot:png}),b=await saveExample(root,{...example,title:'Recipient difference',side:'recipient',outcome:'observed-difference',observation:'Formatting differs'});
 assert.notEqual(a.directory,b.directory);const result=await readExamples(root);assert.equal(result.items.length,2);assert.equal(result.warnings.length,0);
 const item=result.items.find(i=>i.title===example.title);assert.equal(item.screenshot.dataURL,'data:image/png;base64,'+png.toString('base64'));assert.equal(item.provenance.parentCaseSha256,sha256(before));assert.equal(item.evidenceLevel,'user-recorded-example');assert.equal(await readFile(join(root,'case.json'),'utf8'),before);
 const metadata=await readExamples(root,{includeImages:false});assert.equal(metadata.items.find(i=>i.screenshot).screenshot.dataURL,undefined);assert.equal((await readExamples(root,{limit:0})).omitted,2);
});
test('changed example, screenshot or parent bytes are reported rather than presented as valid observations',async()=>{
 for(const change of ['example','screenshot','parent']){
  const root=await fixture(),saved=await saveExample(root,example,{screenshot:png});
  if(change==='example')await writeFile(join(saved.directory,'example.json'),'{}');
  else if(change==='screenshot')await writeFile(join(saved.directory,'screenshot.png'),Buffer.from('bad'));
  else await writeFile(join(root,'case.json'),(await readFile(join(root,'case.json'),'utf8'))+'\n');
  const result=await readExamples(root);assert.equal(result.items.length,0);assert.equal(result.warnings.length,1);
 }
});
test('example and screenshot symlinks cannot read or write outside the case',async()=>{
 const root=await fixture(),outside=tempDir();await symlink(outside,join(root,'examples'));await assert.rejects(saveExample(root,example),/escaped/);assert.deepEqual(await readdir(outside),[]);await assert.rejects(readExamples(root),/escaped/);
 const next=await fixture(),saved=await saveExample(next,example,{screenshot:png});const {unlink}=await import('node:fs/promises');await unlink(join(saved.directory,'screenshot.png'));await writeFile(join(outside,'image.png'),png);await symlink(join(outside,'image.png'),join(saved.directory,'screenshot.png'));assert.equal((await readExamples(next)).warnings.length,1);
});
