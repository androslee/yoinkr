// Adapter-owned code; the recovered feature package is copied unchanged.
const {app,BrowserWindow,Menu,MenuItem,ipcMain,clipboard,nativeTheme}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const fs=require('node:fs/promises'),{randomUUID,createHash}=require('node:crypto');
const config=require('./binding.json');
const pageURL=pathToFileURL(path.join(__dirname,'panel.html')).href;
const workbenchFile=pathToFileURL(path.join(__dirname,'../out/vs/code/electron-browser/workbench/workbench.html')).href;
const expectedWorkbench=new Set([workbenchFile,workbenchFile.replace('file://','vscode-file://vscode-app')]);
const isWorkbench=url=>expectedWorkbench.has(url.split(/[?#]/)[0]);
const MAX=131072,channel='modkit:comparison',requests=new Map();
let tool=null,lastHost=null,state={schema:1,mode:'diff',selected:null,theme:'dark',baseline:null,current:null},error='',persist=Promise.resolve(),quitting=false,writes=0,flushing=false;
const hostWindow=w=>w&&!w.isDestroyed()&&isWorkbench(w.webContents.getURL());
const safeText=v=>typeof v==='string'&&Buffer.byteLength(v,'utf8')<=MAX;
const selection=v=>v&&safeText(v.text)&&typeof v.uri==='string'&&v.uri.length<=2048&&typeof v.language==='string'&&v.language.length<=64;
function validState(s){return s&&s.schema===1&&['diff','raw'].includes(s.mode)&&['dark','light'].includes(s.theme)&&(s.selected===null||s.selected===0||s.selected===1)&&(s.baseline===null||selection(s.baseline))&&(s.current===null||selection(s.current))&&Buffer.byteLength((s.baseline?.text??'')+(s.current?.text??''),'utf8')<=MAX;}
const file=()=>path.join(app.getPath('userData'),'YoinkrComparison','session.json');
function snapshot(){return JSON.parse(JSON.stringify({state,error,featureDigest:config.featureDigest,surface:'application-owned tool window',extensionsUsed:false}));}
function publish(){if(tool&&!tool.isDestroyed())tool.webContents.send(channel+':state',snapshot());}
function save(){const bytes=JSON.stringify(state);writes++;persist=persist.catch(()=>{}).then(async()=>{const target=file();await fs.mkdir(path.dirname(target),{recursive:true});const tmp=target+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fs.rename(tmp,target);}finally{await fs.rm(tmp,{force:true});}}).finally(()=>writes--);persist.catch(e=>{error='Could not save feature settings: '+e.message;publish();});return persist;}
async function restore(){try{const info=await fs.lstat(file());if(!info.isFile()||info.isSymbolicLink()||info.size>512*1024)throw Error('Invalid saved comparison session');const saved=JSON.parse(await fs.readFile(file(),'utf8'));if(!validState(saved))throw Error('Invalid saved comparison session');state=saved;}catch(e){if(e.code!=='ENOENT')error=e.message;}}
function assertSender(event){if(!tool||tool.isDestroyed()||event.sender!==tool.webContents||event.senderFrame!==tool.webContents.mainFrame||event.senderFrame.url!==pageURL)throw Error('Untrusted comparison sender');}
function target(){if(hostWindow(lastHost))return lastHost;return BrowserWindow.getAllWindows().find(hostWindow);}
function verifyPayload(){const manifest=config.payload;for(const [file,expected] of Object.entries(manifest)){const bytes=require('node:fs').readFileSync(path.join(__dirname,'feature',file));if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Recovered feature asset changed: '+file);}}
function open(){
 if(quitting)throw Error('Application is closing');if(tool&&!tool.isDestroyed()){tool.show();tool.focus();return tool;}
 verifyPayload();
 const win=new BrowserWindow({width:1120,height:820,title:'Recovered comparison · Yoinkr',backgroundColor:state.theme==='dark'?'#171b22':'#fafafa',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,partition:'modkit-comparison-v1'}});
 tool=win;win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.on('will-attach-webview',event=>event.preventDefault());win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.on('closed',()=>{tool=null});win.loadURL(pageURL);return win;
}
function capture(kind){
 if(!['baseline','current'].includes(kind))return Promise.reject(Error('Unknown capture operation'));
 const host=target();if(!host)return Promise.reject(Error('Open a VS Code editor and select text first'));
 const requestId=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(requestId);reject(Error('Editor selection request timed out; this host binding may be incompatible'));},5000);requests.set(requestId,{sender:host.webContents,resolve,reject,timer,kind});host.webContents.send('vscode:runAction',{id:'yoinkr.captureSelection',from:'yoinkr',modkitRequestId:requestId});});
}
ipcMain.on('vscode:modkit:selection',(event,message)=>{
 const pending=requests.get(message?.requestId);if(!pending||event.sender!==pending.sender||event.senderFrame!==event.sender.mainFrame||!isWorkbench(event.senderFrame.url))return;
 clearTimeout(pending.timer);requests.delete(message.requestId);
 try {
  if(message.error)throw Error(String(message.error).slice(0,500));if(!selection(message.value))throw Error('Invalid or oversized editor selection');
  if(pending.kind==='current'&&!state.baseline)throw Error('Capture a baseline selection first');
  const next={...state,selected:null,theme:message.theme==='light'?'light':'dark'};
  if(pending.kind==='baseline'){next.baseline=message.value;next.current=null}else next.current=message.value;
  if(!validState(next))throw Error('Combined comparison is larger than 128 KiB; select smaller text');
  state=next;error='';save();open();publish();pending.resolve(snapshot());
 }catch(e){error=e.message;publish();pending.reject(e);}
});
ipcMain.on('vscode:modkit:theme',(event,message)=>{
 if(event.senderFrame!==event.sender.mainFrame||!isWorkbench(event.senderFrame.url)||!['dark','light'].includes(message?.theme))return;
 state={...state,theme:message.theme};publish();save();
});
ipcMain.handle(channel,async(event,message)=>{
 assertSender(event);if(!message||typeof message.type!=='string')throw Error('Invalid comparison operation');
 switch(message.type){
  case 'ready':return snapshot();
  case 'capture':try{return await capture(message.kind)}catch(e){error=e.message;publish();throw e}
  case 'preferences':if(!['diff','raw'].includes(message.mode)||![null,0,1].includes(message.selected))throw Error('Invalid feature preferences');state={...state,mode:message.mode,selected:message.selected};await save();return snapshot();
  case 'copy':if(!safeText(message.text))throw Error('Clipboard payload exceeds limit');clipboard.writeText(message.text);return {copied:true};
  case 'reset':state={...state,baseline:null,current:null,selected:null};error='';await save();publish();return snapshot();
  case 'health':return {adapter:config.adapterId,featureDigest:config.featureDigest,electron:process.versions.electron,hostVersion:app.getVersion(),toolWindows:tool?1:0,pendingRequests:requests.size,extensionsUsed:false,nativeMenu:!!Menu.getApplicationMenu()?.getMenuItemById('modkit-comparison-menu')};
  default:throw Error('Unsupported comparison operation');
 }
});
function command(kind){try{if(kind==='open')open();else capture(kind).catch(e=>{if(quitting)return;error=e.message;open();publish()})}catch(e){error=e.message;console.error('Yoinkr comparison:',e.message);}}
const setMenu=Menu.setApplicationMenu.bind(Menu);
Menu.setApplicationMenu=menu=>{menu??=new Menu();if(!menu.getMenuItemById('modkit-comparison-menu'))menu.append(new MenuItem({id:'modkit-comparison-menu',label:'Yoinkr',submenu:[{id:'modkit-comparison-open',label:'Open recovered comparison',accelerator:'CmdOrCtrl+Alt+M',click:()=>command('open')},{id:'modkit-comparison-baseline',label:'Capture selection as baseline',accelerator:'CmdOrCtrl+Alt+B',click:()=>command('baseline')},{id:'modkit-comparison-current',label:'Compare selected text',accelerator:'CmdOrCtrl+Alt+D',click:()=>command('current')}]}));return setMenu(menu);};
app.on('browser-window-created',(_event,win)=>{win.on('focus',()=>{if(hostWindow(win))lastHost=win});win.webContents.on('did-finish-load',()=>{if(hostWindow(win))lastHost=win});});
app.whenReady().then(async()=>{await restore();if(!state.baseline)state.theme=nativeTheme.shouldUseDarkColors?'dark':'light';Menu.setApplicationMenu(Menu.getApplicationMenu());});
app.on('before-quit',event=>{quitting=true;for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('Application is closing'))}requests.clear();if(writes&&!flushing){event.preventDefault();flushing=true;persist.catch(()=>{}).finally(()=>app.quit());}});
