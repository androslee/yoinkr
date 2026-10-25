const { contextBridge, ipcRenderer } = require('electron');
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action');
// This preload is attached only to the local browser controls, never to web tabs.
injectBrowserAction();
contextBridge.exposeInMainWorld('yoinkrBrowser', {
  command: message => ipcRenderer.invoke('yoinkr:research-browser', message),
  onState: callback => ipcRenderer.on('yoinkr:research-browser:state', (_event, value) => callback(value))
});
contextBridge.exposeInMainWorld('yoinkrAddress', {
  onFocus: callback => ipcRenderer.on('yoinkr:research-browser:focus-address', callback)
});
