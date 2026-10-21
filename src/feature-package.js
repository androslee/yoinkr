/** Recovered renderer packages. No donor code is executed during extraction. */
import {readFile,writeFile,mkdir,readdir,stat,realpath,rm} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';
import {sha256,containedFile,newDestination,inside,readJson} from './workspace.js';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const path=z.string().min(1).max(240).refine(n=>!n.startsWith('/')&&!n.split('/').some(p=>p==='..'||p==='.'||!p)&&!/[\\:\x00]/.test(n),'Expected a safe relative path');
const recipeSchema=z.object({schema:z.literal(1),kind:z.literal('recovered-feature-recipe'),id:z.literal('mqtt-raw-diff'),revision:z.string().regex(/^[a-f0-9]{40}$/),bundleLayout:z.literal('webpack5-eval-source-map-single-source-v1'),bundleFiles:z.array(path).min(1).max(8),inputs:z.array(z.object({path,sha256:hash}).strict()).min(3).max(16),files:z.array(z.object({path,sha256:hash}).strict()).min(1).max(64),patches:z.array(z.object({path,find:z.string().min(1).max(4096),replace:z.string().max(4096),count:z.number().int().min(1).max(8),reason:z.string().min(1)}).strict()).max(16),boundaries:z.array(z.object({path,adapter:path,reason:z.string().min(1)}).strict()).max(16),limits:z.object({payloadBytes:z.literal(131072),historyMessages:z.literal(64)}).strict(),capabilities:z.object({required:z.array(z.literal('clipboard.writeText')).length(1),optional:z.array(z.string()).length(0)}).strict(),scope:z.object({recovered:z.array(z.string()),adaptations:z.array(z.string()),excluded:z.array(z.string())}).strict()}).strict();
export const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function validateRecoveryRecipe(value) {
 const r=recipeSchema.parse(value),names=[...r.files.map(f=>f.path),...r.boundaries.map(b=>b.path)];
 if(new Set(names).size!==names.length)throw Error('Duplicate recovered/boundary path');
 if(new Set(r.bundleFiles).size!==r.bundleFiles.length)throw Error('Duplicate bundle path');
 return r;
}
async function bytesAt(root,name,max=32*1024*1024){const file=await containedFile(root,name);if((await stat(file)).size>max)throw Error('Input exceeds bounded size: '+name);return readFile(file);}

/** Only the pinned webpack development eval+inline-map layout. No eval/VM. */
export function recoverWebpackModules(bytes,{wanted}) {
 if(bytes.length>32*1024*1024)throw Error('Bundle exceeds 32 MiB');
 const text=bytes.toString('utf8');
 if(!text.includes('webpack')||!text.includes('eval-source-map'))throw Error('Unsupported bundle layout: require webpack5 eval-source-map with embedded original sources');
 const pattern=/\/\*\*\*\/ "([^"\n]+)":\n\/\*\*\*\/ \(([^\n]+) => \{\n(.*?)\n\/\*\*\*\/ \}\)/gs;
 const found=new Map();
 for(const match of text.matchAll(pattern)) {
  const id=match[1];if(!wanted.includes(id))continue;
  if(found.has(id))throw Error('Duplicate webpack module: '+id);
  const wrapper=match[2];
  if(wrapper!=='(__unused_webpack_module, __webpack_exports__, __webpack_require__)')throw Error('Unsupported webpack wrapper bindings: '+id);
  const evalMatch=/^\s*"use strict";\s*eval\(("(?:[^"\\]|\\.)*")\);\s*$/s.exec(match[3]);
  if(!evalMatch)throw Error('Unsupported webpack module body: '+id);
  const body=JSON.parse(evalMatch[1]);
  if(/__webpack_require__\.(?:e|u|l|f)\s*\(|\bimport\s*\(/.test(body))throw Error('Unsupported lazy dependency in selected webpack module: '+id);
  const maps=[...body.matchAll(/sourceMappingURL=data:application\/json[^,\n]*,([A-Za-z0-9+/=]+)/g)];
  if(maps.length!==1)throw Error('Missing/ambiguous embedded source map: '+id);
  const map=JSON.parse(Buffer.from(maps[0][1],'base64').toString());
  if(map.version!==3||map.sources?.length!==1||map.sourcesContent?.length!==1||typeof map.sourcesContent[0]!=='string'||typeof map.mappings!=='string')throw Error('Unsupported source map: '+id);
  const expected=id.startsWith('./')?id.slice(2):id;
  if(!decodeURIComponent(map.sources[0]).split('?')[0].endsWith('/'+expected))throw Error('Source map identity differs from module: '+id);
  // Validate the retained mappings using the same trace-mapping library as source inspection.
  const trace=new TraceMap(map);originalPositionFor(trace,{line:1,column:0});
  const calls=[...body.matchAll(/__webpack_require__\(("(?:[^"\\]|\\.)*")\)/g)].map(m=>JSON.parse(m[1]));
  const unmatched=body.replace(/__webpack_require__\(("(?:[^"\\]|\\.)*")\)/g,'');
  if(/__webpack_require__\s*\(/.test(unmatched))throw Error('Unresolved dynamic webpack reference: '+id);
  const helpers=[...new Set([...body.matchAll(/__webpack_require__\.([A-Za-z0-9_]+)/g)].map(m=>m[1]))].sort();
  if(helpers.some(h=>!['r','d','n'].includes(h)))throw Error('Unsupported webpack loader helper in '+id+': '+helpers.join(','));
  found.set(id,{id,source:Buffer.from(map.sourcesContent[0]),wrapper,compiledBody:body,map,range:{start:Buffer.byteLength(text.slice(0,match.index)),end:Buffer.byteLength(text.slice(0,match.index+match[0].length))},references:[...new Set(calls)].sort(),helpers});
 }
 return found;
}
function moduleId(name){return name.startsWith('app/')?'./'+name.slice(4):'../'+name;}
function sourcePath(id){return id.startsWith('./')?'app/'+id.slice(2):id.startsWith('../backend/')?id.slice(3):null;}
async function treeFiles(root,prefix='') {
 const out=[];for(const e of await readdir(join(root,prefix),{withFileTypes:true})){const n=prefix?prefix+'/'+e.name:e.name;if(e.isSymbolicLink())throw Error('Package contains symlink: '+n);if(e.isDirectory())out.push(...await treeFiles(root,n));else if(e.isFile())out.push(n);else throw Error('Package contains special file: '+n);if(out.length>12000)throw Error('Package file count exceeds limit');}return out.sort();
}
const manifestSchema=z.object({schema:z.literal(1),kind:z.literal('recovered-renderer-package'),id:z.literal('mqtt-raw-diff'),version:z.enum(['1.0.0','1.1.0']),route:z.enum(['source','bundle']),runtime:z.object({renderer:z.literal('Chromium >=120'),isolation:z.literal('own document/root; never share host React')}).strict(),api:z.tuple([z.literal('mount'),z.literal('update'),z.literal('snapshot'),z.literal('dispose')]),entry:z.literal('payload/feature.js'),capabilities:recipeSchema.shape.capabilities,limits:recipeSchema.shape.limits,files:z.array(z.object({path,sha256:hash,bytes:z.number().int().min(0).max(32*1024*1024)}).strict()).min(5).max(12000),digest:hash}).strict();
export async function verifyFeaturePackage(directory,{expectedDigest}={}) {
 const root=await realpath(directory),m=manifestSchema.parse(await readJson(await containedFile(root,'FEATURE.json')));
 if(m.schema!==1||m.kind!=='recovered-renderer-package'||m.id!=='mqtt-raw-diff'||!Array.isArray(m.files)||m.files.length<5||m.files.length>12000||!hash.safeParse(m.digest).success)throw Error('Invalid recovered feature manifest');
 const {digest,...semantic}=m;if(sha256(canonical(semantic))!==digest||expectedDigest&&digest!==expectedDigest)throw Error('Feature manifest/digest changed');
 const paths=new Set();let total=0;
 for(const f of m.files){path.parse(f.path);hash.parse(f.sha256);if(paths.has(f.path)||f.path==='FEATURE.json')throw Error('Duplicate/reserved package file');paths.add(f.path);const b=await bytesAt(root,f.path);total+=b.length;if(total>256*1024*1024||b.length!==f.bytes||sha256(b)!==f.sha256)throw Error('Feature input/payload changed: '+f.path);}
 const actual=await treeFiles(root);if(actual.length!==paths.size+1||actual.some(n=>n!=='FEATURE.json'&&!paths.has(n)))throw Error('Untracked/missing package files');
 for(const n of ['payload/feature.js','payload/index.html','RECIPE.json','DEPENDENCIES.json','TRANSFORMS.json','PROVENANCE.json'])if(!paths.has(n))throw Error('Package missing required record/asset: '+n);
 return {schema:1,id:m.id,digest:m.digest,files:m.files.length,bytes:total,route:m.route,status:'verified',entry:'payload/feature.js',host:'payload/index.html',payloadSha256:Object.fromEntries(m.files.filter(f=>['payload/feature.js','payload/index.html'].includes(f.path)).map(f=>[f.path.slice(8),f.sha256]))};
}

export async function buildFeaturePackage(recipePath,{sourceRoot,donorRoot,out,route='source',evidence=[]}) {
 if(!['source','bundle'].includes(route))throw Error('Recovery route must be source or bundle');
 const r=validateRecoveryRecipe(await readJson(recipePath));
 const donor=await realpath(donorRoot),source=sourceRoot?await realpath(sourceRoot):null;
 if(route==='source'&&!source)throw Error('Source recovery needs --source');
 const dest=await newDestination(out,[donor,...(source?[source]:[])]);
 for(const f of r.inputs){const b=await bytesAt(donor,f.path);if(sha256(b)!==f.sha256)throw Error('Pinned donor input changed: '+f.path);}
 for(const name of [...r.bundleFiles,'MODKIT-NPM-LOCKS/renderer.json','MODKIT-NPM-LOCKS/root.json','LICENSE.md'])if(!r.inputs.some(f=>f.path===name))throw Error('Missing pinned donor input: '+name);
 const recovered=new Map(),bundleRecords=[],moduleRecords=[];
 if(route==='bundle') {
  const wanted=r.files.map(f=>moduleId(f.path));
  for(const name of r.bundleFiles){const bytes=await bytesAt(donor,name),modules=recoverWebpackModules(bytes,{wanted});bundleRecords.push({path:name,sha256:sha256(bytes),bytes:bytes.length});for(const [id,m] of modules){const n=sourcePath(id);if(recovered.has(n))throw Error('Ambiguous module across chunks: '+id);recovered.set(n,m.source);moduleRecords.push({...m,source:undefined,chunk:name});}}
 } else for(const f of r.files) recovered.set(f.path,await bytesAt(source,f.path));
 for(const f of r.files){const b=recovered.get(f.path);if(!b)throw Error('Missing recovered source/module: '+f.path+'; supply every declared bundle chunk');if(sha256(b)!==f.sha256)throw Error('Recovered source hash differs: '+f.path);}
 const names=new Set(r.files.map(f=>f.path)),boundaries=new Map(r.boundaries.map(b=>[b.path,b]));
 const retainedEvidence=[];
 for(const file of evidence){const size=(await stat(file)).size;if(size>32*1024*1024)throw Error('REA Evidence exceeds 32 MiB');const bytes=await readFile(file),envelope=JSON.parse(bytes),data=envelope.data;
  if(envelope.ok!==true||typeof data?.evidence_id!=='string'||!data.normalized_result?.graph?.nodes)throw Error('Expected original REA application Evidence');
  retainedEvidence.push({bytes,sha256:sha256(bytes),id:data.evidence_id,normalized:data.normalized_result});
 }
 if(route==='bundle')for(const m of moduleRecords){const digest=bundleRecords.find(b=>b.path===m.chunk).sha256;
  const matches=retainedEvidence.flatMap(e=>e.normalized.graph.nodes.flatMap(n=>(n.observations??[]).filter(o=>o.properties?.module_key===m.id&&o.properties?.path===m.chunk.split('/').at(-1)&&o.evidence?.artifact?.sha256===digest).map(o=>({evidenceId:e.id,nodeId:n.node_id,observationId:o.observation_id,artifactSha256:digest}))));
  if(!matches.length)throw Error('Missing matching REA bundled-module observation: '+m.id+'; provide --evidence from the same original bundles');m.rea=matches;
 }

 for(const m of moduleRecords)for(const ref of m.references){const n=sourcePath(ref);if(ref.includes('/node_modules/'))continue;if(!names.has(n)&&!boundaries.has(n))throw Error('Unresolved bundled module closure: '+m.id+' → '+ref);}
 // Read compiler and adapters from this release, never from the recipient.
 const runtime=fileURLToPath(new URL('./feature-runtime/',import.meta.url));
 const lockBytes=await bytesAt(donor,'MODKIT-NPM-LOCKS/renderer.json',8*1024*1024),lock=JSON.parse(lockBytes);
 const rootLockBytes=await bytesAt(donor,'MODKIT-NPM-LOCKS/root.json',8*1024*1024),rootLock=JSON.parse(rootLockBytes);
 const {build,version:esbuildVersion}=await import('esbuild');
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest,{mode:0o700});
 const write=async(n,b)=>{const f=join(dest,n);await mkdir(dirname(f),{recursive:true});await writeFile(f,b,{flag:'wx',mode:0o600});};
 try {
  await write('package.json',canonical({name:'yoinkr-recovered-mqtt-raw-diff',version:'1.1.0',private:true,type:'module'})+'\n');
  await write('RECIPE.json',canonical(r)+'\n');
  for(const [name,b] of recovered)await write('originals/'+name,b);
  for(const n of await treeFiles(runtime))await write('adapters/'+n,await bytesAt(runtime,n));
  await write('locks/renderer.json',lockBytes);await write('locks/root.json',rootLockBytes);
  const patched=new Map();
  for(const p of r.patches){if(patched.has(p.path)||!recovered.has(p.path))throw Error('Invalid/duplicate transformation source: '+p.path);const before=recovered.get(p.path).toString('utf8');if(before.split(p.find).length-1!==p.count)throw Error('Transformation match count differs: '+p.path);const after=before.split(p.find).join(p.replace);patched.set(p.path,after);await write('transformed/'+p.path,after);}
  const transformations=r.boundaries.map(b=>({kind:'import-boundary',...b,adapterSha256:null}));
  for(const t of transformations)t.adapterSha256=sha256(await bytesAt(runtime,t.adapter));
  for(const p of r.patches)transformations.push({kind:'source-patch',...p,beforeSha256:sha256(recovered.get(p.path)),afterSha256:sha256(patched.get(p.path))});
  const compiled=await build({absWorkingDir:dest,entryPoints:['adapters/entry.tsx'],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',target:'chrome120',minify:true,define:{'process.env.NODE_ENV':'"development"'},jsx:'automatic',tsconfigRaw:{compilerOptions:{}},nodePaths:[join(donor,'app/node_modules'),join(donor,'node_modules')],logLevel:'silent',legalComments:'eof',plugins:[{name:'recovered-originals',setup(b){
   const resolveLocal=(candidate)=>{for(const n of [candidate,candidate+'.tsx',candidate+'.ts',candidate+'/index.tsx',candidate+'/index.ts'])if(names.has(n))return {path:join(dest,'originals',n)};else if(boundaries.has(n))return {path:join(dest,'adapters',boundaries.get(n).adapter)};throw Error('Unresolved recovered dependency/asset: '+candidate);};
   b.onLoad({filter:/\.tsx?$/},args=>{const n=relative(join(dest,'originals'),args.path).split('\\').join('/');if(patched.has(n))return {contents:patched.get(n),loader:n.endsWith('.tsx')?'tsx':'ts',resolveDir:dirname(args.path)};});
   b.onResolve({filter:/^@donor\//},args=>resolveLocal(args.path.slice(7)));
   b.onResolve({filter:/^[^./]/},async args=>{if(args.pluginData?.pinned||!args.importer||!inside(dest,args.importer))return;return b.resolve(args.path,{resolveDir:join(donor,'app'),kind:args.kind,pluginData:{pinned:true}});});
   b.onResolve({filter:/^\./},args=>{const base=join(dest,'originals');if(inside(base,args.importer)){const n=relative(base,resolve(dirname(args.importer),args.path)).split('\\').join('/');return resolveLocal(n);}});
  }}]});
  const dependencyFiles=[],packages=new Map();
  for(const input of Object.keys(compiled.metafile.inputs).sort()){
   const full=await realpath(resolve(dest,input));if(inside(dest,full))continue;
   let origin,rel;if(inside(join(donor,'app'),full)){origin='renderer';rel=relative(join(donor,'app'),full)}else if(inside(donor,full)){origin='root';rel=relative(donor,full)}else throw Error('Compiler resolved an undeclared external dependency: '+input);
   rel=rel.split('\\').join('/');const part=/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/.exec(rel);if(!part)throw Error('Dependency outside node_modules: '+rel);
   const key=part[1],entry=(origin==='renderer'?lock:rootLock).packages?.[key];if(!entry?.version||!entry.integrity)throw Error('Dependency missing exact version/integrity in effective lock: '+key);
   const data=await readFile(full);dependencyFiles.push({origin,path:rel,sha256:sha256(data),bytes:data.length});
   const id=origin+':'+key;if(!packages.has(id)){
    const pkgRoot=join(origin==='renderer'?join(donor,'app'):donor,key),meta=await bytesAt(pkgRoot,'package.json');const p=JSON.parse(meta);
    if(p.version!==entry.version)throw Error('Installed dependency version differs from lock: '+key);
    const licenses=(await readdir(pkgRoot)).filter(n=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(n)).sort();
    const licenseFiles=[];for(const name of licenses){if(!(await stat(join(pkgRoot,name))).isFile())continue;const bytes=await bytesAt(pkgRoot,name);const target='attribution/'+origin+'/'+key+'/'+name;await write(target,bytes);licenseFiles.push({path:target,sha256:sha256(bytes)});}
    packages.set(id,{origin,path:key,name:p.name,version:entry.version,integrity:entry.integrity,packageJsonSha256:sha256(meta),license:p.license??'unknown',licenseFiles});
   }
  }
  await write('payload/feature.js',compiled.outputFiles[0].contents);await write('payload/index.html',await bytesAt(runtime,'host.html'));
  await write('DEPENDENCIES.json',canonical({schema:1,packages:[...packages.values()].sort((a,b)=>(a.origin+a.path).localeCompare(b.origin+b.path)),files:dependencyFiles.sort((a,b)=>(a.origin+a.path).localeCompare(b.origin+b.path)),dispositions:r.boundaries.map(b=>({...b,disposition:'boundary-adaptation'})),assets:'Inline original component styles and bundled MUI SVG icons; no external fonts, workers or lazy chunks required in rebuilt scope.'})+'\n');
  await write('TRANSFORMS.json',canonical({schema:1,compiler:{name:'esbuild',version:esbuildVersion,jsx:'automatic',target:'chrome120',format:'esm',minify:true,nodeEnv:'development',typeChecking:false},transformations,initialization:'Isolated React root and original MUI themes; minimal feature-scoped Redux setting store; newest-first history matching original MessageHistory.',sourcesChanged:patched.size>0,bundleReconstruction:route==='bundle'?'Recover exact sourcesContent; rebuild static scoped closure. Original webpack factories retained as provenance, never evaluated.':null})+'\n');
  for(const m of moduleRecords){const tag=sha256(m.id);await write('bundle-modules/'+tag+'.json',canonical({...m,compiledBody:undefined,map:undefined})+'\n');await write('bundle-modules/'+tag+'.js',m.compiledBody);await write('bundle-modules/'+tag+'.map',JSON.stringify(m.map));}
  const provenance={schema:1,revision:r.revision,route,bundleLayout:route==='bundle'?r.bundleLayout:null,bundles:bundleRecords,evidence:[],distribution:'Local-input recovery. Review MQTT Explorer and dependency licenses before redistributing the resulting package.',limitations:['No recipient application integration or whole-app equivalence claimed.','Bundle route supports embedded single-source maps and static r/d/n webpack helpers only; runtime lazy imports refused.','Compilation rebuilds the declared source closure rather than executing donor webpack factories.']};
  for(const e of retainedEvidence){const name='evidence/'+e.sha256+'.json';if(provenance.evidence.some(v=>v.path===name))continue;await write(name,e.bytes);provenance.evidence.push({path:name,sha256:e.sha256,evidenceId:e.id,limitations:e.normalized.limitations});}
  const license=await bytesAt(donor,'LICENSE.md');await write('attribution/MQTT-Explorer-LICENSE',license);
  await write('PROVENANCE.json',canonical(provenance)+'\n');
  const files=[];for(const n of await treeFiles(dest)){const b=await bytesAt(dest,n);files.push({path:n,sha256:sha256(b),bytes:b.length});}
  const manifest={schema:1,kind:'recovered-renderer-package',id:r.id,version:'1.1.0',route,runtime:{renderer:'Chromium >=120',isolation:'own document/root; never share host React'},api:['mount','update','snapshot','dispose'],entry:'payload/feature.js',capabilities:r.capabilities,limits:r.limits,files};
  const digest=sha256(canonical(manifest));await write('FEATURE.json',canonical({...manifest,digest})+'\n');
  return await verifyFeaturePackage(dest,{expectedDigest:digest});
 }catch(e){await rm(dest,{recursive:true,force:true});throw e;}
}

/** An explicit local preview only. Runtime payload is read after integrity checks. */
export async function serveFeaturePackage(directory,{port=0,expectedDigest}={}) {
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid preview port');
 const verified=await verifyFeaturePackage(directory,{expectedDigest});
 const payload=new Map();for(const name of ['index.html','feature.js']){const bytes=await bytesAt(await realpath(directory),'payload/'+name);if(sha256(bytes)!==verified.payloadSha256[name])throw Error('Runtime asset changed after verification: '+name);payload.set(name,bytes);}
 const {createServer}=await import('node:http');
 const server=createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url?.slice(1);if(req.method!=='GET'||!payload.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(payload.get(name));});
 await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok)});
 return {verified,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};
}
