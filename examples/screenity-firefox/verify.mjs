// Actual Firefox WebDriver checks. Supply an installed GeckoDriver; no tool download here.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=dirname(fileURLToPath(import.meta.url));
const firefox=process.env.YOINKR_FIREFOX||join(root,'.local/firefox',process.platform==='win32'?'firefox.exe':'firefox');
const geckodriver=process.env.GECKODRIVER;
if(!geckodriver)throw new Error('Set GECKODRIVER to the absolute path of Mozilla GeckoDriver.');
const screenTest=process.argv.includes('--screen');
const out=resolve(process.argv.slice(2).find(arg=>arg!=='--screen')||join(root,'.local/verification'));
let displayProcess=null,displayEnv={...process.env};
if(screenTest){
 if(!process.env.YOINKR_XVFB)throw new Error('Screen capture tests require YOINKR_XVFB: a separate virtual display is mandatory.');
 displayProcess=spawn(process.env.YOINKR_XVFB,['-displayfd','3','-screen','0','1280x1050x24','-nolisten','tcp','-ac'],{stdio:['ignore','ignore','ignore','pipe']});
 const number=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Virtual display startup timed out')),10000);displayProcess.once('error',reject);displayProcess.once('exit',()=>reject(new Error('Virtual display exited')));displayProcess.stdio[3].once('data',chunk=>{clearTimeout(timer);resolve(String(chunk).trim());});});
 if(!/^\d+$/.test(number))throw new Error('Invalid virtual display number');
 displayEnv={...process.env,DISPLAY:':'+number,MOZ_ENABLE_WAYLAND:'0'};
}
await mkdir(out,{recursive:true});
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const driver=spawn(geckodriver,['--allow-system-access','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],env:displayEnv});
let logs='',session=null,failure=null,browserVersion=null;const checks=[];
driver.stdout.on('data',chunk=>logs+=chunk);driver.stderr.on('data',chunk=>logs+=chunk);
async function request(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const result=await response.json();if(!response.ok||result.value?.error)throw new Error(`${result.value?.error||response.status}: ${result.value?.message||JSON.stringify(result)}`);return result.value;
}
async function wait(fn,label){let last;for(let index=0;index<100;index++){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out: ${label}${last?' / '+last.message:''}`);}
const execute=(script,args=[])=>request(`/session/${session}/execute/sync`,{script,args});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const click=id=>execute('document.getElementById(arguments[0]).click()', [id]);
const status=()=>execute('return document.getElementById("status").textContent');
const pixels=()=>execute('const a=document.querySelector("canvas.lower-canvas").getContext("2d").getImageData(0,0,960,540).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i])n++;return n;');
async function draw(tool,x=150,y=220){
 await execute('document.querySelector(`[data-tool="${arguments[0]}"]`).click()', [tool]);
 const element=await request(`/session/${session}/element`,{using:'css selector',value:'canvas.upper-canvas'});
 await execute('arguments[0].scrollIntoView({block:"center"});',[element]);
 const rect=await execute('const r=arguments[0].getBoundingClientRect();return {x:r.x,y:r.y};',[element]);
 const actions=[{type:'pointerMove',duration:0,x:Math.round(rect.x+x),y:Math.round(rect.y+y)},{type:'pointerDown',button:0}];
 for(let i=1;i<=6;i++)actions.push({type:'pointerMove',duration:50,x:Math.round(rect.x+x+i*20),y:Math.round(rect.y+y+i*8)});
 actions.push({type:'pointerUp',button:0});
 await request(`/session/${session}/actions`,{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions}]});
 await request(`/session/${session}/actions`,undefined,'DELETE');
}
try{
 await wait(()=>request('/status'),'driver startup');
 const created=await request('/session',{capabilities:{alwaysMatch:{browserName:'firefox','moz:firefoxOptions':{binary:firefox,args:screenTest?['--width','1280','--height','1050']:['-headless','--width','1280','--height','1050'],prefs:{'browser.shell.checkDefaultBrowser':false,'browser.startup.homepage_override.mstone':'ignore','toolkit.telemetry.enabled':false}}}}});
 session=created.sessionId;browserVersion=created.capabilities.browserVersion;
 await request(`/session/${session}/window/rect`,{width:1280,height:1050});
 await request(`/session/${session}/moz/addon/install`,{path:join(root,'.local/demo/extension'),temporary:true});
 let studioHandle;
 await wait(async()=>{for(const handle of await request(`/session/${session}/window/handles`)){await request(`/session/${session}/window`,{handle});const url=await request(`/session/${session}/url`);if(url.startsWith('moz-extension:')&&url.endsWith('/studio.html')){studioHandle=handle;return true;}}},'extension studio opens from installation');
 await check('Firefox installs the actual extension and opens its studio',async()=>{assert.ok(studioHandle);await wait(async()=>/Screenity tools/.test(await request(`/session/${session}/title`)),'studio title');await wait(()=>execute('return !!document.querySelector("canvas.upper-canvas")'),'original drawing canvas');});
 await check('Manifest requests no site access, cloud access, camera or microphone',async()=>{const manifest=JSON.parse(await readFile(join(root,'extension/manifest.json')));assert.equal(manifest.permissions,undefined);assert.equal(manifest.host_permissions,undefined);assert.match(manifest.content_security_policy.extension_pages,/connect-src blob:/);});
 await check('Generated package preserves every pinned original source file',async()=>{const recipe=JSON.parse(await readFile(join(root,'recipe.json')));for(const file of recipe.files)assert.equal(createHash('sha256').update(await readFile(join(root,'.local/demo/source/screenity',file.path))).digest('hex'),file.sha256);});
 await check('Source drift is refused before replacing a previously built extension',async()=>{
  const recipe=JSON.parse(await readFile(join(root,'recipe.json')));
  const path=join(root,'.local/upstream',recipe.files[0].path),original=await readFile(path);
  const receipt=await readFile(join(root,'.local/demo/PROVENANCE.json'));
  try{await writeFile(path,Buffer.concat([original,Buffer.from('\n// drift probe\n')]));const result=spawnSync(process.execPath,['build.mjs'],{cwd:root,encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/integrity mismatch/);assert.deepEqual(await readFile(join(root,'.local/demo/PROVENANCE.json')),receipt);}finally{await writeFile(path,original);}
 });
 await check('Launcher refuses a changed generated extension without starting Firefox',async()=>{
  const path=join(root,'.local/demo/extension/manifest.json'),original=await readFile(path);
  try{await writeFile(path,Buffer.concat([original,Buffer.from('\n')]));const result=spawnSync(process.execPath,['launch.mjs'],{cwd:root,encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/Extension changed since build/);}finally{await writeFile(path,original);}
 });
 if(screenTest){
  await check('Native Firefox chooser starts real capture of the isolated virtual screen',async()=>{
   const share=await request(`/session/${session}/element`,{using:'css selector',value:'#share'});
   await request(`/session/${session}/element/${share['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
   await request(`/session/${session}/moz/context`,{context:'chrome'});
   await wait(()=>execute('return document.getElementById("notification-popup").state==="open"'),'sharing prompt');
   const menu=await request(`/session/${session}/element`,{using:'css selector',value:'#webRTC-selectWindow-menulist'});
   await request(`/session/${session}/element/${menu['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
   await request(`/session/${session}/actions`,{actions:[{type:'key',id:'choose',actions:[{type:'keyDown',value:'\uE010'},{type:'keyUp',value:'\uE010'},{type:'keyDown',value:'\uE007'},{type:'keyUp',value:'\uE007'}]}]});
   await wait(()=>execute('return !document.querySelector("#notification-popup .popup-notification-primary-button").disabled'),'permission delay');
   await execute('document.querySelector("#notification-popup .popup-notification-primary-button").click()');
   await request(`/session/${session}/moz/context`,{context:'content'});
   await wait(async()=>/Screen ready/.test(await status()),'screen capture starts');
   const info=await execute('const v=document.getElementById("capture");window.testCaptureTrack=v.srcObject.getVideoTracks()[0];return {width:v.videoWidth,height:v.videoHeight,audio:v.srcObject.getAudioTracks().length,state:window.testCaptureTrack.readyState};');
   assert.equal(info.width,1280);assert.equal(info.height,1050);assert.equal(info.audio,0);assert.equal(info.state,'live');
  });
  await check('Real virtual-screen recording is playable and release stops the source track',async()=>{
   await draw('arrow');await click('record');await new Promise(resolve=>setTimeout(resolve,1300));await click('stop');
   await wait(()=>execute('return !document.getElementById("download").hidden'),'real export');
   await wait(()=>execute('return document.getElementById("playback").readyState>=2'),'real playback');
   assert.equal(await execute('return document.getElementById("playback").videoWidth'),960);
   await writeFile(join(out,'real-capture.png'),Buffer.from(await request(`/session/${session}/screenshot`),'base64'));
   await click('disconnect');assert.equal(await execute('return window.testCaptureTrack.readyState'),'ended');
   await click('clear');
  });
  await check('Native Firefox sharing chooser can be cancelled without leaving capture active',async()=>{
   const share=await request(`/session/${session}/element`,{using:'css selector',value:'#share'});
   await request(`/session/${session}/element/${share['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
   await request(`/session/${session}/moz/context`,{context:'chrome'});
   await wait(()=>execute('return document.getElementById("notification-popup").state==="open"'),'sharing prompt');
   await execute('document.querySelector("#notification-popup .popup-notification-secondary-button").click()');
   await request(`/session/${session}/moz/context`,{context:'content'});
   await wait(()=>execute('return !document.getElementById("share").disabled'),'cancel completes');
   assert.equal(await execute('return document.getElementById("capture").srcObject'),null);
  });

 }
 await execute('window.testErrors=[];window.addEventListener("error",e=>window.testErrors.push(e.message));');await click('demo');
 await check('Synthetic source starts without granting device permissions',async()=>{assert.match(await status(),/demo ready/);assert.equal(await execute('return document.getElementById("record").disabled'),false);});
 await check('Original Screenity pen draws real pixels from pointer events',async()=>{await draw('pen');await wait(async()=>await pixels()>200,'pen renders');});
 await check('Original Screenity history undo and redo change rendered pixels',async()=>{const before=await pixels();await click('undo');await wait(async()=>await pixels()<before,'undo pixels');await click('redo');await wait(async()=>await pixels()>=before,'redo pixels');});
 await check('Original Screenity arrow and rectangle tools render',async()=>{await click('clear');await draw('arrow');assert.ok(await pixels()>100);await click('clear');await draw('shape');assert.ok(await pixels()>100);});
 await check('Original Screenity highlighter draws translucent pixels',async()=>{await click('clear');await draw('highlighter');await wait(async()=>await pixels()>100,'highlighter renders');const count=await execute('const a=document.querySelector("canvas.lower-canvas").getContext("2d").getImageData(0,0,960,540).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>30&&a[i]<220)n++;return n;');assert.ok(count>100);});
 await check('Original Screenity text tool accepts editable text',async()=>{await click('clear');await draw('text');await request(`/session/${session}/actions`,{actions:[{type:'key',id:'keyboard',actions:[...'Firefox'].flatMap(value=>[{type:'keyDown',value},{type:'keyUp',value}])}]});await execute('document.querySelector("[data-tool=select]").click()');assert.ok(await pixels()>30);});
 await check('Firefox MediaRecorder records the composited scene',async()=>{await click('record');await wait(()=>execute('return !document.getElementById("pause").disabled'),'record start');await new Promise(resolve=>setTimeout(resolve,1200));await click('pause');assert.match(await status(),/paused/);await click('pause');assert.match(await status(),/resumed/);await new Promise(resolve=>setTimeout(resolve,800));await click('stop');await wait(()=>execute('return !document.getElementById("download").hidden'),'record export');const info=await request(`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];const v=document.getElementById("playback");v.onloadeddata=()=>done({width:v.videoWidth,height:v.videoHeight,duration:v.duration});if(v.readyState>=2)done({width:v.videoWidth,height:v.videoHeight,duration:v.duration});',args:[]});assert.equal(info.width,960);assert.equal(info.height,540);const encoded=await request(`/session/${session}/execute/async`,{script:'const done=arguments[arguments.length-1];fetch(document.getElementById("download").href).then(r=>r.blob()).then(blob=>{const reader=new FileReader();reader.onload=()=>done(reader.result);reader.readAsDataURL(blob);}).catch(e=>done({error:e.message}));',args:[]});assert.equal(typeof encoded,'string');const video=Buffer.from(encoded.split(',')[1],'base64');assert.ok(video.length>2000);assert.equal(video.subarray(0,4).toString('hex'),'1a45dfa3');await writeFile(join(out,'demo-recording.webm'),video);});
 await check('Clear and release leave no drawing or active source',async()=>{await click('clear');await wait(async()=>await pixels()===0,'clear');await click('disconnect');assert.equal(await execute('return document.getElementById("record").disabled'),true);assert.match(await status(),/released/);});
 await writeFile(join(out,'studio.png'),Buffer.from(await request(`/session/${session}/screenshot`),'base64'));
}catch(error){failure=error.stack;console.error(error.stack);if(session){await writeFile(join(out,'failure.png'),Buffer.from(await request(`/session/${session}/screenshot`),'base64')).catch(()=>{});console.log(await execute('return {canvas:document.querySelector("canvas.upper-canvas")?.getBoundingClientRect().toJSON(),status:document.getElementById("status").textContent,errors:window.testErrors}').catch(()=>null));}}
finally{
 if(session)await request(`/session/${session}`,undefined,'DELETE').catch(()=>{});
 if(driver.exitCode===null){driver.kill('SIGTERM');await new Promise(resolve=>{driver.once('exit',resolve);setTimeout(()=>{if(driver.exitCode===null)driver.kill('SIGKILL');resolve();},2000).unref();});}
 if(displayProcess&&displayProcess.exitCode===null)displayProcess.kill('SIGTERM');
 await writeFile(join(out,'driver.log'),logs);
 await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:failure?'failed':'passed',browser:'Firefox',browserVersion,platform:process.platform,arch:process.arch,realScreenCapture:screenTest,checks,failure,scope:'Actual Firefox extension installation, original drawing modules, history, synthetic canvas recording, playable WebM and cleanup. '+(screenTest?'Also native sharing prompt cancellation/selection, real capture of a private Xvfb screen, playable recording, and source-track shutdown. ':'Native screen capture not run. ')+'Microphone, camera, full upstream UI/editor, Windows/macOS and other display backends remain unverified.'},null,2)+'\n');
}
if(failure)process.exitCode=1;
