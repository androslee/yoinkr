const {app,BrowserWindow,Menu,ipcMain,dialog,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const page=pathToFileURL(path.join(__dirname,'feature/payload/panel.html')).href;
let tool;
function open(){if(tool&&!tool.isDestroyed()){tool.show();tool.focus();return;}
 const partition='modkit-element-search-v1',s=session.fromPartition(partition);s.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 s.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(pathToFileURL(path.join(__dirname,'feature/payload/')).href)}));
 tool=new BrowserWindow({width:960,height:790,title:'Element message search · Yoinkr',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,partition}});
 tool.webContents.setWindowOpenHandler(()=>({action:'deny'}));tool.webContents.on('will-navigate',e=>e.preventDefault());tool.on('closed',()=>{tool=null;});tool.loadURL(page);
}
ipcMain.handle('modkit:element-search',async(event,input)=>{
 if(!tool||tool.isDestroyed()||event.sender!==tool.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==page)throw Error('Untrusted message-search sender');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['health','sample','open-transcript'].includes(input.action))throw Error('Unsupported message-search request');
 if(input.action==='health')return {extensionsUsed:false,donor:'Element Web',serviceConnected:false};
 if(input.action==='sample')return {text:await fs.readFile(path.join(__dirname,'feature/payload/sample.json'),'utf8')};
 const chosen=await dialog.showOpenDialog(tool,{title:'Open a local message transcript',properties:['openFile'],filters:[{name:'JSON transcript',extensions:['json']}]});if(chosen.canceled)return {cancelled:true};
 const file=chosen.filePaths[0],handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Choose a JSON transcript up to 2 MiB');const buffer=Buffer.alloc(2*1024*1024+1);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>2*1024*1024)throw Error('Transcript exceeds 2 MiB');return {text:new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytesRead))};}finally{await handle.close();}
});
app.whenReady().then(()=>{
 const refresh=()=>{const menu=Menu.getApplicationMenu();if(!menu||menu.getMenuItemById('modkit-element-search-open'))return;menu.append(new MenuItem({label:'Yoinkr messages',submenu:[{id:'modkit-element-search-open',label:'Open Element message search',click:open}]}));Menu.setApplicationMenu(menu);};
 const {MenuItem}=require('electron');const timer=setInterval(refresh,1000);timer.unref();refresh();
 // No window opens until the user chooses the application's native menu action.
 app.once('will-quit',()=>{clearInterval(timer);ipcMain.removeHandler('modkit:element-search');});
});
