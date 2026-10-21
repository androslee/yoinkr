import test from 'node:test';import assert from 'node:assert/strict';import {writeFile,readFile,symlink,stat} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {validateUIRecipe,inspectUIRecipe,sameUIRegistration} from '../src/ui-recipe.js';import {runUICheck,readUIRuns} from '../src/ui-checks.js';import {uiFixture} from './ui-fixture.js';import {tempDir} from './helpers.js';
test('UI recipe grammar permits typed actions and assertions, not executable code or arbitrary paths',async()=>{
 const {recipe}=await uiFixture();assert.equal(validateUIRecipe(recipe),recipe);for(const steps of [[],[{action:'eval',selector:'body',value:'evil'}],[{action:'upload',selector:'#file',file:'../secret'}],[{action:'click',selector:'button'}],[{action:'assert',selector:'x',property:'text',expected:4}],[{action:'assert',selector:'x',property:'count',expected:-1}],[{action:'assert',selector:'x',property:'visible',expected:'true'}]])assert.throws(()=>validateUIRecipe({...recipe,steps}));assert.throws(()=>validateUIRecipe({...recipe,target:{root:'x',entry:'http://evil'}}));assert.throws(()=>validateUIRecipe({...recipe,stepTimeoutMs:99999}));
});
test('registration hashes exact local target and fixture files and refuses escaping input symlinks',async()=>{
 const f=await uiFixture();f.recipe.steps.unshift({action:'upload',selector:'#file',file:'input.txt'});await writeFile(f.recipePath,JSON.stringify(f.recipe));const a=await inspectUIRecipe(f.recipePath);assert.equal(a.files.length,2);assert.ok(sameUIRegistration(a,await inspectUIRecipe(f.recipePath)));await symlink('/etc/passwd',join(f.app,'escape'));await assert.rejects(inspectUIRecipe(f.recipePath),/symlinks/);
});
test('changed registered recipes and target files cannot be executed silently',async()=>{
 const f=await uiFixture(),registration=await inspectUIRecipe(f.recipePath);await writeFile(join(f.app,'index.html'),'changed');await assert.rejects(runUICheck(registration,{playwrightModule:'missing'}),/changed/);await assert.rejects(stat(join(f.casePath,'ui-checks')),/ENOENT/);
});
test('browser setup errors retain a failed run, snapshots and diagnostics rather than claiming UI success',async()=>{
 const f=await uiFixture(),before=await readFile(join(f.casePath,'case.json'),'utf8'),r=await runUICheck(await inspectUIRecipe(f.recipePath),{playwrightModule:'yoinkr-intentionally-missing-playwright'});assert.equal(r.passed,false);assert.match(r.failure,/Cannot find/);assert.equal(r.steps.length,0);assert.equal((await readUIRuns(f.casePath)).items.length,1);assert.equal(await readFile(join(f.casePath,'case.json'),'utf8'),before);
});
test('retained UI snapshot tampering becomes a warning and output symlinks cannot escape the case',async()=>{
 const f=await uiFixture(),r=await runUICheck(await inspectUIRecipe(f.recipePath),{playwrightModule:'yoinkr-missing-test-module'});await writeFile(join(r.directory,'inputs/app/index.html'),'changed');const result=await readUIRuns(f.casePath);assert.equal(result.items.length,0);assert.match(result.warnings[0].error,/snapshot input changed/);
 const b=await uiFixture();await symlink(tempDir(),join(b.casePath,'ui-checks'));await assert.rejects(runUICheck(await inspectUIRecipe(b.recipePath)),/escaped/);await assert.rejects(readUIRuns(b.casePath),/escaped/);
});
test('hung UI workers are stopped by an overall deadline while preserving a failed result',async()=>{
 const f=await uiFixture(),module=join(f.root,'hung.mjs');await writeFile(module,'setInterval(()=>{},1000);await new Promise(()=>{});');const start=Date.now(),r=await runUICheck(await inspectUIRecipe(f.recipePath),{playwrightModule:pathToFileURL(module).href,timeoutMs:1000});assert.equal(r.passed,false);assert.match(r.failure,/deadline|exited/);assert.ok(Date.now()-start<6000);
});
