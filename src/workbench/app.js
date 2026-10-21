'use strict';
const boot=JSON.parse(document.getElementById('boot').textContent),$=id=>document.getElementById(id);
let action=boot.cases.length?'query':'investigate',busy=false,submitting=false,selectedJob=null,seen=new Set(),caseSignature='',replayLoad=0;
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function updateCases(cases){
 const signature=JSON.stringify(cases);if(signature===caseSignature)return;caseSignature=signature;
 const previous=$('case').value,previousExport=$('export').value;boot.cases=cases;
 $('case').replaceChildren(...cases.map(c=>option(c.id,c.feature)));
 if(cases.some(c=>c.id===previous))$('case').value=previous;
 selectCase();if([...$('export').options].some(o=>o.value===previousExport))$('export').value=previousExport;
 fields();
}
function selectCase(){
 const c=boot.cases.find(c=>c.id===$('case').value);$('case-path').textContent=c?.path??'Create your first investigation.';$('case').title=c?.feature??'';
 $('export').replaceChildren(option('','Graphs and history only'));for(const e of c?.exports??[])$('export').append(option(e.id,e.label+' · '+e.fileCount+' files'));
 $('file-choices').replaceChildren();for(const path of c?.tracedFiles??[]){const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');label.className='check';check.type='checkbox';check.value=path;check.addEventListener('change',selectionCount);text.textContent=path;label.append(check,text);$('file-choices').append(label);}
 $('extra-files').value='';$('example-screenshot').value='';selectionCount();loadReplayChoices();loadUIRecipes();
}
function selectedFiles(){return [...new Set([...document.querySelectorAll('#file-choices input:checked')].map(c=>c.value).concat(lines('extra-files')))];}
function selectionCount(){const c=boot.cases.find(c=>c.id===$('case').value);$('selection-count').textContent=selectedFiles().length+' selected · maximum 256 files / 64 MiB'+((c?.tracedFileCount??0)>256?' · showing the first 256 traced paths; add other exact paths below':'');}
function fields(){
 const view=$('view').value;for(const name of ['query','trace','report','investigate','export','example','verify','ui'])$(name+'-fields').hidden=action!==name;
 $('side-label').hidden=!['query','trace'].includes(action);$('paths-label').hidden=!['modules','module','facts'].includes(view);$('node-label').hidden=view!=='module';$('fact-fields').hidden=view!=='facts';$('paging').hidden=!['modules','facts'].includes(view);
 $('run').textContent={report:'Build report',example:'Save example',verify:'Run selected examples',ui:'Run UI recipe',investigate:'Create investigation',export:'Export selected files'}[action]??'Run '+action;
 for(const b of document.querySelectorAll('[data-delivery]'))b.disabled=busy||!boot.deliveryEnabled;
 $('run').disabled=busy||(action==='investigate'?boot.applications.length<2:!$('case').value);
 for(const b of document.querySelectorAll('[data-action]')){b.classList.toggle('active',b.dataset.action===action);b.disabled=!$('case').value;}
 $('new-investigation').classList.toggle('active',action==='investigate');
}
const lines=id=>$(id).value.split(/\r?\n/).filter(s=>s.length);
async function api(path,options={}){const response=await fetch(path,{...options,headers:{'X-Yoinkr-Token':boot.token,...options.headers}});const value=await response.json();if(!response.ok)throw Error(value.error??'Request failed');return value;}
function apps(){
 const donor=$('donor-app').value,recipient=$('recipient-app').value;
 for(const id of ['donor-app','recipient-app'])$(id).replaceChildren(...boot.applications.map(a=>option(a.id,a.label+' · '+a.path)));
 if(boot.applications.some(a=>a.id===donor))$('donor-app').value=donor;
 if(boot.applications.some(a=>a.id===recipient))$('recipient-app').value=recipient;else if(boot.applications.length>1)$('recipient-app').selectedIndex=1;
 appPaths();
}
function appPaths(){$('app-paths').textContent=boot.applications.length<2?'Register two application paths at startup with repeated --app options.':'Donor: '+(boot.applications.find(a=>a.id===$('donor-app').value)?.path??'')+'\nRecipient: '+(boot.applications.find(a=>a.id===$('recipient-app').value)?.path??'');}
function routeDescription(){$('route-description').textContent=boot.routes[$('route').value];}
$('operation').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||submitting)return;let options={side:$('side').value};
 if(action==='query'){const view=$('view').value;options.view=view;if(view!=='summary')options.paths=lines('paths');if(view==='module'&&$('node').value)options.node=$('node').value;if(['modules','facts'].includes(view)){options.offset=Number($('offset').value);options.limit=Number($('limit').value);}if(view==='facts'){options.properties=lines('properties');options.availableKeys=$('available').checked;}}
 else if(action==='trace')options={...options,seed:$('seed').value,seedKind:$('seed-kind').value,direction:$('direction').value};
 else if(action==='report')options={exportId:$('export').value||undefined,historyLimit:Number($('history-limit').value)};
 else if(action==='export')options={files:selectedFiles()};
 else if(action==='example')options={title:$('example-title').value,steps:lines('example-steps'),side:$('example-side').value,expected:$('example-expected').value,outcome:$('example-outcome').value,observation:$('example-observation').value};
 else if(action==='ui')options={recipeId:$('ui-recipe').value};
 else if(action==='verify')options={workspaceId:$('verify-workspace').value,exampleIds:[...document.querySelectorAll('#replay-choices input:checked')].map(c=>c.value),timeoutMs:Number($('verify-timeout').value)};
 else options={donorId:$('donor-app').value,recipientId:$('recipient-app').value,feature:$('feature').value,seed:$('create-seed').value,seedKind:$('create-seed-kind').value,route:$('route').value,donorSources:lines('donor-sources'),recipientSources:lines('recipient-sources')};
 try{const submittedAction=action,submittedCase=$('case').value;submitting=true;busy=true;fields();if(submittedAction==='example'){const replay=$('example-replay').value.trim();if(replay)options.replay=JSON.parse(replay);
   const file=$('example-screenshot').files[0];if(file){if(file.size>4*1024*1024||file.type!=='image/png')throw Error('Choose a PNG screenshot up to 4 MiB');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));options.screenshotBase64=btoa(binary);}
  }$('status').textContent=submittedAction==='investigate'?'Analyzing donor and recipient, then tracing the feature. This can take several minutes…':'Starting '+submittedAction+'…';const accepted=await api(submittedAction==='example'?'/api/example':'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:submittedCase,action:submittedAction,options})});selectedJob=accepted.id;submitting=false;await refresh();}
 catch(error){$('status').textContent=error.message;submitting=false;busy=false;fields();}
});
function show(job){selectedJob=job.id;$('result').hidden=false;$('result-wrap').hidden=false;$('result-wrap').open=!job.reportUrl;$('preview').hidden=!job.reportUrl;$('result').textContent=job.error?job.error+'\n'+(job.detail??'')+(job.directory?'\nPartial investigation: '+job.directory:''):job.detail??'Operation is running…';if(job.reportUrl){$('report-path').textContent='Saved: '+job.directory;$('report-frame').src=job.reportUrl;}}
let refreshing=false;
async function refresh(){
 if(refreshing)return;refreshing=true;
 try{
  const state=await api('/api/state');busy=state.busy||submitting;updateCases(state.cases);if(JSON.stringify(state.applications)!==JSON.stringify(boot.applications)){boot.applications=state.applications;apps();}
  fields();libraryControls();$('warnings').textContent=state.warnings.map(w=>w.path+': '+w.error).join('\n');$('connection').textContent=busy?'Operation running':'Local service ready';$('jobs').replaceChildren();
  for(const job of [...state.jobs].reverse()){
   if(job.id===selectedJob&&job.status==='running'&&job.detail)$('status').textContent=job.detail;
   const row=document.createElement('div'),label=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('span'),button=document.createElement('button');row.className='job';name.textContent=job.action+' · '+(job.outcome??job.status);name.title=boot.cases.find(c=>c.id===job.caseId)?.feature??'';date.textContent=' '+job.startedAt;label.append(name,date);button.textContent='View';button.addEventListener('click',()=>show(job));row.append(label,button);$('jobs').append(row);
   if(job.id===selectedJob&&job.status!=='running'&&!seen.has(job.id)){
    seen.add(job.id);show(job);$('status').textContent=job.status==='failed'?'Operation failed: '+job.error:job.action==='ui'?(job.outcome==='passed'?'UI recipe passed. Observations and screenshots saved.':'UI recipe failed. Review the observed results and screenshots.'):job.action==='verify'?(job.outcome==='passed'?'Verification passed for the selected examples.':'Verification found differences. Review donor and recipient outputs below.'):'Completed '+job.action+'. Results saved on disk.';
    if(job.status==='complete'&&job.createdCaseId){$('case').value=job.createdCaseId;selectCase();action='export';fields();}
    if(job.status==='complete'&&job.exportId&&job.caseId===$('case').value){$('export').value=job.exportId;action='report';fields();}
   }
  }
 }catch(error){$('connection').textContent='Service unavailable';$('status').textContent=error.message;}
 finally{refreshing=false;}
}
function loadUIRecipes(){const recipes=(boot.uiRecipes??[]).filter(r=>r.caseId===$('case').value);$('ui-recipe').replaceChildren(...recipes.map(r=>option(r.id,r.title)));$('ui-scope').textContent=recipes.length?'Only explicitly registered recipes can run.':'Register a local UI recipe at startup with --ui-recipe /path/to/recipe.json.';}
async function loadReplayChoices(){
 const caseId=$('case').value,request=++replayLoad;$('verify-workspace').replaceChildren(...(boot.workspaces??[]).filter(w=>w.caseId===caseId).map(w=>option(w.id,w.label+' · '+w.path)));
 $('verify-scope').textContent=$('verify-workspace').options.length?'Only explicitly registered working copies can run.':'Register a prepared workspace at startup with --workspace /path/to/workspace. Original applications are not executed.';$('replay-choices').replaceChildren();$('replay-warnings').textContent='';if(!caseId)return;
 try{const result=await api('/api/examples?caseId='+encodeURIComponent(caseId));if($('case').value!==caseId||request!==replayLoad)return;for(const e of result.items){const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');label.className='check';check.type='checkbox';check.value=e.id;check.disabled=!e.replay;text.textContent=e.title+(e.replay?'':' · manual only');label.append(check,text);$('replay-choices').append(label);}$('replay-warnings').textContent=result.warnings.map(w=>w.id+': '+w.error).join('\n')+(result.omitted?' · '+result.omitted+' older examples not listed':'');}catch(error){$('replay-warnings').textContent=error.message;}
}
$('case').addEventListener('change',selectCase);$('view').addEventListener('change',fields);
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',()=>{action=b.dataset.action;if(action==='verify')loadReplayChoices();if(action==='ui')loadUIRecipes();fields();});
$('new-investigation').addEventListener('click',()=>{action='investigate';fields();});
$('select-traced').addEventListener('click',()=>{for(const c of document.querySelectorAll('#file-choices input'))c.checked=true;selectionCount();});
$('clear-files').addEventListener('click',()=>{for(const c of document.querySelectorAll('#file-choices input'))c.checked=false;$('extra-files').value='';selectionCount();});$('extra-files').addEventListener('input',selectionCount);
for(const id of ['donor-app','recipient-app'])$(id).addEventListener('change',appPaths);
for(const name of Object.keys(boot.routes))$('route').append(option(name,name));$('route').value='undecided';$('route').addEventListener('change',routeDescription);routeDescription();
$('creation-path').textContent='New cases are retained under '+boot.caseRoot;
$('theme').addEventListener('click',()=>{$('theme').textContent=document.body.classList.toggle('light')?'Dark mode':'Light mode';});
apps();updateCases(boot.cases);fields();refresh();setInterval(refresh,1500);

// Prior work uses only server-registered IDs, with literal text rendering.
let libraryQuery={query:'',kind:'',status:'',offset:0,limit:20},librarySequence=0,libraryLoaded=false,librarySelected=null,libraryBusy=false,libraryDetailSequence=0;
const libraryBasket=new Map();
function libraryScope(summary){$('library-scope').textContent=summary.documentCount+' records from '+summary.sourceCount+' sources · indexed '+summary.builtAt+(summary.truncated?' · coverage is partial; see warnings':'');$('library-warnings').textContent=JSON.stringify({roots:summary.roots,scope:summary.scope,truncated:summary.truncated,warnings:summary.warnings,omittedWarnings:summary.omittedWarnings},null,2);}
function libraryControls(){for(const id of ['library-refresh','library-open','library-reuse','finding-save'])$(id).disabled=busy||libraryBusy;}
function citation(record){if(!libraryBasket.has(record.id)&&libraryBasket.size>=8){$('library-status').textContent='A finding can cite at most eight records.';return;}libraryBasket.set(record.id,record);drawCitations();$('finding-editor').open=true;}
function drawCitations(){$('finding-citations').replaceChildren();for(const d of libraryBasket.values()){const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=d.title+' · '+d.sha256.slice(0,12);remove.type='button';remove.textContent='Remove';remove.onclick=()=>{libraryBasket.delete(d.id);drawCitations();};row.append(name,remove);$('finding-citations').append(row);}}
async function searchLibrary(){const sequence=++librarySequence;try{$('library-status').textContent='Searching local records…';const r=await api('/api/library/search?'+new URLSearchParams(libraryQuery));if(sequence!==librarySequence)return;libraryLoaded=true;libraryScope(r.summary);$('library-results').replaceChildren();for(const d of r.items){const card=document.createElement('article'),title=document.createElement('h3'),level=document.createElement('p'),excerpt=document.createElement('p'),where=document.createElement('p'),buttons=document.createElement('div'),view=document.createElement('button'),cite=document.createElement('button');card.className='library-card';card.dataset.documentId=d.id;title.textContent=d.title;level.className='library-level';level.textContent=d.kind+' · '+d.status+' · '+d.level;excerpt.textContent=d.excerpt;where.textContent=d.path+(d.line?' : line '+d.line:'');buttons.className='library-actions';view.type=cite.type='button';view.textContent='View source record';view.onclick=()=>viewLibrary(d.id);cite.textContent='Add citation';cite.onclick=()=>citation(d);buttons.append(view,cite);card.append(title,level,excerpt,where,buttons);$('library-results').append(card);}$('library-prev').disabled=r.offset===0;$('library-next').disabled=r.offset+r.items.length>=r.total;$('library-status').textContent=r.total?'Showing '+(r.offset+1)+'–'+(r.offset+r.items.length)+' of '+r.total+' matching records.':'No matching records in the current index.';}catch(e){if(sequence===librarySequence)$('library-status').textContent=e.message;}}
async function viewLibrary(id){const sequence=++libraryDetailSequence;librarySelected=null;$('library-detail').hidden=true;try{const d=await api('/api/library/document?id='+encodeURIComponent(id));if(sequence!==libraryDetailSequence)return;librarySelected=d;$('library-title').textContent=d.title;$('library-level').textContent=d.kind+' · '+d.status+' · '+d.level;$('library-path').textContent=d.path;$('library-hash').textContent='Record SHA-256: '+d.sha256+' · Parent: '+d.parentSha256;$('library-tags').hidden=!d.finding;$('library-tags').textContent=d.finding?'Tags: '+d.finding.tags.join(', '):'';$('library-raw-wrap').hidden=!d.finding;$('library-raw').textContent=d.text;$('library-text').textContent=(d.finding?.body??d.text)+(d.displayOmitted?'\n['+d.displayOmitted+' characters omitted from this preview.]':'');$('library-citations').replaceChildren();for(const c of d.citations){const row=document.createElement('p'),button=document.createElement('button');row.textContent=c.title+' · '+c.integrity+' · saved '+c.status+' / '+c.level;button.textContent='View cited record';button.type='button';button.onclick=()=>viewLibrary(c.documentId);button.disabled=c.integrity==='not-registered';row.append(document.createTextNode(' '),button);$('library-citations').append(row);}$('library-open').hidden=$('library-reuse').hidden=!d.canOpenCase;$('library-detail').hidden=false;libraryControls();}catch(e){$('library-status').textContent=e.message;}}
async function openLibraryCase(reuse){if(!librarySelected||busy||libraryBusy)return;libraryBusy=true;libraryControls();try{const r=await api('/api/library/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:librarySelected.sourceId})});updateCases(r.cases);boot.applications=r.applications;apps();$('case').value=r.caseId;selectCase();if(reuse){action='investigate';$('feature').value=r.reuse.feature;$('create-seed').value=r.reuse.seed;$('create-seed-kind').value='module';if(Object.hasOwn(boot.routes,r.reuse.route))$('route').value=r.reuse.route;for(const [id,path]of [['donor-app',r.reuse.donorPath],['recipient-app',r.reuse.recipientPath]]){const app=boot.applications.find(a=>a.path===path);if(app)$(id).value=app.id;}appPaths();routeDescription();}else action='query';fields();libraryScope(r.summary);$('library-status').textContent=reuse?'Investigation form filled from the prior case. Review it and submit when ready.':'Prior case opened in the operation controls.';}catch(e){$('library-status').textContent=e.message;}finally{libraryBusy=false;libraryControls();}}
$('library-toggle').onclick=()=>{const open=$('library-panel').hidden;$('library-panel').hidden=!open;$('library-toggle').setAttribute('aria-expanded',String(open));if(open){$('library-query').focus();if(!libraryLoaded)searchLibrary();}};
$('library-search').onsubmit=e=>{e.preventDefault();libraryQuery={query:$('library-query').value,kind:$('library-kind').value,status:$('library-outcome').value,offset:0,limit:20};searchLibrary();};
$('library-prev').onclick=()=>{libraryQuery.offset=Math.max(0,libraryQuery.offset-20);searchLibrary();};$('library-next').onclick=()=>{libraryQuery.offset+=20;searchLibrary();};
$('library-refresh').onclick=async()=>{if(busy||libraryBusy)return;libraryBusy=true;libraryControls();try{const r=await api('/api/library/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});libraryScope(r.summary);libraryQuery.offset=0;await searchLibrary();}catch(e){$('library-status').textContent=e.message;}finally{libraryBusy=false;libraryControls();}};
$('library-cite').onclick=()=>{if(librarySelected)citation(librarySelected);};$('library-open').onclick=()=>openLibraryCase(false);$('library-reuse').onclick=()=>openLibraryCase(true);
$('finding-form').onsubmit=async e=>{e.preventDefault();if(busy||libraryBusy)return;if(!libraryBasket.size){$('library-status').textContent='Add at least one source citation first.';return;}libraryBusy=true;libraryControls();try{const r=await api('/api/library/finding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('finding-title').value,body:$('finding-body').value,tags:$('finding-tags').value.split(',').map(s=>s.trim()).filter(Boolean),citations:[...libraryBasket.values()].map(d=>({documentId:d.id,sha256:d.sha256,parentSha256:d.parentSha256}))})});libraryBasket.clear();drawCitations();$('finding-title').value=$('finding-body').value=$('finding-tags').value='';$('library-query').value='';$('library-kind').value='finding';$('library-outcome').value='manual';libraryQuery={query:'',kind:'finding',status:'manual',offset:0,limit:20};await searchLibrary();if(r.findingDocumentId)await viewLibrary(r.findingDocumentId);$('library-status').textContent='Saved an immutable manual finding with '+r.finding.citations.length+' hash-bound citations.';}catch(e){$('library-status').textContent=e.message;}finally{libraryBusy=false;libraryControls();}};
libraryScope(boot.library);libraryControls();

$('delivery-toggle').addEventListener('click',()=>{const panel=$('delivery-panel');panel.hidden=!panel.hidden;$('delivery-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
$('delivery-scope').textContent=boot.deliveryEnabled?'A local delivery configuration is registered. Recipes and supplied inputs are checked before application execution.':'Start this workbench with --delivery-config /path/to/delivery.local.json to register inputs.';
for(const button of document.querySelectorAll('[data-delivery]')){button.disabled=!boot.deliveryEnabled;button.addEventListener('click',async()=>{
 if(busy)return;submitting=true;busy=true;fields();try{const accepted=await api('/api/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.delivery})});selectedJob=accepted.id;submitting=false;await refresh();}catch(e){$('status').textContent=e.message;submitting=false;busy=false;fields();}
});}
