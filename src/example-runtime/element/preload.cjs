const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('modkitElement',Object.freeze({request:input=>ipcRenderer.invoke('modkit:element-search',input)}));
