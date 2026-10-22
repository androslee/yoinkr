import {readFile,writeFile,mkdir,cp,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {buildFeaturePackage,validateRecoveryRecipe,verifyFeaturePackage} from '../../src/feature-package.js';
import {sha256} from '../../src/workspace.js';
const flags={};for(let i=2;i<process.argv.length;i+=2){if(!['--donor','--source','--out','--evidence','--recipe'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --donor <build> --source <checkout> --evidence <REA.json> --out <new proof directory>');flags[process.argv[i].slice(2)]=process.argv[i+1];}
for(const k of ['donor','source','out','evidence'])if(!flags[k])throw Error('--'+k+' required');
const out=resolve(flags.out),recipePath=flags.recipe??fileURLToPath(new URL('../../recipes/mqtt-raw-diff/recipe.json',import.meta.url)),recipe=validateRecoveryRecipe(JSON.parse(await readFile(recipePath)));
await mkdir(out,{recursive:false});const packages={},checks=[];
for(const route of ['source','bundle']){
 packages[route]=[];
 for(let i=1;i<=2;i++){const temporary=i===2?await mkdtemp(join(tmpdir(),'yoinkr-recovery-repro-')):null;const directory=temporary?join(temporary,'package'):join(out,route+'-'+i);const p=await buildFeaturePackage(recipePath,{donorRoot:flags.donor,sourceRoot:flags.source,out:directory,route,evidence:route==='bundle'?[flags.evidence]:[]});let retained=directory;if(temporary){retained=join(out,'different-depth',route+'-'+i);await mkdir(dirname(retained),{recursive:true});await cp(directory,retained,{recursive:true});await rm(temporary,{recursive:true});}packages[route].push({directory:retained,...p});}
 assert.equal(packages[route][0].digest,packages[route][1].digest);checks.push(route+': identical package digest across two builds');
}
const hashPayload=async name=>sha256(await readFile(join(out,name,'payload/feature.js')));
assert.equal(await hashPayload('source-1'),await hashPayload('bundle-1'));checks.push('Source and bundle paths compile to identical runtime payload');
const negative=[];
async function refused(name,fn,pattern){let error;try{await fn()}catch(e){error=e.message}assert.match(error??'',pattern,name);negative.push({name,error});}
const alteredSource=join(out,'negative-source');await mkdir(alteredSource);for(const f of recipe.files){const target=join(alteredSource,f.path);await mkdir(dirname(target),{recursive:true});await cp(join(flags.source,f.path),target)}
await writeFile(join(alteredSource,recipe.files[0].path),'tampered source');
await refused('Changed recovered source',()=>buildFeaturePackage(recipePath,{donorRoot:flags.donor,sourceRoot:alteredSource,out:join(out,'must-not-build-source')}),/source hash differs/);
const cache=join(out,'negative-cache');await mkdir(cache);for(const f of recipe.inputs){const target=join(cache,f.path);await mkdir(dirname(target),{recursive:true});await cp(join(flags.donor,f.path),target)}
const lock=join(cache,'MODKIT-NPM-LOCKS/renderer.json'),lockBytes=await readFile(lock);await writeFile(lock,'{}');
await refused('Changed effective dependency lock',()=>buildFeaturePackage(recipePath,{donorRoot:cache,sourceRoot:flags.source,out:join(out,'must-not-build-lock')}),/Pinned donor input changed/);await writeFile(lock,lockBytes);
await refused('Missing cached runtime dependencies',()=>buildFeaturePackage(recipePath,{donorRoot:cache,sourceRoot:flags.source,out:join(out,'must-not-build-deps')}),/Could not resolve|undeclared external dependency/);
await refused('Missing bundled-module Evidence',()=>buildFeaturePackage(recipePath,{donorRoot:flags.donor,out:join(out,'must-not-build-evidence'),route:'bundle'}),/Missing matching REA/);
const missingRecipe={...recipe,bundleFiles:[recipe.bundleFiles[0]]},missingPath=join(out,'missing-chunk-recipe.json');await writeFile(missingPath,JSON.stringify(missingRecipe));
await refused('Required lazy output file omitted',()=>buildFeaturePackage(missingPath,{donorRoot:flags.donor,out:join(out,'must-not-build-chunk'),route:'bundle'}),/Missing recovered source\/module/);
const unsupportedRecipe=structuredClone(recipe),unsupportedName=unsupportedRecipe.bundleFiles[1];await writeFile(join(cache,unsupportedName),'/* unsupported production layout */');unsupportedRecipe.inputs.find(f=>f.path===unsupportedName).sha256=sha256(await readFile(join(cache,unsupportedName)));const unsupportedPath=join(out,'unsupported-recipe.json');await writeFile(unsupportedPath,JSON.stringify(unsupportedRecipe));
await refused('Unsupported real-input bundle layout',()=>buildFeaturePackage(unsupportedPath,{donorRoot:cache,out:join(out,'must-not-build-layout'),route:'bundle'}),/Unsupported bundle layout/);
// Package modification tests use the actual compiled package and its externally retained digest.
const mutable=join(out,'negative-package');await cp(packages.source[0].directory,mutable,{recursive:true});
for(const file of ['originals/'+recipe.files[0].path,'locks/renderer.json','TRANSFORMS.json']){const target=join(mutable,file),before=await readFile(target);await writeFile(target,'changed');await refused('Tampered '+file,()=>verifyFeaturePackage(mutable,{expectedDigest:packages.source[0].digest}),/changed/);await writeFile(target,before)}
await rm(join(mutable,'payload/index.html'));await refused('Missing runtime asset',()=>verifyFeaturePackage(mutable),/index.html/);
await rm(alteredSource,{recursive:true});await rm(cache,{recursive:true});await rm(mutable,{recursive:true});
const result={schema:1,status:'passed',packages,checks,negative,compilerPayloadSha256:await hashPayload('source-1'),notes:['Source and bundle package digests differ because provenance differs; their runtime payloads must match.','No network acquisition or donor code execution during recovery.','Browser scenario checks are a separate command.']};await writeFile(join(out,'REPRODUCIBILITY.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
