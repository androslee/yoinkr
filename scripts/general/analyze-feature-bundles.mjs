import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecoveryRecipe} from '../../src/feature-package.js';
import {containedFile,newDestination,sha256} from '../../src/workspace.js';
import {runRea} from '../../src/rea.js';
const flags={};for(let i=2;i<process.argv.length;i+=2){if(!['--donor','--out','--recipe'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --donor <original donor build> --out <new analysis directory> [--recipe <recipe>]');flags[process.argv[i].slice(2)]=process.argv[i+1];}
if(!flags.donor||!flags.out)throw Error('--donor and --out required');
const r=validateRecoveryRecipe(JSON.parse(await readFile(flags.recipe??fileURLToPath(new URL('../../recipes/mqtt-raw-diff/recipe.json',import.meta.url))))),donor=await realpath(flags.donor),out=await newDestination(flags.out,[donor]);
await mkdir(out,{recursive:false});await mkdir(join(out,'inputs'));
const inputs=[];for(const path of r.bundleFiles){const bytes=await readFile(await containedFile(donor,path));if(sha256(bytes)!==r.inputs.find(f=>f.path===path)?.sha256)throw Error('Pinned bundle changed: '+path);const name=path.split('/').at(-1);if(inputs.includes(name))throw Error('Duplicate bundle basename');inputs.push(name);await writeFile(join(out,'inputs',name),bytes,{flag:'wx',mode:0o600});}
await writeFile(join(out,'inputs/package.json'),JSON.stringify({name:'yoinkr-original-bundle-analysis',private:true}),{flag:'wx'});
const result=await runRea(['analyze-javascript-application',join(out,'inputs'),...inputs.flatMap(n=>['--source-path',n]),'--max-semantic-nodes','1500','--max-semantic-nodes-per-file','750','--max-semantic-unknowns','1500','--max-semantic-unknowns-per-file','750','--analysis-timeout-ms','25000','--max-heap-mb','1024'],join(out,'REA.json'),{timeoutMs:65000});
const summary={evidenceId:result.evidence_id,statistics:result.normalized_result.statistics,limitations:result.normalized_result.limitations};await writeFile(join(out,'SUMMARY.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
