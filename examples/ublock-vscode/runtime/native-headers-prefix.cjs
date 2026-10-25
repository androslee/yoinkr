// Preserve Electron's actual blocking response-header event before the
// compatibility layer replaces it with a synthetic event without a transport.
const yoinkrNativeHeadersReceived = typeof chrome !== 'undefined' ? chrome.webRequest?.onHeadersReceived : null;
