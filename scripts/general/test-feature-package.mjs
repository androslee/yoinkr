import {sha256} from '../../src/workspace.js';
import {verifyFeaturePackage} from '../../src/feature-package.js';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const flags={};for(let i=2;i<process.argv.length;i+=2){if(!['--package','--out'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --package <verified package> --out <new evidence directory>');flags[process.argv[i].slice(2)]=process.argv[i+1];}
if(!flags.package||!flags.out||!process.env.PLAYWRIGHT_MODULE)throw Error('Package, output and PLAYWRIGHT_MODULE required');
const root=resolve(flags.package),out=resolve(flags.out),verified=await verifyFeaturePackage(root);
await mkdir(out,{recursive:false});
// Load verified bytes once; changing files on disk cannot change the served payload.
const payload=new Map(await Promise.all(['index.html','feature.js'].map(async n=>{const b=await readFile(join(root,'payload',n));assert.equal(sha256(b),verified.payloadSha256[n]);return [n,b]})));
const server=createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url?.slice(1);if(!payload.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.setHeader('Cache-Control','no-store');res.end(payload.get(name));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE),browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],checks=[],shots=[],consoleMessages=[];let failure,performanceSamples;
const page=await browser.newPage({permissions:['clipboard-read','clipboard-write'],viewport:{width:1000,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type())&&consoleMessages.length<50)consoleMessages.push({type:m.type(),text:m.text().slice(0,1024)})});
const check=async(name,fn)=>{await fn();checks.push(name)};
const shot=async name=>{await page.screenshot({path:join(out,name+'.png'),fullPage:true});shots.push(name+'.png')};
const update=state=>page.evaluate(s=>window.instance.update(s),state);
try {
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-feature]').waitFor();
 await check('Original Raw/Diff controls mounted',async()=>assert.equal(await page.locator('#valueRendererDisplayMode-diff').getAttribute('aria-pressed'),'true'));
 await check('Original JSON renderer, gutters and diff counts',async()=>{assert.match(await page.locator('[data-testid=comparison]').innerText(),/Comparing with previous/);assert.ok(await page.locator('.token.property').count()>0);assert.ok(await page.locator('[aria-label="Charts unavailable"]').count()>0)});
 await shot('original-diff-dark');
 await page.locator('#valueRendererDisplayMode-raw').click();
 await check('Original Raw control changes feature store',async()=>assert.equal(await page.evaluate(()=>window.instance.snapshot().mode),'raw'));
 await check('Original raw display shows both values',async()=>{const s=await page.locator('[data-testid=comparison]').innerText();assert.match(s,/ready/);assert.match(s,/running/)});
 await page.getByText('Message 1',{exact:true}).click();await page.locator('#valueRendererDisplayMode-diff').click();
 await check('Original history drawer selects comparison',async()=>{assert.equal(await page.evaluate(()=>window.instance.snapshot().selected),0);assert.match(await page.locator('[data-testid=comparison]').innerText(),/Comparing with selected/)});
 await page.getByText('Message 1',{exact:true}).click();
 await check('History selection toggles off',async()=>assert.equal(await page.evaluate(()=>window.instance.snapshot().selected),null));
 await page.getByRole('button',{name:'Copy payload',exact:true}).click();await page.waitForFunction(()=>window.copied.length===1);
 await check('Explicit clipboard capability receives exact payload',async()=>{assert.deepEqual(await page.evaluate(()=>window.copied),['{"status":"running","n":2}']);assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'{"status":"running","n":2}')} );
 await update({topic:'other/topic',messages:['before\nline','after\nline'],theme:'light',mode:'diff'});
 await check('Topic switch and live immutable update remove stale content',async()=>{assert.equal(await page.getByTestId('topic').innerText(),'other/topic');const s=await page.getByTestId('comparison').innerText();assert.match(s,/after/);assert.doesNotMatch(s,/running/)});
 await check('Original light theme applied',async()=>assert.equal(await page.locator('[data-feature]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(250, 250, 250)'));
 await shot('original-text-light');
 for(const [name,value] of [['Unicode','snow 雪 — café 🚀'],['Malformed JSON','{"oops":'],['Empty string','']]){
  await update({topic:'edge/'+name,messages:[value],mode:'raw'});
  await check(name+' preserved without truncation',async()=>{assert.equal(await page.evaluate(()=>window.instance.snapshot().messages[0]),value);if(value)assert.ok((await page.getByTestId('comparison').innerText()).includes(value))});
 }
 await update({topic:'keyboard',messages:['previous','keyboard selection'],mode:'raw'});
 const code=page.locator('[data-testid=comparison] [tabindex="0"]').first();await code.focus();await page.keyboard.press('Control+a');
 await check('Original Ctrl+A handler selects rendered payload',async()=>assert.equal(await page.evaluate(()=>String(window.getSelection())),'keyboard selection'));
 await page.setViewportSize({width:480,height:700});
 await check('Original controls survive narrow resize',async()=>assert.equal(await page.locator('#valueRendererDisplayMode-raw').isVisible(),true));await shot('narrow-original-controls');
 await check('Input limits refuse oversized state without losing prior state',async()=>{const result=await page.evaluate(()=>{try{window.instance.update({topic:'large',messages:['x'.repeat(131073)]});return false}catch(e){return {message:e.message,topic:window.instance.snapshot().topic}}});assert.match(result.message,/128 KiB/);assert.equal(result.topic,'keyboard')});
 await check('Invalid selection refused',async()=>assert.match(await page.evaluate(()=>{try{window.instance.update({topic:'bad',messages:['x'],selected:9})}catch(e){return e.message}}),/index/));
 await check('Missing host capability refused before mount',async()=>assert.match(await page.evaluate(()=>{try{window.featureModule.mount(document.createElement('div'),{topic:'x',messages:['x']},{})}catch(e){return e.message}}),/clipboard.writeText/));
 await check('Two feature instances keep state independent',async()=>{const result=await page.evaluate(()=>{const e=document.createElement('div');document.body.append(e);const b=window.featureModule.mount(e,{topic:'independent',messages:['isolated'],theme:'light'},window.capabilities);const before=window.instance.snapshot();b.update({topic:'independent-2',messages:['changed'],mode:'raw'});const unchanged=JSON.stringify(before)===JSON.stringify(window.instance.snapshot());b.dispose();e.remove();return unchanged});assert.equal(result,true)});
 performanceSamples=await page.evaluate(()=>[1024,10240,102400].map(total=>{const samples=[];for(let i=0;i<5;i++){const text='x'.repeat(total/2-2)+i;const start=performance.now();window.instance.update({topic:'perf',messages:[text+'a',text+'b'],mode:'diff'});samples.push(performance.now()-start)}return {combinedBytes:total,samplesMs:samples}}));
 const life=await page.evaluate(()=>{const element=document.querySelector('#feature');window.instance.dispose();let refused=false;try{window.instance.snapshot()}catch{refused=true}let maxStyles=0;for(let i=0;i<50;i++){const x=window.featureModule.mount(element,{topic:'cycle/'+i,messages:['one','two']},window.capabilities);x.update({topic:'cycle/'+i,messages:['two','three'],theme:i%2?'dark':'light'});x.dispose();if(element.childNodes.length)throw Error('Leaked feature DOM');maxStyles=Math.max(maxStyles,document.querySelectorAll('style').length)}return {refused,remainingNodes:element.childNodes.length,remainingStyles:document.querySelectorAll('style').length,maxStyles}});
 await check('50 mount/update/dispose cycles release DOM and JSS sheets',async()=>{assert.equal(life.refused,true);assert.equal(life.remainingNodes,0);assert.ok(life.remainingStyles<8);assert.ok(life.maxStyles<8)});
 await check('No browser runtime errors',async()=>assert.deepEqual(errors,[]));
} catch(e){failure={message:e.message,stack:e.stack};await shot('failure').catch(()=>{});} finally {await browser.close();await new Promise(r=>server.close(r));}
const result={schema:1,status:failure?'failed':'passed',package:verified,checks,checksPassed:checks.length,screenshots:shots,pageErrors:errors,consoleMessages,performanceSamples,failure,limits:'Minimal-host component/lifecycle proof. Original full-app baseline retained separately; recipient equivalence and heap/listener instrumentation are later milestones.'};
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));if(failure)process.exitCode=1;
