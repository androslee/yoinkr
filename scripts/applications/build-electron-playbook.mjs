import {readFile,writeFile,mkdir,realpath,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,newDestination,saveJson} from '../../src/workspace.js';
import {planElectronPlaybook,applyElectronPlaybook} from '../../src/electron-playbook.js';
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
if(!get('--source')||!get('--out'))throw Error('use --source <native-plot/code runtime> --out <new-showcase>');
const source=await realpath(resolve(get('--source'))),out=await newDestination(get('--out'),[source]);await mkdir(out,{mode:0o700});
const book=join(out,'playbook');await mkdir(book);const app=join(source,'resources/app'),pkg=JSON.parse(await readFile(join(app,'package.json')));
const mainAddition=`\n// Yoinkr reusable playbook: restricted native information round trip.\nipcMain.handle('modkit:playbook-info',event=>{\n if(!mqttWindow||event.sender!==mqttWindow.webContents||event.senderFrame!==mqttWindow.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(path.join(__dirname,'panel.html')).href)throw Error('Untrusted playbook sender');\n return {playbook:'native-host-info',process:'main',electron:process.versions.electron,extensionsUsed:false};\n});\n`;
const rendererAddition=`\n// The renderer receives only this fixed information through the preload bridge.\n{const button=document.createElement('button'),status=document.createElement('p');button.id='playbook-info';button.textContent='Check native integration';status.id='playbook-status';status.setAttribute('role','status');button.addEventListener('click',async()=>{try{const info=await window.modkitHost.playbookInfo();status.textContent='Main → preload → renderer · Electron '+info.electron+' · '+info.playbook+' · extensions: '+info.extensionsUsed;}catch(e){status.textContent='Integration check failed: '+e.message;}});document.body.prepend(button,status);}\n`;
const operations=[];for(const [role,file,convert]of [
 ['main','modkit-native/main.cjs',s=>s+mainAddition],
 ['preload','modkit-native/preload.cjs',s=>{const marker=' send(message)';if(s.split(marker).length!==2)throw Error('preload marker must match once');return s.replace(marker," playbookInfo(){return ipcRenderer.invoke('modkit:playbook-info');},\n"+marker);} ],
 ['renderer','modkit-native/panel.js',s=>s+rendererAddition]
]){const before=await readFile(join(app,file)),after=Buffer.from(convert(before.toString('utf8'))),payload=role+'.js';await writeFile(join(book,payload),after);operations.push({role,file,payload,beforeSha256:sha256(before),afterSha256:sha256(after)});}
const asset=Buffer.from('This file was created by the native-host-info playbook. Rollback removes it.\n');await writeFile(join(book,'provenance.txt'),asset);operations.push({role:'asset',file:'modkit-native/playbook/provenance.txt',payload:'provenance.txt',beforeSha256:null,afterSha256:sha256(asset)});
const manifest={schema:1,kind:'electron-playbook',id:'native-host-info',target:{app:'resources/app',name:pkg.name,version:pkg.version,main:pkg.main,type:pkg.type??'commonjs'},files:operations};await saveJson(join(book,'playbook.json'),manifest);
await saveJson(join(out,'PLAN.json'),await planElectronPlaybook(source,join(book,'playbook.json')));
await applyElectronPlaybook(source,join(book,'playbook.json'),join(out,'workspace'));
await writeFile(join(out,'launch.mjs'),await readFile(fileURLToPath(new URL('./launch-playbook-code.mjs',import.meta.url))));
await writeFile(join(out,'launch-code.sh'),'#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node "$ROOT/launch.mjs" "$ROOT/workspace" "$@"\n',{mode:0o755});await chmod(join(out,'launch-code.sh'),0o755);
await saveJson(join(out,'SHOWCASE.json'),{version:'0.14.0',source,workspace:join(out,'workspace'),recipe:join(book,'playbook.json'),feature:'Fixed native information IPC: main process → preload context bridge → renderer button',extensionsUsed:false,sourceModified:false,scope:'Playbook delivery and rollback; new host glue rather than an additional recovered donor feature.'});console.log('Prepared reusable Electron showcase:',out);
