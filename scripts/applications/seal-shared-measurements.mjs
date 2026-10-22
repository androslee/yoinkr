/** Append-only post-run index. Does not claim a before-run method snapshot. */
import {readFile,mkdir,readdir,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {containedFile,sha256,saveJson} from '../../src/workspace.js';
if(process.argv.length!==3)throw Error('Use seal-shared-measurements.mjs <completed measurement root>');
const out=await realpath(process.argv[2]);const result=JSON.parse(await readFile(await containedFile(out,'RESULT.json')));if(!['passed','failed'].includes(result.status))throw Error('Invalid measurement result');
const files=['scripts/applications/benchmark-shared-feature.mjs','src/feature-drivers/common.js','src/feature-drivers/donor.js','src/feature-drivers/minimal.js','src/feature-drivers/vscode.js','src/feature-verify.js','recipes/mqtt-shared-acceptance/suite.json'];
await mkdir(join(out,'method-snapshot'));
for(const name of files){const source=fileURLToPath(new URL('../../'+name,import.meta.url));await mkdir(join(out,'method-snapshot',name,'..'),{recursive:true});await writeFile(join(out,'method-snapshot',name),await readFile(source),{flag:'wx'})}
await saveJson(join(out,'METHOD.json'),{schema:1,scope:'Post-run snapshot of currently installed method, not a pre-run attestation. Do not edit driver/benchmark sources between measurement and sealing. POLICY-BEFORE-RUN.json was written before measurements.',files});
const names=['RESULT.json','POLICY-BEFORE-RUN.json','PARTIAL-OBSERVATIONS.json','METHOD.json',...(await readdir(out)).filter(n=>n.endsWith('.expected-failure.json')||['MODULE.json','PERFORMANCE.json','donor-optional-save.bin'].includes(n)),...files.map(n=>'method-snapshot/'+n)];
const index=[];for(const path of names){const b=await readFile(await containedFile(out,path));index.push({path,sha256:sha256(b),bytes:b.length})}await saveJson(join(out,'INTEGRITY.json'),{schema:1,files:index,scope:'Post-run append-only index; no existing artifact rewritten.'});console.log(JSON.stringify({status:'sealed',measurementStatus:result.status,files:index.length}));
