// Real browser workbench journey, plus actual native delivery. Explicit local inputs only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {startWorkbench} from '../../src/workbench.js';
import {loadDeliveryConfig,deliveryStatus} from '../../src/delivery.js';
import {saveJson} from '../../src/workspace.js';
const flags={};for(let i=2;i<process.argv.length;i+=2){if(!['--config','--out'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --config <delivery.local.json> --out <new proof directory>');flags[process.argv[i].slice(2)]=resolve(process.argv[i+1]);}
assert.ok(flags.config&&flags.out,'--config and --out required');await mkdir(flags.out,{mode:0o700});
const loaded=await loadDeliveryConfig(flags.config),playwright=await import(loaded.config.playwrightModule),checks=[],errors=[];let app,browser,run;
const record=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
try{
 app=await startWorkbench({cases:[],deliveryConfig:flags.config,port:0,caseRoot:join(flags.out,'cases'),reportRoot:join(flags.out,'reports'),findingRoot:join(flags.out,'findings')});
 browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));await page.goto(app.url);await page.getByRole('button',{name:'Delivery',exact:true}).click();record('Delivery panel visible without a registered case',await page.getByRole('heading',{name:'Deliver a recovered feature'}).isVisible());
 const call=async(name)=>{
  const id=await page.evaluate(async({token,name})=>{const response=await fetch('/api/delivery',{method:'POST',headers:{'Content-Type':'application/json','X-Yoinkr-Token':token},body:JSON.stringify({action:name})});if(!response.ok)throw Error(await response.text());return (await response.json()).id;},{token:app.boot.token,name});
  const end=Date.now()+300000;for(;;){const state=await page.evaluate(async token=>(await fetch('/api/state',{headers:{'X-Yoinkr-Token':token}})).json(),app.boot.token);const job=state.jobs.find(j=>j.id===id);if(job&&job.status!=='running')return job;if(Date.now()>end)throw Error('Workbench operation deadline: '+name);await new Promise(r=>setTimeout(r,150));}
 };
 // Exercise an actual button and normal UI progress before using its equivalent endpoint for the long run.
 await page.getByRole('button',{name:'Check prerequisites',exact:true}).click();
 let state;for(let i=0;i<200;i++){state=await page.evaluate(async token=>(await fetch('/api/state',{headers:{'X-Yoinkr-Token':token}})).json(),app.boot.token);if(!state.busy&&state.jobs.some(j=>j.action==='delivery check'))break;await new Promise(r=>setTimeout(r,100));}
 await saveJson(join(flags.out,'BUTTON-STATE.json'),state);
 record('Prerequisite button produced a ready result',state.jobs.some(j=>j.action==='delivery check'&&j.outcome==='ready'));
 const exported=await call('export');record('Workbench exports recipe-only bundle',exported.status==='complete');const imported=await call('import');record('Workbench imports its exported recipes',JSON.parse(exported.detail).digest===JSON.parse(imported.detail).digest);
 const execution=await call('run');record('Workbench native build and replay passed',execution.status==='complete');run=JSON.parse(execution.detail);record('All four fresh applications pass 19 shared checkpoints each',Object.values(run.acceptance.runs).length===4&&Object.values(run.acceptance.runs).every(r=>r.status==='passed'&&r.observations===19));record('All three comparisons against the fresh donor pass',Object.values(run.acceptance.comparisons).every(r=>r.status==='passed'));
 const current=JSON.parse((await call('status')).detail);record('Both installed recipients have clean current integrity',current.current.vscode.clean&&current.current.joplin.clean);
 // Capture the real activity panel and the standalone local report.
 await page.reload();await page.getByRole('button',{name:'Delivery',exact:true}).click();await page.waitForTimeout(1000);await page.screenshot({path:join(flags.out,'workbench.png'),fullPage:true});
 await page.goto(app.url+execution.reportUrl);record('Standalone report explains original code and new glue',(await page.locator('body').innerText()).includes('Original code, transformations and new glue'));record('Report fits desktop viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(flags.out,'report.png'),fullPage:false});await page.goto(app.url);
 const selected=join(run.directory,'joplin/workspace/runtime/resources/app/main.bundle.js'),before=await readFile(selected);await writeFile(selected,Buffer.concat([before,Buffer.from('\n// owned public-delivery drift test\n')]));
 try{const refused=await call('rollback');record('Rollback refuses deliberately changed Joplin lab copy',refused.status==='failed');const after=await deliveryStatus(run.directory);record('Both-recipient preflight preserves VS Code on Joplin drift',after.current.vscode.status==='applied'&&after.current.vscode.clean);}finally{await writeFile(selected,before);}
 const restored=await call('rollback');record('Workbench restores both fresh lab copies',restored.status==='complete');const final=await deliveryStatus(run.directory);record('Both restored recipients are clean and report rolled-back',Object.values(final.current).every(h=>h.clean&&h.status==='rolled-back'));
 const checked=await call('check');record('Original selected inputs still pass all pins after replay and rollback',checked.status==='complete'&&JSON.parse(checked.detail).status==='ready');
}catch(e){errors.push(e.stack??e.message);}finally{await browser?.close();await app?.close();}
const result={schema:1,status:errors.length?'failed':'passed',checks,checksPassed:checks.length,errors,run:run?.directory??null,scope:'Actual browser workbench, original donor, minimal renderer and two native Linux recipients. Network isolation is recorded by the invoking lane.'};await saveJson(join(flags.out,'RESULT.json'),result);console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
