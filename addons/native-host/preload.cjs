const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('modkitHost',{
 send(message){ipcRenderer.send('modkit:native-mqtt',message);},
 onMessage(callback){const listener=(_e,data)=>callback(data);ipcRenderer.on('modkit:native-reply',listener);return()=>ipcRenderer.removeListener('modkit:native-reply',listener);}
});
