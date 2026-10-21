import {loadDeliveryConfig,checkDelivery,runDelivery,deliveryStatus,rollbackDelivery,exportDeliveryBundle,importDeliveryBundle} from './delivery.js';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdir,readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLibrary} from './library.js';
import {readCase,followupTrace,createCaseReport} from './investigation.js';
import {inspectUIRecipe} from './ui-recipe.js';
import {runUICheck} from './ui-checks.js';
import {verifyWorkspace,workspaceStatus} from './verify.js';
import {readExamples} from './examples.js';
import {saveExample,screenshotBytes} from './examples.js';
import {queryCase} from './queries.js';
import {investigate,exportFeature,applicationRoot,safeRelative,ROUTES} from './research.js';
import {inside,readJson,containedFile,newDestination} from './workspace.js';
const ui=new URL('./workbench/',import.meta.url),project=fileURLToPath(new URL('..',import.meta.url));
const defaults={query:queryCase,trace:followupTrace,report:createCaseReport,investigate,export:exportFeature,example:saveExample,verify:verifyWorkspace,ui:runUICheck};
export async function startWorkbench({cases=[join(project,'builds/feature-examples-v0.4/mqtt-case')],applications=[],workspaces=[],uiRecipes=[],knowledgeRoots=[],findingRoot=join(project,'findings'),deliveryConfig,port=4195,reportRoot=join(project,'reports'),caseRoot=join(project,'cases'),operations=defaults}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('port must be 0 to 65535');
 if(!Array.isArray(cases)||cases.length>16)throw Error('register up to 16 case directories');
 if(!Array.isArray(applications)||applications.length>32)throw Error('register up to 32 application paths');
 if(!Array.isArray(workspaces)||workspaces.length>16)throw Error('register up to 16 workspaces');
 if(!Array.isArray(knowledgeRoots)||knowledgeRoots.length>16)throw Error('register up to 16 knowledge roots');
 if(!Array.isArray(uiRecipes)||uiRecipes.length>16)throw Error('register up to 16 UI recipes');
 operations={...defaults,...operations};
 const delivery=deliveryConfig?await loadDeliveryConfig(deliveryConfig):null;let deliveryRun=null,deliveryExport=null;
 const registered=[],apps=[],prepared=[],uiPrepared=[],warnings=[],protectedRoots=[];
 async function registerApplication(path,required=false){
  try{const canonical=await applicationRoot(path);let app=apps.find(a=>a.path===canonical);if(!app){if(apps.length>=32)throw Error('application registration limit reached');app={id:randomUUID(),path:canonical,label:basename(canonical)};apps.push(app);protectedRoots.push(canonical);}return app;}
  catch(e){if(required)throw e;warnings.push({path,error:'Application unavailable: '+e.message});}
 }
 async function registerCase(path){
  const {root,record}=await readCase(path);let entry=registered.find(c=>c.path===root);if(entry)return entry;
  if(registered.length>=16)throw Error('case registration limit reached');
  protectedRoots.push(root);
  for(const p of [record.donor.path,record.recipient.path])if(typeof p==='string'){
   try{protectedRoots.push(await realpath(resolve(p)));}catch(e){if(e.code!=='ENOENT')throw e;protectedRoots.push(resolve(p));}
   await registerApplication(p);
  }
  entry={id:randomUUID(),path:root,feature:record.feature,caseId:record.id,exports:[],tracedFiles:(record.trace.files??[]).slice(0,256),tracedFileCount:record.trace.files?.length??0,donorFileCount:record.donor.files?.length??0};
  await scanExports(entry);registered.push(entry);return entry;
 }
 async function scanExports(entry){
  const parent=join(entry.path,'private'),exports=[];
  try{
   if(!inside(entry.path,await realpath(parent)))throw Error('export directory escaped case');
   const entries=await readdir(parent,{withFileTypes:true});
   for(const item of entries.filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,32)){
    try{const dir=await realpath(join(parent,item.name));if(!inside(entry.path,dir))throw Error('export escaped case');const manifest=await readJson(await containedFile(dir,'EXPORT.json'));
     if(manifest.schema===1&&manifest.caseId===entry.caseId&&Array.isArray(manifest.files))exports.push({id:entry.exports.find(e=>e.path===dir)?.id??randomUUID(),label:item.name,fileCount:manifest.files.length,path:dir});
    }catch(e){warnings.push({path:join(parent,item.name),error:e.message});}
   }
  }catch(e){if(e.code!=='ENOENT')warnings.push({path:parent,error:e.message});}
  entry.exports=exports;
 }
 for(const path of [...new Set(cases)])await registerCase(path);
 for(const path of [...new Set(workspaces)]){
  const root=await realpath(resolve(path)),w=await workspaceStatus(root);if(w.schema!==1)throw Error('unsupported workspace');const entry=await registerCase(w.casePath);if(w.caseId!==entry.caseId)throw Error('workspace belongs to a different case');prepared.push({id:randomUUID(),path:root,workspaceId:w.id,caseId:entry.id,label:basename(root)});protectedRoots.push(root);
 }
 for(const path of [...new Set(uiRecipes)]){const registration=await inspectUIRecipe(path),entry=await registerCase(registration.casePath);uiPrepared.push({id:randomUUID(),title:registration.title,caseId:entry.id,path:registration.path,registration});protectedRoots.push(registration.target);}
 for(const path of [...new Set(applications)])await registerApplication(path,true);
 if(delivery)protectedRoots.push(delivery.config.bundle,delivery.config.donor,delivery.config.source,...Object.values(delivery.config.runtimes),delivery.config.outputRoot);
 if(!delivery&&!registered.length&&apps.length<2&&!knowledgeRoots.length)throw Error('register an existing case or at least two applications');
 const knowledgeInputs=[...registered.map(c=>c.path),...prepared.map(w=>w.path),...knowledgeRoots];
 try{knowledgeInputs.push(await realpath(resolve(caseRoot)));}catch(e){if(e.code!=='ENOENT')throw e;}
 const seedLibrary=await buildLibrary(knowledgeInputs);protectedRoots.push(...[...seedLibrary.sources.values()].map(s=>s.directory));
 const creation=await newDestination(join(resolve(caseRoot),'workbench-'+randomUUID()),protectedRoots);
 const reports=await newDestination(join(resolve(reportRoot),'workbench-'+randomUUID()),[...protectedRoots,creation]);
 await mkdir(creation,{recursive:true,mode:0o700});await mkdir(reports,{recursive:true,mode:0o700});
 const findingStore=await newDestination(findingRoot,protectedRoots);try{const s=await lstat(findingStore);if(s.isSymbolicLink()||!s.isDirectory())throw Error('finding store must be an ordinary directory');}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(findingStore,{recursive:true,mode:0o700});
 const libraryRoots=[...knowledgeInputs,await realpath(resolve(caseRoot))];let library=await buildLibrary(libraryRoots,{findingRoot:findingStore});
 async function refreshLibrary(){if(await realpath(findingStore)!==findingStore)throw Error('finding store changed');const next=await buildLibrary(libraryRoots,{findingRoot:findingStore});for(const s of next.sources.values())if(s.kind!=='finding'&&(s.directory===findingStore||inside(s.directory,findingStore)))throw Error('finding store overlaps an indexed source');library=next;return library.summary;}
 const token=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex'),jobs=new Map(),reportFiles=new Map();let active=null,closed=false,origin;
 const publicCases=()=>registered.map(({exports,...c})=>({...c,exports:exports.map(({path,...e})=>e)}));
 const boot={deliveryEnabled:!!delivery,token,cases:publicCases(),applications:apps,workspaces:prepared,uiRecipes:uiPrepared.map(({registration,...r})=>r),warnings,reports,caseRoot:creation,routes:ROUTES,library:library.summary};
 const script=await readFile(new URL('app.js',ui)),css=await readFile(new URL('style.css',ui)),template=await readFile(new URL('index.html',ui),'utf8');
 function html(){const encoded=JSON.stringify({...boot,cases:publicCases(),library:library.summary}).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));return template.replace('/*BOOT*/',()=>encoded);}
 const server=createServer((req,res)=>{handle(req,res).catch(e=>{if(!res.headersSent)send(res,e.status??400,{error:e.message});else res.destroy();});});
 server.requestTimeout=15000;server.headersTimeout=10000;
 function send(res,status,value,type='application/json'){res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(type==='application/json'?JSON.stringify(value):value);}
 const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
 const exact=(object,keys)=>{if(Object.keys(object).some(k=>!keys.includes(k)))fail(400,'unsupported operation option');};
 const paths=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.length>256||value.some(p=>typeof p!=='string'||p.length>1000))fail(400,'expected up to 256 relative paths');return [...new Set(value.map(safeRelative))];};
 async function body(req,maxBytes=32768){if(req.headers['content-type']!=='application/json')fail(415,'application/json required');let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBytes)fail(413,'request exceeds '+(maxBytes===32768?'32 KiB':'6 MiB'));chunks.push(chunk);}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail(400,'invalid JSON');}if(!value||Array.isArray(value)||typeof value!=='object')fail(400,'JSON object required');return value;}
 async function handle(req,res){
  if(req.headers.host!==new URL(origin).host)fail(403,'unexpected Host');if(req.headers.origin&&req.headers.origin!==origin)fail(403,'foreign Origin');
  const url=new URL(req.url,origin),path=url.pathname;
  if(req.method==='GET'&&path==='/'){
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");res.setHeader('Set-Cookie',`yoinkr-session=${session}; HttpOnly; SameSite=Strict; Path=/`);return send(res,200,html(),'text/html');
  }
  if(req.method==='GET'&&path==='/app.js')return send(res,200,script,'text/javascript');if(req.method==='GET'&&path==='/style.css')return send(res,200,css,'text/css');
  if(req.method==='GET'&&path.startsWith('/reports/')){
   if(!req.headers.cookie?.split(';').some(c=>c.trim()==='yoinkr-session='+session))fail(403,'workbench session required');const file=reportFiles.get(path);if(!file)fail(404,'report not found');res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");return send(res,200,await readFile(file),'text/html');
  }
  if((req.headers['x-yoinkr-token']??req.headers['x-modkit-token'])!==token)fail(403,'workbench token required');
  if(req.method==='POST'&&path==='/api/delivery'){
   if(!delivery)fail(400,'Start workbench with --delivery-config to register local inputs');
   if(closed)fail(503,'workbench closing');if(active)fail(409,'another operation is running');
   const input=await body(req);exact(input,['action']);if(!['check','run','status','rollback','export','import'].includes(input.action))fail(400,'unsupported delivery action');
   if(active)fail(409,'another operation is running');
   const id=randomUUID(),job={id,action:'delivery '+input.action,status:'running',startedAt:new Date().toISOString(),caseId:null};jobs.set(id,job);if(jobs.size>32)jobs.delete(jobs.keys().next().value);
   active=(async()=>{await Promise.resolve();try{
    if((await loadDeliveryConfig(delivery.path)).sha256!==delivery.sha256)throw Error('Registered delivery configuration changed; review it and restart workbench');
    let result;
    if(input.action==='check')result=await checkDelivery(delivery.path);
    else if(input.action==='run'){result=await runDelivery(delivery.path,{onProgress:s=>{job.directory=s.directory;job.detail=s.status+': '+s.name;}});deliveryRun=result.directory;const url='/reports/'+id+'.html';reportFiles.set(url,result.report);job.reportUrl=url;}
    else if(input.action==='export'){result=await exportDeliveryBundle(join(reports,'recipes-'+id));deliveryExport=result.directory;}
    else if(input.action==='import')result=await importDeliveryBundle(deliveryExport??delivery.config.bundle,join(reports,'imported-'+id));
    else{if(!deliveryRun)throw Error('Build a delivery run in this workbench session first');result=await(input.action==='status'?deliveryStatus:rollbackDelivery)(deliveryRun);}
    job.outcome=result.status;job.detail=JSON.stringify(result,null,2);job.directory=result.directory??job.directory;job.status=['failed','blocked'].includes(result.status)?'failed':'complete';if(job.status==='failed')job.error=result.error??'Prerequisites blocked; see result details';
   }catch(e){job.status='failed';job.error=e.message;}finally{job.finishedAt=new Date().toISOString();active=null;}})();
   return send(res,202,{id});
  }
  if(req.method==='GET'&&path==='/api/library/search'){
   for(const k of url.searchParams.keys())if(!['query','kind','status','offset','limit'].includes(k)||url.searchParams.getAll(k).length!==1)fail(400,'unsupported library search option');
   return send(res,200,library.search({query:url.searchParams.get('query')??'',kind:url.searchParams.get('kind')??'',status:url.searchParams.get('status')??'',offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??20)}));
  }
  if(req.method==='GET'&&path==='/api/library/document'){
   if([...url.searchParams.keys()].some(k=>k!=='id')||url.searchParams.getAll('id').length!==1)fail(400,'give one registered library document id');return send(res,200,await library.detail(url.searchParams.get('id')));
  }
  if(req.method==='POST'&&['/api/library/refresh','/api/library/finding','/api/library/open'].includes(path)){
   if(closed)fail(503,'workbench closing');if(active)fail(409,'another operation is running');const input=await body(req);if(active)fail(409,'another operation is running');
   const task=(async()=>{await Promise.resolve();if(path==='/api/library/refresh'){exact(input,[]);return {summary:await refreshLibrary()};}
    if(path==='/api/library/finding'){const saved=await library.saveFinding(input);await refreshLibrary();return {finding:saved,findingDocumentId:[...library.documents.values()].find(d=>d.path===saved.path)?.id,summary:library.summary};}
    exact(input,['sourceId']);const source=await library.caseSource(input.sourceId),entry=await registerCase(source.directory);const {record}=await readCase(entry.path);await refreshLibrary();return {caseId:entry.id,cases:publicCases(),applications:apps,summary:library.summary,reuse:{feature:String(record.feature??'').slice(0,1000),route:typeof record.route?.selected==='string'&&Object.hasOwn(ROUTES,record.route.selected)?record.route.selected:'undecided',seed:typeof record.trace?.files?.[0]==='string'?record.trace.files[0].slice(0,1000):'',donorPath:record.donor.path,recipientPath:record.recipient.path}};
   })();active=task;try{return send(res,200,await task);}finally{if(active===task)active=null;}
  }
  if(req.method==='GET'&&path==='/api/examples'){const c=registered.find(c=>c.id===url.searchParams.get('caseId'));if(!c)fail(400,'case is not registered');const examples=await readExamples(c.path,{limit:32,includeImages:false});return send(res,200,{items:examples.items.map(e=>({id:e.id,title:e.title,replay:!!e.replay})),warnings:examples.warnings,omitted:examples.omitted});}
  if(req.method==='GET'&&path==='/api/state')return send(res,200,{jobs:[...jobs.values()],busy:!!active,cases:publicCases(),applications:apps,workspaces:prepared,uiRecipes:uiPrepared.map(({registration,...r})=>r),warnings,library:library.summary});
  if(req.method!=='POST'||!['/api/run','/api/example'].includes(path))fail(404,'not found');if(closed)fail(503,'workbench closing');if(active)fail(409,'another operation is running');
  const input=await body(req,path==='/api/example'?6*1024*1024:32768);if(path==='/api/example'&&input.action!=='example')fail(400,'example endpoint accepts examples only');if(active)fail(409,'another operation is running');exact(input,['caseId','action','options']);
  if(!['query','trace','report','investigate','export','example','verify','ui'].includes(input.action))fail(400,'unsupported action');
  const selected=registered.find(c=>c.id===input.caseId);if(input.action!=='investigate'&&!selected)fail(400,'case is not registered');
  const options=input.options??{};if(!options||typeof options!=='object'||Array.isArray(options))fail(400,'options object required');
  exact(options,{query:['side','view','paths','properties','node','kind','offset','limit','availableKeys'],trace:['side','seed','seedKind','direction'],report:['exportId','historyLimit'],investigate:['donorId','recipientId','feature','seed','seedKind','route','donorSources','recipientSources'],export:['files'],example:['title','steps','expected','observation','outcome','side','screenshotBase64','replay'],verify:['workspaceId','exampleIds','timeoutMs'],ui:['recipeId']}[input.action]);
  let exportDirectory,donor,recipient,createOptions,exportFiles,workspace,uiRecipe;
  if(input.action==='ui'){uiRecipe=uiPrepared.find(r=>r.id===options.recipeId&&r.caseId===selected.id);if(!uiRecipe)fail(400,'UI recipe is not registered for this case');}
  if(input.action==='verify'){workspace=prepared.find(w=>w.id===options.workspaceId&&w.caseId===selected.id);if(!workspace)fail(400,'workspace is not registered for this case');if(!Array.isArray(options.exampleIds)||!options.exampleIds.length||options.exampleIds.length>16||options.exampleIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(id)))fail(400,'select 1 to 16 replay example IDs');}
  if(input.action==='report'&&options.exportId){exportDirectory=selected.exports.find(e=>e.id===options.exportId)?.path;if(!exportDirectory)fail(400,'export is not registered');}
  if(input.action==='export'){
   if(selected.exports.length>=32)fail(400,'export registration limit reached');exportFiles=paths(options.files);if(!exportFiles.length)fail(400,'select at least one donor file or asset');
  }
  if(input.action==='investigate'){
   if(registered.length>=16)fail(400,'case registration limit reached');
   donor=apps.find(a=>a.id===options.donorId);recipient=apps.find(a=>a.id===options.recipientId);
   if(!donor||!recipient)fail(400,'choose registered donor and recipient applications');
   if(donor.id===recipient.id)fail(400,'choose two different applications');
   for(const field of ['feature','seed'])if(typeof options[field]!=='string'||!options[field].trim()||options[field].length>1000)fail(400,'give a '+field+' (up to 1000 characters)');
   if(!['module','string','api','ipc','route','node-id','native-export'].includes(options.seedKind??'module'))fail(400,'unsupported trace seed kind');
   if(!Object.hasOwn(ROUTES,options.route??'undecided'))fail(400,'unknown transfer route');
   createOptions={feature:options.feature,seed:options.seed,seedKind:options.seedKind??'module',route:options.route??'undecided',donorSources:paths(options.donorSources),recipientSources:paths(options.recipientSources)};
  }
  const id=randomUUID(),job={id,caseId:selected?.id??null,action:input.action,status:'running',startedAt:new Date().toISOString()};jobs.set(id,job);if(jobs.size>32)jobs.delete(jobs.keys().next().value);
  active=(async()=>{try{
   // A deferred turn lets active become assigned even when an operation rejects synchronously.
   await Promise.resolve();let result;
   if(input.action==='query')result=await operations.query(selected.path,options);
   else if(input.action==='trace')result=await operations.trace(selected.path,options);
   else if(input.action==='investigate'){
    for(const app of [donor,recipient])if(await applicationRoot(app.path)!==app.path)throw Error('registered application path changed; restart to register it again');
    const out=await newDestination(join(creation,'case-'+id),protectedRoots);
    if(!inside(creation,out))throw Error('case output root changed');
    job.directory=out;await operations.investigate({...createOptions,donor:donor.path,recipient:recipient.path,out});
    const entry=await registerCase(out);job.caseId=entry.id;job.createdCaseId=entry.id;result={directory:out,caseId:entry.id,feature:entry.feature,tracedFiles:entry.tracedFiles,status:'Static investigation retained; no integration or acceptance run.'};
   }else if(input.action==='ui'){
    result=await operations.ui(uiRecipe.registration);job.outcome=result.passed?'passed':'differences';
   }else if(input.action==='verify'){
    if(await realpath(workspace.path)!==workspace.path)throw Error('workspace path changed');const w=await workspaceStatus(workspace.path);if(w.id!==workspace.workspaceId||w.caseId!==selected.caseId||await realpath(w.casePath)!==selected.path)throw Error('registered workspace binding changed');
    result=await operations.verify(workspace.path,{exampleIds:options.exampleIds,timeoutMs:options.timeoutMs??5000});job.outcome=result.passed?'passed':'differences';
   }else if(input.action==='example'){
    const {screenshotBase64,...example}=options;result=await operations.example(selected.path,example,{screenshot:screenshotBytes(screenshotBase64)});
   }else if(input.action==='export'){
    result=await operations.export(selected.path,{files:exportFiles});await scanExports(selected);
    job.exportId=selected.exports.find(e=>e.path===result.directory)?.id;
   }else{
    const file=join(reports,id+'.html');result=await operations.report(selected.path,file,{exportDirectory,historyLimit:options.historyLimit??8});const reportUrl='/reports/'+id+'.html';reportFiles.set(reportUrl,file);result={...result,reportUrl};
   }
   const detail=JSON.stringify(result,null,2);job.detail=detail.slice(0,65536)+(detail.length>65536?'\n[Display truncated; complete results remain in retained Evidence.]':'');job.directory=result.directory??result.path;job.reportUrl=result.reportUrl??null;job.status='complete';
  }catch(e){job.status='failed';job.error=e.message;}finally{job.finishedAt=new Date().toISOString();active=null;}})();
  send(res,202,{id});
 }
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 return {url:origin,server,boot,reports,caseRoot:creation,async close(){closed=true;const drained=new Promise(r=>server.close(r));server.closeIdleConnections();if(active)await active.catch(()=>{});await drained;}};
}
