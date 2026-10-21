// Local preview launcher; requires a prepared workspace. Never selects a normal profile.
import {readFile,mkdir,writeFile,realpath,lstat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
const workspace=await realpath(resolve(process.argv[2])),suffix=(process.env.YOINKR_PROFILE_SUFFIX??process.env.MODKIT_PROFILE_SUFFIX)??'demo';if(!/^[a-zA-Z0-9_-]{1,24}$/.test(suffix))throw Error('Invalid lab profile name');
const state=JSON.parse(await readFile(join(workspace,'.modkit-playbook/state.json')));if(!['applied','rolled-back'].includes(state.status))throw Error('Invalid workspace status');
// Self-contained launch guard for generated copies; authoritative apply/rollback uses the playbook engine.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bookBytes=await readFile(join(workspace,'.modkit-playbook/playbook.json'));if(digest(bookBytes)!==state.playbookSha256)throw Error('Playbook changed; activation refused');
const book=JSON.parse(bookBytes),runtime=await realpath(join(workspace,'runtime'));if(book.target.app!=='resources/app'||book.files.length>256)throw Error('Invalid launch binding');
const binding=JSON.parse(await readFile(join(workspace,'../ADAPTER.json')));if(binding.adapter!==book.id||binding.recipe.files.length!==6)throw Error('Invalid adapter identity');
const expected=new Map(binding.recipe.files.map(f=>[f.path,f.sha256]));for(const f of book.files)expected.set('resources/app/'+f.file,state.status==='applied'?f.afterSha256:f.beforeSha256);
for(const [name,hash] of expected){const file=resolve(runtime,name),rel=relative(runtime,file);if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||!rel)throw Error('Invalid launch path');let info;try{info=await lstat(file)}catch(e){if(e.code!=='ENOENT')throw e}if(hash===null){if(info)throw Error('Unexpected restored asset: '+name);continue}if(!info?.isFile()||info.isSymbolicLink()||info.size>256*1024*1024)throw Error('Missing/non-ordinary launch file: '+name);const canonical=await realpath(file),contained=relative(runtime,canonical);if(isAbsolute(contained)||contained==='..'||contained.startsWith('../')||digest(await readFile(file))!==hash)throw Error('Runtime drift; activation refused: '+name);}
const base=join(workspace,'p',suffix),user=join(base,'profile');await mkdir(user,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH'].includes(k)));
env.YOINKR_JOPLIN_PROFILE=user;env.MODKIT_JOPLIN_PROFILE=user;
const child=spawn(join(workspace,'runtime/joplin'),['--profile',user,'--user-data-dir='+join(user,'electron'),'--safe-mode',...process.argv.slice(3)],{env,stdio:'inherit'});
child.once('error',e=>{console.error(e.message);process.exitCode=1});child.once('exit',code=>process.exitCode=code??1);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
