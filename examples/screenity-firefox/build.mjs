import {readFile, mkdir, cp, writeFile, stat, rename, rm, readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {build} from 'esbuild';
import {firefoxExecutable,portableFirefoxDirectory} from './firefox-path.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const recipe=JSON.parse(await readFile(join(root,'recipe.json')));
const upstream=join(root,'.local','upstream');
// Verify every input before writing output; never build from silently changed originals.
for(const file of recipe.files){
  const bytes=await readFile(join(upstream,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Source integrity mismatch: ${file.path}`);
}
const local=join(root,'.local');
const stage=join(local,`stage-${randomUUID()}`);
await mkdir(stage,{recursive:true});
try{
  await cp(join(root,'extension'),join(stage,'extension'),{recursive:true});
  const sourceEntry=await readFile(join(root,'extension','studio.js'),'utf8');
  const entry=sourceEntry.replaceAll('SCREENITY_SOURCE',join(upstream,'src/pages/Content/canvas').replaceAll('\\','/'));
  await build({stdin:{contents:entry,resolveDir:root,sourcefile:'studio.js',loader:'js'},bundle:true,format:'iife',platform:'browser',target:['firefox128'],outfile:join(stage,'extension','studio.bundle.js'),legalComments:'eof',minify:false});
  await rm(join(stage,'extension','studio.js'));
  await cp(upstream,join(stage,'source','screenity'),{recursive:true});
  await cp(join(root,'extension'),join(stage,'source','yoinkr','extension'),{recursive:true});
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(upstream,name),join(stage,'extension',name));
  for(const name of ['acquire.mjs','build.mjs','launch.mjs','firefox-path.mjs','recipe.json','package.json','package-lock.json','README.md'])await cp(join(root,name),join(stage,'source','yoinkr',name));
  const outputHashes={};for(const name of await readdir(join(stage,'extension')))outputHashes[name]=createHash('sha256').update(await readFile(join(stage,'extension',name))).digest('hex');
  await writeFile(join(stage,'PROVENANCE.json'),JSON.stringify({...recipe,outputHashes,generatedAt:new Date().toISOString(),originalFilesUnmodified:true,changes:['New Firefox MV3 background script and action','New recording studio uses original PenTool, ArrowTool, ShapeTool, TextTool, SelectTool and History','New getDisplayMedia/canvas MediaRecorder capture backend','No original Screenity cloud/auth/telemetry or Chrome capture code included']},null,2)+'\n');
  await rm(join(local,'demo'),{recursive:true,force:true});
  await rename(stage,join(local,'demo'));
}finally{await rm(stage,{recursive:true,force:true});}
if(process.argv[2]){
  const supplied=resolve(process.argv[2]);
  if(!(await stat(supplied)).isDirectory())throw new Error('Supply the EXTRACTED Firefox application directory, not an installer or launcher script.');
  if(process.platform==='darwin'&&!supplied.endsWith('.app'))throw new Error('On macOS, supply the Firefox application bundle, for example /Applications/Firefox.app.');
  await stat(firefoxExecutable(supplied));
  const destination=portableFirefoxDirectory(local);
  try{await stat(destination);console.log('Keeping existing portable Firefox copy.');}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    await mkdir(dirname(destination),{recursive:true});
    // Keep symlinks as symlinks inside a macOS bundle so its code signature stays valid.
    await cp(supplied,destination,process.platform==='darwin'?{recursive:true,verbatimSymlinks:true}:{recursive:true,dereference:true});
  }
}
console.log('Built .local/demo with original sources, license, provenance and Firefox extension.');
console.log('Run npm start. Pass an extracted Firefox directory to build.mjs to create a portable browser copy.');
