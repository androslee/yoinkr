// Extension-free Chromium app mode. This does not change browser MIME handlers.
import{spawn}from'node:child_process';import{pathToFileURL}from'node:url';import{resolve,join}from'node:path';
const root=resolve(process.argv[2]),binary=(process.env.YOINKR_CHROMIUM??process.env.MODKIT_CHROMIUM);
if(!binary){console.error('Set YOINKR_CHROMIUM to a Chromium executable, then run this launcher again.');process.exit(1);}
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('VSCODE_')&&k!=='ELECTRON_RUN_AS_NODE'));
const child=spawn(binary,['--app='+pathToFileURL(join(root,'viewer.html')).href,'--user-data-dir='+join(root,'.browser-profile'),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions',...process.argv.slice(3)],{env,stdio:'inherit'});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',c=>process.exitCode=c??1);
