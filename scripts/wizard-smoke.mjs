import {verificationOutput} from './verification-output.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startWorkbench} from '../src/workbench.js';
const project=fileURLToPath(new URL('..',import.meta.url));
const prior=JSON.parse(await readFile((process.env.YOINKR_CASE??process.env.MODKIT_CASE)??join(project,'builds/feature-examples-v0.4/mqtt-case/case.json'),'utf8'));
const out=await verificationOutput('wizard', process.env.YOINKR_WIZARD_EVIDENCE??process.env.MODKIT_WIZARD_EVIDENCE);await mkdir(out,{recursive:true});
const donor=prior.donor.path,recipient=prior.recipient.path,source='backend/src/Model/TreeNodeFactory.ts';
const original=await readFile(join(donor,source));const sha=b=>createHash('sha256').update(b).digest('hex');
const app=await startWorkbench({cases:[],applications:[donor,recipient],port:0,caseRoot:join(out,'cases'),reportRoot:join(out,'reports')});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const checks=[];
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(app.url);await page.locator('#connection').filter({hasText:'Local service ready'}).waitFor();
 assert.equal(await page.locator('#case option').count(),0);assert.equal(await page.locator('#investigate-fields').isVisible(),true);assert.equal(await page.locator('#donor-app option').count(),2);
 await page.locator('#feature').fill('MQTT Explorer topic-node construction — browser investigation');await page.locator('#create-seed').fill(source);await page.locator('#route').selectOption('direct');
 await page.locator('#investigate-fields summary').click();
 await page.locator('#donor-sources').fill([source,'backend/src/Model/TreeNode.ts','backend/src/Model/Destroyable.ts'].join('\n'));await page.locator('#recipient-sources').fill('controller.cjs');
 // Invalid selections are rejected without launching a backend job.
 await page.locator('#recipient-app').selectOption({index:0});await page.locator('#run').click();await page.locator('#status').filter({hasText:'two different applications'}).waitFor();assert.equal(await page.locator('.job').count(),0);await page.locator('#recipient-app').selectOption({index:1});
 checks.push('Empty workbench starts a registered-app wizard and rejects a donor/recipient identity collision');
 await page.locator('#run').click();
 const completed=async n=>{await page.waitForFunction(n=>document.querySelectorAll('.job').length===n&&document.querySelector('.job strong')?.textContent.includes('complete'),n,{timeout:240000});};
 await completed(1);await page.locator('#export-fields').waitFor();assert.equal(await page.locator('#case option').count(),1);
 const dir=(await readdir(app.caseRoot)).find(n=>n.startsWith('case-')),root=join(app.caseRoot,dir),record=JSON.parse(await readFile(join(root,'case.json'),'utf8'));
 assert.equal(record.provider.version,'6.7.0');assert.equal(record.acceptance.status,'not-run');assert.equal(record.route.selected,'direct');assert.deepEqual(record.scope.donorSources,[source,'backend/src/Model/TreeNode.ts','backend/src/Model/Destroyable.ts']);assert.ok(record.trace.files.includes(source));
 for(const name of ['donor','recipient','trace']){const bytes=await readFile(join(root,'evidence',name+'.json'));assert.equal(sha(bytes),record.evidenceHashes[name+'.json']);assert.equal(JSON.parse(bytes).ok,true);}
 checks.push('Browser runs actual upstream REA donor/recipient analysis and feature tracing, retains hash-bound Evidence and registers the resulting case');
 await page.screenshot({path:join(out,'investigation-created.png')});
 await page.locator('#select-traced').click();assert.ok(await page.locator('#file-choices input:checked').count()>0);await page.locator('#clear-files').click();assert.equal(await page.locator('#file-choices input:checked').count(),0);
 await page.locator('#file-choices input').evaluateAll((inputs,path)=>{const c=inputs.find(c=>c.value===path);c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));},source);
 // Extra original donor files intentionally outside the scoped graph are labelled extraction-only.
 await page.locator('#extra-files').fill('LICENSE.md');await page.locator('#run').click();await completed(2);await page.locator('#report-fields').waitFor();assert.equal(await page.locator('#export option').count(),2);
 const exports=(await readdir(join(root,'private'))).filter(n=>n.startsWith('export-'));assert.equal(exports.length,1);const manifest=JSON.parse(await readFile(join(root,'private',exports[0],'EXPORT.json'),'utf8'));
 assert.equal(manifest.files.length,2);assert.equal(manifest.files.find(f=>f.path===source).analysisBound,true);assert.equal(manifest.files.find(f=>f.path==='LICENSE.md').analysisBound,false);assert.equal(await readFile(join(root,'private',exports[0],'files',source),'utf8'),original.toString());assert.equal(manifest.status,'extracted-not-integrated');
 checks.push('Explicit checkbox/asset selection exports original donor bytes, separates analysis-bound and extraction-only provenance, and offers the export immediately');
 await page.locator('#run').click();await completed(3);const frame=page.frameLocator('#report-frame');await frame.locator('#source-inspector').waitFor({timeout:30000});await frame.locator('#source-file').selectOption(source);assert.match(await frame.locator('#source-code').innerText(),/class TreeNodeFactory/);assert.equal(await page.locator('#report-frame').getAttribute('sandbox'),'allow-scripts');
 await page.screenshot({path:join(out,'recovered-report.png')});checks.push('Newly created case and selected export feed a real standalone source/graph report in the isolated preview');
 await page.reload();await page.locator('#connection').filter({hasText:'Local service ready'}).waitFor();assert.equal(await page.locator('#case option').count(),1);assert.equal(await page.locator('#export option').count(),2);
 await page.locator('[data-action="export"]').click();await page.locator('#extra-files').fill('../outside');await page.locator('#run').click();await page.locator('#status').filter({hasText:'relative artifact path'}).waitFor();assert.equal(await page.locator('#run').isDisabled(),false);
 await page.locator('#extra-files').fill('missing-file.js');await page.locator('#run').click();await page.locator('#status').filter({hasText:'Operation failed'}).waitFor();assert.equal(await page.locator('#run').isDisabled(),false);
 checks.push('Reload retains session case/export choices; traversal rejection and missing-file failure release controls without creating a partial export');
 await page.setViewportSize({width:650,height:1000});await page.locator('#new-investigation').click();assert.ok(await page.locator('#investigate-fields').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:join(out,'wizard-small.png')});
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(app.url+'/')));assert.equal(sha(await readFile(join(donor,source))),sha(original));assert.equal((await readdir(join(root,'private'))).length,1);
 checks.push('Narrow wizard fits the screen; original donor bytes remain unchanged; all browser traffic is local with no JavaScript errors');
 await writeFile(join(out,'VERIFICATION.json'),JSON.stringify({version:'0.9.0',checks,errors,requests,case:root,donorSourceSHA256:sha(original),scope:'Actual browser-launched scoped MQTT Explorer REA investigation, original-file export and source report. No new recipient integration or behavioral acceptance is claimed.'},null,2)+'\n');console.log('INVESTIGATION WIZARD CHECKS PASSED:',checks.length);console.log('Evidence:',out);
}finally{await browser.close();await app.close();}
