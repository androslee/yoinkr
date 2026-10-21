const {contextBridge,ipcRenderer}=require('electron');
const channel='modkit:comparison';
contextBridge.exposeInMainWorld('modkitComparison',Object.freeze({
 request:message=>ipcRenderer.invoke(channel,message),
 onState:callback=>{if(typeof callback!=='function')throw Error('Expected state callback');const handler=(_event,value)=>callback(value);ipcRenderer.on(channel+':state',handler);return()=>ipcRenderer.removeListener(channel+':state',handler);},
}));
