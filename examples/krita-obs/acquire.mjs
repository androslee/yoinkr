import {readFile, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const recipe=JSON.parse(await readFile(join(root,'recipe.json')));
const destination=join(root,'.local','upstream');
await mkdir(destination,{recursive:true});
for(const file of recipe.files){
  const target=join(destination,file.path);
  try { if(createHash('sha256').update(await readFile(target)).digest('hex')===file.sha256)continue; }catch{}
  const response=await fetch(`https://raw.githubusercontent.com/KDE/krita/${recipe.commit}/${file.path}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Source download failed: ${response.status} ${file.path}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Source integrity mismatch: ${file.path}`);
  await mkdir(dirname(target),{recursive:true});
  const temporary=target+'.download';
  try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,target);}finally{await rm(temporary,{force:true});}
}
console.log(`Verified Krita ${recipe.version} sources at ${destination}`);
