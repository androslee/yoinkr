// Electron can report tabId=-1 for an initial main-frame request. uBlock then
// asks tabs.update(-1, document-blocked.html). Resolve only that owned
// interstitial to a pending browser tab; leave all filtering logic unchanged.
const { ipcRenderer } = require('electron');
if (location.protocol === 'chrome-extension:' && location.pathname === '/background.html') {
  if (yoinkrNativeHeadersReceived) chrome.webRequest.onHeadersReceived = yoinkrNativeHeadersReceived;
  const original = chrome.tabs.update.bind(chrome.tabs);
  chrome.tabs.update = function (tabId, properties, ...rest) {
    if (tabId === -1 && typeof properties?.url === 'string') {
      const resolved = ipcRenderer.sendSync('yoinkr:research-browser:blocked-tab', properties.url);
      if (Number.isInteger(resolved) && resolved > 0) tabId = resolved;
    }
    return original(tabId, properties, ...rest);
  };
}
