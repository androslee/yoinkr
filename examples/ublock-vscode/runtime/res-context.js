// This browser uses a normal persistent session only; it has no incognito mode.
// Electron omits this legacy namespace in MV3 content-script contexts. RES uses
// it to select the normal/private preference bucket before initializing modules.
if (!chrome.extension) chrome.extension = {};
if (typeof chrome.extension.inIncognitoContext !== 'boolean') chrome.extension.inIncognitoContext = false;
