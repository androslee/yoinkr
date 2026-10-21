#!/usr/bin/env node
// Yoinkr — REA-backed investigation and local feature transfer; Electron delivery.
// Existing application installations are preserved. The loader uses CDP;
// integration writes only into new recipient working copies.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {buildLibrary} from './library.js';
import {resolveHome} from './branding.js';
import {prepareNativeComponent,nativeComponentStatus,verifyNativeComponent,nativeChecksum} from './native-component.js';
import {planConversion,runConversion,conversionStatus} from './conversion.js';
import {planElectronPlaybook,applyElectronPlaybook,electronPlaybookStatus,rollbackElectronPlaybook} from './electron-playbook.js';
import {inspectUIRecipe} from './ui-recipe.js';
import {runUICheck} from './ui-checks.js';
import {saveExample,readExamples} from './examples.js';
import {startWorkbench} from './workbench.js';
import {queryCase} from './queries.js';
import {inspectSource} from './sources.js';
import {createCaseReport,followupTrace,searchNotes} from './investigation.js';
import {integrateFeature} from './workspace.js';
import {verifyWorkspace,workspaceStatus} from './verify.js';
import { investigate,exportFeature } from './research.js';
import { reaInfo } from './rea.js';
import { inspectApp,compareApps } from './inspect.js';
import { scan,inspectInstall } from './detect.js';
import { loadManifest } from './manifest.js';
import { computeState, makePin, checkDrift } from './drift.js';
import { loadState, saveState, explain } from './safemode.js';
import { buildPlan, launch } from './launcher.js';

const USAGE = `yoinkr — REA-backed application investigation and feature transfer

  yoinkr delivery-export <new-recipe-directory>
  yoinkr delivery-import <recipe-directory> --out <new-recipe-directory>
  yoinkr delivery-inspect <recipe-directory>
  yoinkr delivery-check <delivery.local.json>
  yoinkr delivery-run <delivery.local.json>
  yoinkr delivery-status <delivery-run-directory>
  yoinkr delivery-rollback <delivery-run-directory>
  yoinkr feature-shared <suite.json> --input-root <original-build> --feature-package <package> --recipient <adapter> --xvfb <binary> --out <new-proof>
  yoinkr feature-compare <donor-run> <recipient-run> --out <new-comparison.json>
  yoinkr adapter-assess <recipe.json> --reference <supported-runtime> --candidate <other-runtime> --out <new-proposal>
  yoinkr component-build <verified-native-workspace> --out <new-component-package>
  yoinkr component-status <component-package>
  yoinkr host-adapters
  yoinkr host-plan <adapter.json> --input-root <runtime> --feature-package <package> [--python <interpreter>]
  yoinkr host-apply <adapter.json> --input-root <runtime> --feature-package <package> --out <new-adapter> [--python <interpreter>]
  yoinkr host-launch <adapter-directory> [--profile demo] [--no-sandbox]
  yoinkr host-status <adapter-directory>
  yoinkr host-rollback <adapter-directory> [--dry-run]
  yoinkr feature-package <recipe.json> --input-root <original-build> [--source <checkout>] --route source|bundle [--evidence <REA.json>] --out <new-package>
  yoinkr feature-package-preview <package> [--port 0] [--digest <expected-sha256>]
  yoinkr feature-package-status <package> [--digest <expected-sha256>]
  yoinkr feature-prepare <recipe.json> --input-root <original-build> --case <REA-case> --out <new-session>
  yoinkr feature-status <session>
  yoinkr feature-report <session> --out <new-report.html>
  yoinkr mcp --config <agent.json>
  yoinkr mcp-config --config <agent.json> --out <new-client.json> [--include-rea]
  yoinkr workbench [--case <case-directory>] [--delivery-config <delivery.local.json>] [--port 4195] [--report-root <directory>] [--app <application-path>] [--case-root <directory>] [--workspace <prepared-workspace>] [--ui-recipe <recipe.json>] [--knowledge-root <directory>] [--finding-root <directory>]
  yoinkr case-report <case-directory> --out <new-report.html> [--export <export-directory>] [--history-limit 8]
  yoinkr case-example <case-directory> --example <example.json> [--screenshot <image.png>]
  yoinkr case-examples <case-directory> [--limit 16]
  yoinkr case-query <case-directory> [--view summary|modules|module|facts] [--path <exact-path>] [--node <id>] [--kind <module-kind>] [--property <name>] [--available-keys] [--offset 0] [--limit 20] [--side donor|recipient]
  yoinkr case-source <case-directory> --export <export-directory> --file <path> [--line 1] [--column 0] [--map <path>]
  yoinkr trace <case-directory> --seed <literal> [--seed-kind module|string|api|ipc|node-id] [--side donor|recipient] [--direction outgoing|incoming|both]
  yoinkr library-search <search-root> [--knowledge-root <directory>] [--finding-root <directory>] [--query <text>] [--kind case|note|native|module|conversion|playbook|verification|finding] [--limit 20] [--offset 0]
  yoinkr notes <search-root> --query <text> [--limit 20]
  yoinkr integrate <case-directory> --export <export-directory> --recipe <recipe.json> --out <new-workspace>
  yoinkr ui-check <registered-recipe.json>
  yoinkr verify <workspace> [--timeout-ms 5000] [--example-id <saved-id>]
  yoinkr workspace <workspace>
  yoinkr electron-plan <runtime-directory> --recipe <playbook.json>
  yoinkr electron-apply <runtime-directory> --recipe <playbook.json> --out <new-workspace>
  yoinkr electron-status <workspace>
  yoinkr electron-rollback <workspace> [--dry-run]
  yoinkr conversion-plan <recipe.json> --input-root <directory>
  yoinkr convert <recipe.json> --input-root <directory> --out <new-run>
  yoinkr conversion-status <run-directory>
  yoinkr native-prepare <recipe.json> --input-root <directory> --python <absolute-python> --out <new-workspace>
  yoinkr native-status <workspace>
  yoinkr native-verify <workspace> --python <absolute-python> [--timeout-ms 5000]
  yoinkr native-checksum <workspace> --input-root <directory> --file <relative-file> --python <absolute-python> --out <new-report.json>
  yoinkr backend
  yoinkr investigate <donor-path> <recipient-path> --feature <description> --seed <module-or-literal> --out <new-case-directory> [--seed-kind module|string|api|ipc] [--route direct|convert|bridge|rebuild]
  yoinkr export-feature <case-directory> [--traced] [--file <artifact-path>]
  yoinkr inspect <app-id> [--app-dir <install>] [--json]
  yoinkr compare <source-install-dir> <target-install-dir>
  yoinkr list
  yoinkr validate <mod-dir>
  yoinkr plan   <app-id> [--mod <dir>] [--dry-run]
  yoinkr launch <app-id> [--mod <dir>] [--safe-mode] [--force] [--on-drift refuse|warn|continue]
  yoinkr pin    <app-id>            # baseline the asar the mods were tested against
  yoinkr state  <app-id>            # what is disabled, and why
  yoinkr enable <app-id> <mod-id>
  yoinkr disable <app-id> <mod-id>

Mods are read from $YOINKR_HOME/mods (default ~/.yoinkr/mods; existing ~/.modkit is supported) plus any --mod dirs.
Existing app installations are preserved. Loader mods use CDP; integration writes new working copies.`;

const args = process.argv.slice(2);
const command = args[0];
const positional = [];
const flags = { mod: [], file: [], donor_source: [], recipient_source: [], path: [], property: [], case: [], app: [], workspace: [], example_id: [], ui_recipe: [], knowledge_root: [] };
const values=new Set(['mod','home','app-dir','executable','on-drift','feature','seed','seed-kind','out','route','file','donor-source','recipient-source','export','recipe','timeout-ms','side','direction','query','limit','line','column','map','view','path','node','property','offset','history-limit','kind','case','port','report-root','app','case-root','example','screenshot','workspace','example-id','ui-recipe','input-root','python','knowledge-root','finding-root','config','source','evidence','digest','feature-package','profile','recipient','xvfb','reference','candidate','delivery-config']);
const booleans=new Set(['safe-mode','force','dry-run','json','traced','available-keys','include-rea','no-sandbox']);
for(let i=1;i<args.length;i++){
 const a=args[i];
 if(!a.startsWith('--')){positional.push(a);continue;}
 const key=a.slice(2),dest=key.replace(/-/g,'_');
 if(booleans.has(key)){flags[dest]=true;continue;}
 if(!values.has(key))throw Error(`unknown option: ${a}`);
 if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`${a} requires a value`);
 const value=args[++i];if(['mod','file','donor-source','recipient-source','path','property','case','app','workspace','example-id','ui-recipe','knowledge-root'].includes(key))flags[dest].push(value);else flags[dest]=value;
}
if(flags.on_drift&&!['refuse','warn','continue'].includes(flags.on_drift))throw Error('on-drift must be refuse, warn or continue; use pin to rebaseline');

const home=resolveHome({explicit:flags.home});

function modDirs() {
  const dirs = flags.mod.map((d) => resolve(d));
  const root = join(home, 'mods');
  if (existsSync(root)) {
    for (const entry of readdirSync(root).sort()) {
      const dir = join(root, entry);
      if (existsSync(join(dir, 'mod.json')) && !dirs.includes(dir)) dirs.push(dir);
    }
  }
  return dirs;
}

function loadMods() {
  const mods = [];
  for (const dir of modDirs()) {
    try {
      const res = loadManifest(dir);
      if (!res.ok) { console.warn(`skip ${dir}: ${res.errors.join('; ')}`); continue; }
      for (const w of res.warnings) console.warn(`warn ${dir}: ${w}`);
      mods.push({ dir, manifest: res.manifest });
    } catch (err) { console.warn(`skip ${dir}: ${err.message}`); }
  }
  return mods;
}

function findApp(appId) {
  if(flags.app_dir){const app=inspectInstall(resolve(flags.app_dir));if(!app)throw Error('no Electron resources in --app-dir');app.appId=appId;if(flags.executable)app.executable=resolve(flags.executable);return app;}
  const app = scan().find((a) => a.appId === appId);
  if (!app) {
    const known = scan().map((a) => a.appId).join(', ') || 'none found';
    throw new Error(`no installed app "${appId}". Detected: ${known}`);
  }
  if(flags.executable)app.executable=resolve(flags.executable);
  return app;
}

const stateDir=appId=>{if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(appId))throw Error('invalid app id');return join(home,'state',appId);};

function readPin(appId) {
  const file = join(stateDir(appId), 'pin.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

if(command?.startsWith('delivery-')){
 if(positional.length!==1)throw Error('Give one delivery config, bundle or run directory; see --help');
 const d=await import('./delivery.js'),input=positional[0];let result;
 if(command==='delivery-export')result=await d.exportDeliveryBundle(input);
 else if(command==='delivery-import'){if(!flags.out)throw Error('--out required');result=await d.importDeliveryBundle(input,flags.out);}
 else if(command==='delivery-inspect')result=await d.inspectDeliveryBundle(input);
 else if(command==='delivery-check')result=await d.checkDelivery(input);
 else if(command==='delivery-run')result=await d.runDelivery(input,{onProgress:s=>console.error(s.status+': '+s.name+' — '+s.directory)});
 else if(command==='delivery-status')result=await d.deliveryStatus(input);
 else if(command==='delivery-rollback')result=await d.rollbackDelivery(input);
 else throw Error('Unknown delivery command');
 console.log(JSON.stringify(result,null,2));if(['blocked','failed'].includes(result.status))process.exitCode=1;
}else if(command==='adapter-assess'){if(positional.length!==1||!flags.reference||!flags.candidate||!flags.out)throw Error('Give recipe, --reference, --candidate and --out');const {assessWithEvidence}=await import('./repair-evidence.js');const result=await assessWithEvidence({recipe:positional[0],reference:flags.reference,candidate:flags.candidate,out:flags.out});console.log(JSON.stringify(result,null,2));if(result.status==='blocked')process.exitCode=1;
}else if(command==='component-build'){if(positional.length!==1||!flags.out)throw Error('Give native workspace and --out');const {buildComponentPackage}=await import('./component-package.js');console.log(JSON.stringify(await buildComponentPackage(positional[0],flags.out),null,2));
}else if(command==='component-status'){if(positional.length!==1)throw Error('Give component package');const {verifyComponentPackage}=await import('./component-package.js');console.log(JSON.stringify(await verifyComponentPackage(positional[0]),null,2));
}else if(command==='feature-shared'){
 if(positional.length!==1||!flags.input_root||!flags.feature_package||!flags.recipient||!flags.xvfb||!flags.out)throw Error('Give suite, --input-root, --feature-package, --recipient, --xvfb and --out');const {runSharedAcceptance}=await import('./feature-acceptance.js');const result=await runSharedAcceptance({suitePath:positional[0],donorRoot:flags.input_root,featurePackage:flags.feature_package,recipient:flags.recipient,xvfb:flags.xvfb,out:flags.out});if(result.status!=='passed')process.exitCode=1;
}else if(command==='feature-compare'){
 if(positional.length!==2||!flags.out)throw Error('Give donor run, recipient run and --out');const {compareFeatureRuns}=await import('./feature-verify.js');const result=await compareFeatureRuns(positional[0],positional[1],flags.out);console.log(JSON.stringify(result,null,2));if(result.status!=='passed')process.exitCode=1;
}else if(command==='host-adapters'){
 const {hostAdapterCatalog}=await import('./host-adapters/index.js');console.log(JSON.stringify(hostAdapterCatalog(),null,2));
}else if(command==='host-plan'||command==='host-apply'){
 if(positional.length!==1||!flags.input_root||!flags.feature_package||command==='host-apply'&&!flags.out)throw Error('Give adapter recipe, --input-root, --feature-package and --out for apply');const adapters=await import('./host-adapters/index.js');console.log(JSON.stringify(await adapters[command==='host-plan'?'planHostAdapter':'applyHostAdapter'](positional[0],{runtime:flags.input_root,featurePackage:flags.feature_package,out:flags.out,python:flags.python}),null,2));
}else if(command==='host-launch'){
 if(positional.length!==1)throw Error('Give an adapter directory');const {activateHostAdapter}=await import('./host-adapters/index.js');const child=await activateHostAdapter(positional[0],{profile:flags.profile??'demo',noSandbox:flags.no_sandbox});child.once('error',e=>{console.error(e.message);process.exitCode=1});child.once('exit',code=>process.exitCode=code??1);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
}else if(command==='host-status'||command==='host-rollback'){
 if(positional.length!==1)throw Error('Give an adapter directory');const adapters=await import('./host-adapters/index.js');console.log(JSON.stringify(await adapters[command==='host-status'?'hostAdapterStatus':'rollbackHostAdapter'](positional[0],{dryRun:flags.dry_run}),null,2));
}else if(command==='feature-package'){
 if(positional.length!==1||!flags.input_root||!flags.out)throw Error('Give recipe, --input-root and --out');const {buildFeaturePackage}=await import('./feature-package.js');console.log(JSON.stringify(await buildFeaturePackage(positional[0],{donorRoot:flags.input_root,sourceRoot:flags.source,route:flags.route,out:flags.out,evidence:flags.evidence?[flags.evidence]:[]}),null,2));
}else if(command==='feature-package-preview'){
 if(positional.length!==1)throw Error('Give a recovered package');const {serveFeaturePackage}=await import('./feature-package.js');const preview=await serveFeaturePackage(positional[0],{port:flags.port===undefined?0:Number(flags.port),expectedDigest:flags.digest});console.log(JSON.stringify({url:preview.url,...preview.verified},null,2));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>process.exit(0)));
}else if(command==='feature-package-status'){
 if(positional.length!==1)throw Error('Give a recovered package');const {verifyFeaturePackage}=await import('./feature-package.js');console.log(JSON.stringify(await verifyFeaturePackage(positional[0],{expectedDigest:flags.digest}),null,2));
}else if(command==='feature-prepare'){
 if(positional.length!==1||!flags.input_root||flags.case.length!==1||!flags.out)throw Error('give recipe, --input-root, one --case and --out');const {prepareFeatureSession}=await import('./feature-session.js');const session=await prepareFeatureSession(positional[0],{donorRoot:flags.input_root,casePath:flags.case[0],out:flags.out});console.log(JSON.stringify({directory:session.directory,...session.record},null,2));
}else if(command==='feature-status'){
 if(positional.length!==1)throw Error('give a feature session');const {inspectFeatureSession}=await import('./feature-session.js');console.log(JSON.stringify((await inspectFeatureSession(positional[0])).record,null,2));
}else if(command==='feature-report'){
 if(positional.length!==1||!flags.out)throw Error('give a feature session and --out');const {createFeatureReport}=await import('./feature-report.js');console.log(JSON.stringify(await createFeatureReport(positional[0],flags.out),null,2));
}else if(command==='mcp'){
 if(positional.length||!flags.config)throw Error('give --config <agent.json>');
 const {startAgentMcp}=await import('./agent-mcp.js');const app=await startAgentMcp(flags.config);
 console.error('Yoinkr MCP ready (stdio). No host configuration changed.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});});
}else if(command==='mcp-config'){
 if(positional.length||!flags.config||!flags.out)throw Error('give --config and --out');
 const {writeMcpClientConfig}=await import('./agent-mcp.js');console.log(JSON.stringify(await writeMcpClientConfig(flags.config,flags.out,{includeRea:!!flags.include_rea}),null,2));
}else if(command==='library-search'){
 if(positional.length!==1)throw Error('give a library root');const library=await buildLibrary([positional[0],...flags.knowledge_root],{findingRoot:flags.finding_root,deliveryConfig:flags.delivery_config});console.log(JSON.stringify(library.search({query:flags.query??'',kind:flags.kind??'',offset:Number(flags.offset??0),limit:Number(flags.limit??20)}),null,2));
}else if(command==='native-prepare'){
 if(positional.length!==1||!flags.input_root||!flags.python||!flags.out)throw Error('give recipe, --input-root, --python and --out');console.log(JSON.stringify(await prepareNativeComponent(positional[0],flags.input_root,{python:flags.python,out:flags.out}),null,2));
}else if(command==='native-status'){
 if(positional.length!==1)throw Error('give native workspace');const status=await nativeComponentStatus(positional[0]);console.log(JSON.stringify(status,null,2));if(!status.clean)process.exitCode=1;
}else if(command==='native-verify'){
 if(positional.length!==1||!flags.python)throw Error('give native workspace and --python');const report=await verifyNativeComponent(positional[0],{python:flags.python,timeoutMs:flags.timeout_ms===undefined?5000:Number(flags.timeout_ms)});console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}else if(command==='native-checksum'){
 if(positional.length!==1||!flags.input_root||!flags.python||!flags.out)throw Error('give native workspace, --input-root, --file, --python and --out');console.log(JSON.stringify(await nativeChecksum(positional[0],{inputRoot:flags.input_root,files:flags.file,python:flags.python,out:flags.out,timeoutMs:flags.timeout_ms===undefined?5000:Number(flags.timeout_ms)}),null,2));
}else if(command==='conversion-plan'||command==='convert'){
 if(positional.length!==1||!flags.input_root||(command==='convert'&&!flags.out))throw Error('give recipe, --input-root and (for convert) --out');console.log(JSON.stringify(await (command==='conversion-plan'?planConversion(positional[0],flags.input_root):runConversion(positional[0],flags.input_root,flags.out)),null,2));
}else if(command==='conversion-status'){
 if(positional.length!==1)throw Error('give a conversion run');const status=await conversionStatus(positional[0]);console.log(JSON.stringify(status,null,2));if(!status.clean)process.exitCode=1;
}else if(command==='electron-plan'||command==='electron-apply'){
 if(positional.length!==1||!flags.recipe||(command==='electron-apply'&&!flags.out))throw Error('give runtime directory, --recipe and (for apply) --out');
 console.log(JSON.stringify(await (command==='electron-plan'?planElectronPlaybook(positional[0],flags.recipe):applyElectronPlaybook(positional[0],flags.recipe,flags.out)),null,2));
}else if(command==='electron-status'||command==='electron-rollback'){
 if(positional.length!==1)throw Error('give a playbook workspace');const result=await (command==='electron-status'?electronPlaybookStatus(positional[0]):rollbackElectronPlaybook(positional[0],{dryRun:!!flags.dry_run}));console.log(JSON.stringify(result,null,2));if(result.clean===false)process.exitCode=1;
}else if(command==='workbench'){
 if(positional.length)throw Error('use repeated --case paths to register cases');const app=await startWorkbench({cases:flags.case.length?flags.case:(flags.app.length||flags.workspace.length||flags.ui_recipe.length||flags.knowledge_root.length||flags.delivery_config)?[]:undefined,port:flags.port===undefined?4195:Number(flags.port),reportRoot:flags.report_root,caseRoot:flags.case_root,applications:flags.app,workspaces:flags.workspace,uiRecipes:flags.ui_recipe,knowledgeRoots:flags.knowledge_root,findingRoot:flags.finding_root,deliveryConfig:flags.delivery_config});console.log('Yoinkr workbench: '+app.url);console.log('Ctrl+C closes this workbench. Saved Evidence and reports remain on disk.');let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;console.log('Closing workbench; finishing any active operation…');await app.close();});
}else if(command==='ui-check'){
 if(positional.length!==1)throw Error('give a UI recipe');const result=await runUICheck(await inspectUIRecipe(positional[0]));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}else if(command==='case-example'){
 if(positional.length!==1||!flags.example)throw Error('give a case directory and --example JSON file');
 const {stat,readFile}=await import('node:fs/promises');if((await stat(flags.example)).size>32768)throw Error('example JSON exceeds 32 KiB');
 let screenshot;if(flags.screenshot){if((await stat(flags.screenshot)).size>4*1024*1024)throw Error('screenshot exceeds 4 MiB');screenshot=await readFile(flags.screenshot);}
 console.log(JSON.stringify(await saveExample(positional[0],JSON.parse(await readFile(flags.example,'utf8')),{screenshot}),null,2));
}else if(command==='case-examples'){
 if(positional.length!==1)throw Error('give a case directory');console.log(JSON.stringify(await readExamples(positional[0],{limit:flags.limit===undefined?16:Number(flags.limit),includeImages:false}),null,2));
}else if(command==='case-report'){
 if(positional.length!==1||!flags.out)throw Error('give a case directory and --out');console.log(JSON.stringify(await createCaseReport(positional[0],flags.out,{exportDirectory:flags.export,historyLimit:flags.history_limit===undefined?8:Number(flags.history_limit)}),null,2));
}else if(command==='case-query'){
 if(positional.length!==1)throw Error('give a case directory');console.log(JSON.stringify(await queryCase(positional[0],{side:flags.side??'donor',view:flags.view??'summary',paths:flags.path,properties:flags.property,node:flags.node,kind:flags.kind,offset:flags.offset===undefined?0:Number(flags.offset),limit:flags.limit===undefined?20:Number(flags.limit),availableKeys:flags.available_keys??false}),null,2));
}else if(command==='case-source'){
 if(positional.length!==1||!flags.export||flags.file.length!==1)throw Error('give a case, --export and one --file');console.log(JSON.stringify(await inspectSource(positional[0],{exportDirectory:flags.export,file:flags.file[0],line:flags.line===undefined?1:Number(flags.line),column:flags.column===undefined?0:Number(flags.column),map:flags.map}),null,2));
}else if(command==='trace'){
 if(positional.length!==1)throw Error('give a case directory');console.log(JSON.stringify(await followupTrace(positional[0],{seed:flags.seed,seedKind:flags.seed_kind??'module',side:flags.side??'donor',direction:flags.direction??'outgoing'}),null,2));
}else if(command==='notes'){
 if(positional.length!==1)throw Error('give a search root');console.log(JSON.stringify(await searchNotes(positional[0],flags.query,{limit:flags.limit===undefined?20:Number(flags.limit)}),null,2));
}else if(command==='integrate'){
 if(positional.length!==1||!flags.export||!flags.recipe||!flags.out)throw Error('give case, --export, --recipe and --out');console.log(JSON.stringify(await integrateFeature(positional[0],{exportDirectory:flags.export,recipe:flags.recipe,out:flags.out}),null,2));
}else if(command==='verify'){
 if(positional.length!==1)throw Error('give a workspace');const report=await verifyWorkspace(positional[0],{timeoutMs:flags.timeout_ms===undefined?5000:Number(flags.timeout_ms),exampleIds:flags.example_id.length?flags.example_id:undefined});console.log(JSON.stringify({directory:report.directory,passed:report.passed,cases:report.cases,workers:report.workers},null,2));if(!report.passed)process.exitCode=1;
}else if(command==='workspace'){console.log(JSON.stringify(await workspaceStatus(positional[0]),null,2));
}else if(command==='backend'){console.log(JSON.stringify(reaInfo(),null,2));
}else if(command==='investigate'){
 if(positional.length!==2||!flags.out)throw Error('give donor, recipient and --out');
 const record=await investigate({donor:positional[0],recipient:positional[1],feature:flags.feature,seed:flags.seed,seedKind:flags.seed_kind??'module',out:flags.out,route:flags.route??'undecided',donorSources:flags.donor_source,recipientSources:flags.recipient_source});
 console.log(JSON.stringify({caseDirectory:resolve(flags.out),status:record.status,provider:record.provider,trace:record.trace},null,2));
}else if(command==='export-feature'){
 if(positional.length!==1)throw Error('give a case directory');const exported=await exportFeature(positional[0],{files:flags.file,traced:!!flags.traced});console.log(JSON.stringify(exported,null,2));
}else if(command==='inspect'){console.log(JSON.stringify(inspectApp(findApp(positional[0]??'')),null,2));
}else if(command==='compare'){
 if(positional.length!==2)throw Error('usage: yoinkr compare <source-install-dir> <target-install-dir>');
 const apps=positional.map(p=>inspectInstall(resolve(p)));if(apps.some(a=>!a))throw Error('both directories must contain Electron resources');console.log(JSON.stringify(compareApps(...apps),null,2));
}else if (command === 'list') {
  const apps = scan();
  if (!apps.length) console.log('no Electron apps detected (looked in the usual install roots)');
  for (const a of apps) console.log(`${a.appId}\t${a.version ?? '?'}\t${a.asarPath ? 'asar' : 'unpacked'}\t${a.installDir}`);
} else if (command === 'validate') {
  if (!positional[0]) throw new Error('usage: yoinkr validate <mod-dir>');
  const res = loadManifest(resolve(positional[0]));
  for (const w of res.warnings) console.warn(`warn: ${w}`);
  for (const e of res.errors) console.error(`error: ${e}`);
  if (res.ok) console.log(`OK ${res.manifest.id}@${res.manifest.version} -> ${res.manifest.targets.map((t) => `${t.app}@${t.versions}`).join(', ')}`);
  process.exitCode = res.ok ? 0 : 1;
} else if (command === 'plan' || command === 'launch') {
  const app = findApp(positional[0] ?? '');
  const mods = loadMods();
  const state = loadState(stateDir(app.appId), app.appId);
  const opts = { pin: readPin(app.appId), safeMode: flags.safe_mode, onDrift: flags.on_drift ?? 'refuse', force: flags.force };
  if (!flags.dry_run && command === 'launch') {
    await launch({ app, mods, state, stateDir: stateDir(app.appId), opts });
  } else {
    const plan = await buildPlan({ app, mods, state, opts });
    console.log(`${plan.app.appId}@${plan.app.version ?? '?'}  pin=${plan.drift.verdict}`);
    console.log(`  will load: ${plan.enabled.map((m) => m.id).join(', ') || '(nothing)'}`);
    for (const s of plan.skipped) console.log(`  ${s}`);
    for (const n of plan.notes) console.log(`  note: ${n}`);
    for (const c of plan.conflicts) console.log(`  conflict(${c.severity}): ${c.detail} [${c.mods.join(', ')}]`);
    if (plan.blocked){console.log('  BLOCKED by policy (--force to override)');process.exitCode=1;}
  }
} else if (command === 'pin') {
  const app = findApp(positional[0] ?? '');
  const mods = loadMods().filter((m) => m.manifest.targets?.some((t) => t.app === app.appId || t.app === '*'));
  if (!app.asarPath) throw new Error(`${app.appId} has no app.asar to pin`);
  const state = await computeState(app);
  const pin = makePin(state, mods.map((m) => m.manifest.id));
  mkdirSync(stateDir(app.appId), { recursive: true });
  writeFileSync(join(stateDir(app.appId), 'pin.json'), JSON.stringify(pin, null, 2) + '\n');
  console.log(`pinned ${app.appId}@${state.appVersion} sha256=${state.asarSha256.slice(0, 12)}… for [${pin.mods.join(', ')}]`);
  console.log(`drift now: ${checkDrift(pin, state, 'refuse').verdict}`);
} else if (command === 'state' || command === 'enable' || command === 'disable') {
  const appId = positional[0] ?? '';
  const dir = stateDir(appId);
  const state = loadState(dir, appId);
  if (command === 'state') {
    const pin = readPin(appId);
    console.log(`pin: ${pin ? `${pin.appVersion} sha256=${pin.asarSha256.slice(0, 12)}… pinned ${pin.pinnedAt}` : 'none'}`);
    console.log(explain(state));
  } else {
    const modId = positional[1];
    if (!modId) throw new Error(`usage: yoinkr ${command} <app-id> <mod-id>`);
    if (command === 'enable') delete state.disabled[modId];
    else state.disabled[modId] = { reason: `disabled by hand`, at: new Date().toISOString() };
    mkdirSync(dir, { recursive: true });
    saveState(dir, state);
    console.log(`${modId}: ${command}d`);
  }
} else {
  console.log(USAGE);
  process.exitCode = command && !['help','--help','-h'].includes(command) ? 1 : 0;
}
