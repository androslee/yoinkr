import {createHash} from 'node:crypto';
import {mkdir,stat,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve,sep} from 'node:path';
import {firefoxExecutable,portableFirefoxDirectory} from './firefox-path.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const local=join(root,'.local');
const firefox=process.env.YOINKR_FIREFOX||firefoxExecutable(portableFirefoxDirectory(local));
try{await stat(firefox);await stat(join(local,'demo','extension','manifest.json'));}catch{throw new Error('Build the example with an extracted Firefox directory first; see README.md.');}
const extension=join(local,'demo','extension');
const receipt=JSON.parse(await readFile(join(local,'demo','PROVENANCE.json')));
if(!receipt.outputHashes||Object.keys(receipt.outputHashes).length<6)throw new Error('Missing extension integrity receipt; rebuild the example.');
for(const [name,expected] of Object.entries(receipt.outputHashes)){
 const target=resolve(extension,name);
 if(!target.startsWith(extension+sep))throw new Error('Invalid extension receipt path.');
 if(createHash('sha256').update(await readFile(target)).digest('hex')!==expected)throw new Error('Extension changed since build: '+name+'; rebuild before launching.');
}
await mkdir(join(local,'profile'),{recursive:true});
const tool=join(root,'node_modules/web-ext/bin/web-ext.js');
const child=spawn(process.execPath,[tool,'run','--source-dir',join(local,'demo','extension'),'--firefox',firefox,'--firefox-profile',join(local,'profile'),'--keep-profile-changes','--no-reload','--no-input'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
