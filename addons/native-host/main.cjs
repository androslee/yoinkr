// Native application startup integration. No VS Code extension APIs are used.
const {app,BrowserWindow,Menu,MenuItem,ipcMain,shell}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {Explorer}=require('./controller.cjs');
const external=url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&(parsed.hostname==='mqtt-explorer.com'||(parsed.hostname==='github.com'&&parsed.pathname.startsWith('/thomasnordquist/MQTT-Explorer')));}catch{return false;}};
let mqttWindow=null,explorer=null,documentWindow=null;
const allowedTypes=new Set(['ready','connect','disconnect','clear','publish','inspect','host-info','open-documents']);
function mqttExplorer(){
 if(mqttWindow&&!mqttWindow.isDestroyed()){mqttWindow.show();mqttWindow.focus();return mqttWindow;}
 const win=new BrowserWindow({width:1120,height:800,title:'MQTT Explorer · Yoinkr native integration',backgroundColor:'#171b22',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'modkit-native-viewers'}});
 mqttWindow=win;const page=pathToFileURL(path.join(__dirname,'panel.html')).href;
 explorer=new Explorer(snapshot=>{if(!win.isDestroyed())win.webContents.send('modkit:native-reply',{type:'snapshot',snapshot});});
 win.webContents.setWindowOpenHandler(({url})=>{if(external(url))shell.openExternal(url);return{action:'deny'};});win.webContents.on('will-navigate',(e,url)=>{if(url!==page){e.preventDefault();if(external(url))shell.openExternal(url);}});
 win.on('closed',()=>{const old=explorer;mqttWindow=null;explorer=null;old?.dispose().catch(console.error);});win.loadURL(page);return win;
}
function documents(){if(documentWindow&&!documentWindow.isDestroyed()){documentWindow.focus();return;}documentWindow=new BrowserWindow({width:1040,height:820,title:'Document Viewer · Yoinkr',backgroundColor:'#171b22',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'modkit-native-viewers'}});documentWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));documentWindow.webContents.on('will-navigate',e=>e.preventDefault());documentWindow.loadFile(path.join(__dirname,'documents','viewer.html'));documentWindow.on('closed',()=>documentWindow=null);}
ipcMain.on('modkit:native-mqtt',async(event,message)=>{
 if(!mqttWindow||event.sender!==mqttWindow.webContents||event.senderFrame!==mqttWindow.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(path.join(__dirname,'panel.html')).href||!message||!allowedTypes.has(message.type))return;
 const reply=data=>{if(!event.sender.isDestroyed())event.sender.send('modkit:native-reply',data);};
 try{if(message.type==='host-info')reply({type:'host-info',mode:'direct-application-bootstrap',nativeMenu:!!Menu.getApplicationMenu()?.getMenuItemById('modkit-native-menu'),electron:process.versions.electron,extensionsUsed:false});else if(message.type==='open-documents')documents();else if(message.type==='ready')explorer.emit();else if(message.type==='connect')await explorer.connect(message.connection);else if(message.type==='disconnect')await explorer.disconnect();else if(message.type==='clear')explorer.clear();else if(message.type==='publish')await explorer.publish(message.message);else if(message.type==='inspect')reply({type:'detail',detail:explorer.inspect(message.topic,message.mode)});}catch(e){reply({type:'error',message:e.message});}
});
const setMenu=Menu.setApplicationMenu.bind(Menu);
Menu.setApplicationMenu=menu=>{
 menu??=new Menu();
 if(menu&&!menu.getMenuItemById('modkit-native-menu'))menu.append(new MenuItem({id:'modkit-native-menu',label:'Yoinkr',submenu:[{label:'MQTT Explorer',accelerator:'CmdOrCtrl+Alt+M',click:mqttExplorer},{id:'modkit-native-documents',label:'Document Viewer',click:documents}]}));return setMenu(menu);
};
app.whenReady().then(()=>{Menu.setApplicationMenu(Menu.getApplicationMenu());if((process.env.YOINKR_OPEN_MQTT??process.env.MODKIT_OPEN_MQTT)==='1')setTimeout(mqttExplorer,1600);});
app.on('before-quit',()=>{explorer?.dispose().catch(()=>{});});
