import {readFile,writeFile,mkdir,cp,rm,rename,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This build lane is Linux x86-64 only.');
const root=dirname(fileURLToPath(import.meta.url)),sdk=resolve(process.argv[2]||'/');
const recipe=JSON.parse(await readFile(join(root,'recipe.json')));
const upstream=join(root,'.local/upstream');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of recipe.files)if(sha(await readFile(join(upstream,file.path)))!==file.sha256)throw new Error('Original source integrity mismatch: '+file.path);
const qt=join(sdk,'usr/include/x86_64-linux-gnu/qt6'),lib=join(sdk,'usr/lib/x86_64-linux-gnu');
const includes=[join(sdk,'usr/include'),join(sdk,'usr/include/obs'),qt,...['QtCore','QtGui','QtWidgets'].map(name=>join(qt,name))];
const stage=join(root,'.local','build-'+randomUUID());await mkdir(stage,{recursive:true});
const commands=[];
function run(tool,args){commands.push([tool,...args]);return execFileSync(tool,args,{encoding:'utf8',timeout:60000,env:{...process.env,LD_LIBRARY_PATH:lib+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')}});}
try{
  await cp(join(root,'native'),join(stage,'source'),{recursive:true});
  await cp(join(root,'compat'),join(stage,'source/compat'),{recursive:true});
  await cp(upstream,join(stage,'source/donor'),{recursive:true});
  for(const name of ['recipe.json','acquire.mjs','build.mjs','launch.mjs','prepare.mjs','rollback.mjs','verify.mjs','README.md','package.json','preview.png','launch-obs.sh'])try{await cp(join(root,name),join(stage,'source/rebuild',name));}catch(error){if(error.code!=='ENOENT')throw error;}
  const source=join(stage,'source');
  const flags=['-std=c++17','-O2','-fPIC','-fvisibility=hidden','-Wno-deprecated-declarations',...includes.map(path=>'-I'+path),'-I'+join(source,'compat'),'-I'+join(source,'donor/libs/widgets'),'-I'+join(source,'donor/libs/pigment')];
  const objects=[];
  for(const name of ['KoTriangleColorSelector','KisColorSelectorInterface']){
    const moc=join(stage,name+'.moc.cpp');
    run(process.env.MOC||join(sdk,'usr/lib/qt6/libexec/moc'),[...flags.filter(flag=>flag.startsWith('-I')),join(source,'donor/libs/widgets',name+'.h'),'-o',moc]);
    for(const [file,suffix] of [[join(source,'donor/libs/widgets',name+'.cpp'),''],[moc,'-moc']]){
      const object=join(stage,name+suffix+'.o');run(process.env.CXX||'c++',[...flags,'-c',file,'-o',object]);objects.push(object);
    }
  }
  const object=join(stage,'annotation.o');run(process.env.CXX||'c++',[...flags,'-c',join(source,'annotation.cpp'),'-o',object]);objects.push(object);
  run(process.env.CXX||'c++',['-shared','-Wl,-z,defs',...objects,'-L'+lib,'-lobs','-lobs-frontend-api','-lQt6Widgets','-lQt6Gui','-lQt6Core','-o',join(stage,'yoinkr-krita-ink.so')]);
  const files={};
  async function record(directory,prefix=''){for(const item of await readdir(directory,{withFileTypes:true})){const relative=prefix+item.name;if(item.isDirectory())await record(join(directory,item.name),relative+'/');else files[relative]=sha(await readFile(join(directory,item.name)));}}
  await record(source);
  await writeFile(join(stage,'BUILD.json'),JSON.stringify({schema:1,kind:'yoinkr-krita-obs',recipe,files,moduleSha256:sha(await readFile(join(stage,'yoinkr-krita-ink.so'))),compiler:run(process.env.CXX||'c++',['--version']).split('\n')[0],commands,nativeAcceptance:'not implied by build; run verify.mjs',scope:'Original Krita Qt widget and base class unchanged; RGB compatibility boundary; new OBS renderer and drawing engine.'},null,2)+'\n');
  await rm(join(root,'.local/build'),{recursive:true,force:true});await rename(stage,join(root,'.local/build'));
  console.log('Built .local/build/yoinkr-krita-ink.so; complete source and input hashes retained.');
}finally{await rm(stage,{recursive:true,force:true});}
