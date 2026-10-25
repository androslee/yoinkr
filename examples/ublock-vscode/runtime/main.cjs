// Yoinkr host adapter. The original uBlock extension archive is never patched.
const { app, BrowserWindow, WebContentsView, Menu, MenuItem, ipcMain, session, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash, randomUUID } = require('node:crypto');
const { unzipSync } = require('fflate');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { webURL, navigationAllowed, archiveEntries, blockedTarget } = require('./policy.cjs');
const recipe = require('../recipe.json');
const { loadSessions, saveSession, removeSession } = require('./session-store.cjs');
const channel = 'yoinkr:research-browser';
const chromeURL = pathToFileURL(path.join(__dirname, 'browser.html')).href;
const partition = 'persist:yoinkr-research-web';
const tabs = new Map();
let win = null,
  active = null,
  api,
  browserSession,
  extension,
  initialization;
let ready = false,
  error = '',
  message = '',
  closing = false,
  pluginBusy = false;
let namedSessions = [];
let preferences = { ublock: true, 'dark-reader': true, res: true, sessions: true };
const plugins = new Map(
  [
    [
      'ublock',
      {
        ...recipe,
        key: 'ublock',
        name: 'uBlock Origin',
        archiveFile: 'uBlock.zip',
        rootPrefix: 'uBlock0.chromium/',
        manifestVersion: 2,
        directory: 'uBlock'
      }
    ],
    ...recipe.extensions.map(item => [item.key, { ...item, archiveFile: item.key + '.zip', directory: item.key }])
  ].map(([key, spec]) => [key, { spec, extension: null, enabled: false, error: '' }])
);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const base = () => path.join(app.getPath('userData'), 'YoinkrResearchBrowser');
function snapshot() {
  return {
    ready,
    error,
    message,
    version: recipe.version,
    active,
    pluginBusy,
    blocking: plugins.get('ublock').enabled,
    plugins: [...plugins].map(([key, p]) => ({
      key,
      name: p.spec.name,
      version: p.spec.version,
      enabled: p.enabled,
      error: p.error
    })),
    sessions: {
      enabled: preferences.sessions,
      saved: namedSessions.map(({ id, name, urls, updatedAt }) => ({ id, name, count: urls.length, updatedAt }))
    },
    tabs: [...tabs.values()].map(t => ({
      id: t.view.webContents.id,
      title: t.view.webContents.getTitle() || 'New tab',
      url: t.view.webContents.getURL(),
      loading: t.view.webContents.isLoading(),
      back: t.view.webContents.navigationHistory.canGoBack(),
      forward: t.view.webContents.navigationHistory.canGoForward()
    }))
  };
}
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send(channel + ':state', snapshot());
}
function save() {
  if (closing || !ready || !preferences.sessions) return;
  try {
    const list = [...tabs.values()].filter(t => !t.internal && /^https?:/.test(t.view.webContents.getURL()));
    const data = {
      schema: 1,
      urls: list.map(t => t.view.webContents.getURL()),
      active: Math.max(
        0,
        list.findIndex(t => t.view.webContents.id === active)
      )
    };
    fs.mkdirSync(base(), { recursive: true });
    const target = path.join(base(), 'tabs.json'),
      temp = target + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (e) {
    message = 'Could not save browser tabs: ' + e.message;
  }
}
function restore() {
  try {
    const file = path.join(base(), 'tabs.json');
    if (fs.lstatSync(file).size > 512 * 1024) throw Error('Saved tabs exceed limit');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.schema !== 1 || !Array.isArray(value.urls) || value.urls.length > 32)
      throw Error('Invalid saved browser tabs');
    return { urls: value.urls.map(webURL), active: Number.isInteger(value.active) ? value.active : 0 };
  } catch (e) {
    if (e.code !== 'ENOENT') message = 'Saved tabs could not be restored: ' + e.message;
    return { urls: [], active: 0 };
  }
}
function unpack(spec) {
  const archive = fs.readFileSync(path.join(__dirname, spec.archiveFile));
  if (digest(archive) !== spec.sha256) throw Error('uBlock archive changed; rebuild this example');
  const entries = archiveEntries(unzipSync(archive), spec.rootPrefix);
  const manifest = JSON.parse(Buffer.from(entries.find(([n]) => n === 'manifest.json')[1]).toString());
  if (manifest.version !== spec.version || manifest.manifest_version !== spec.manifestVersion)
    throw Error('Unexpected uBlock build');
  fs.mkdirSync(base(), { recursive: true });
  const dest = path.join(base(), spec.directory),
    stage = path.join(base(), 'unpack-' + randomUUID());
  const marker = '.yoinkr-generated-extension';
  // Only replace a directory previously created by this adapter, never caller data.
  if (fs.existsSync(dest) && (fs.lstatSync(dest).isSymbolicLink() || !fs.existsSync(path.join(dest, marker))))
    throw Error('Refusing to replace an unowned uBlock directory');
  fs.mkdirSync(stage);
  try {
    for (const [name, bytes] of entries) {
      const file = path.join(stage, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes, { flag: 'wx' });
    }
    if (spec.key === 'res') {
      fs.writeFileSync(path.join(stage, 'yoinkr-upstream-manifest.json'), JSON.stringify(manifest, null, 2));
      for (const scripts of manifest.content_scripts || []) scripts.js?.unshift('yoinkr-res-context.js');
      fs.writeFileSync(
        path.join(stage, 'yoinkr-res-context.js'),
        fs.readFileSync(path.join(__dirname, 'res-context.js'))
      );
      fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }
    fs.writeFileSync(path.join(stage, marker), spec.sha256, { flag: 'wx' });
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
    fs.renameSync(stage, dest);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return dest;
}
async function waitForBlocker() {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const bg = webContents
      .getAllWebContents()
      .find(w => w.getType() === 'backgroundPage' && w.getURL() === extension.url + 'background.html');
    if (bg) {
      try {
        if (await bg.executeJavaScript('Boolean(self.µBlock?.readyToFilter)')) return;
      } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('uBlock did not become ready within 60 seconds; webpages remain closed');
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  for (const [id, tab] of tabs) {
    tab.view.setVisible(id === active);
    tab.view.setBounds({ x: 220, y: 180, width: Math.max(1, width - 220), height: Math.max(1, height - 206) });
  }
}
function select(id) {
  if (!tabs.has(id)) throw Error('Unknown browser tab');
  active = id;
  layout();
  api.selectTab(tabs.get(id).view.webContents);
  publish();
  save();
}
function closeTab(id, fromExtension = false) {
  const tab = tabs.get(id);
  if (!tab) return;
  const wc = tab.view.webContents;
  tabs.delete(id);
  // removeTab notifies the compatibility layer, which calls our removal hook.
  // Remove our registry entry first so that callback is idempotent.
  if (!fromExtension && wc && !wc.isDestroyed()) api.removeTab(wc);
  if (win && !win.isDestroyed()) win.contentView.removeChildView(tab.view);
  if (wc && !wc.isDestroyed()) wc.close();
  if (active === id) active = tabs.keys().next().value || null;
  if (!closing && active) api.selectTab(tabs.get(active).view.webContents);
  layout();
  publish();
  save();
}
function navigationError(wc, failure) {
  if (wc.isDestroyed() || failure.code === 'ERR_ABORTED') return;
  message =
    failure.code === 'ERR_BLOCKED_BY_CLIENT'
      ? 'uBlock Origin blocked this navigation.'
      : 'Page could not load: ' + failure.message;
  publish();
}
function createTab(url = 'about:blank', internal = false, activate = true) {
  if (!ready) throw Error('Wait for uBlock Origin to become ready');
  if (tabs.size >= 32) throw Error('Close a tab first (32-tab demo limit)');
  if (!allowedNavigation(url, internal)) throw Error('Unsupported browser navigation');
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  const wc = view.webContents,
    id = wc.id;
  tabs.set(id, { view, internal, pendingURL: url });
  win.contentView.addChildView(view);
  api.addTab(wc, win);
  wc.setWindowOpenHandler(details => {
    if (allowedNavigation(details.url, internal)) {
      try {
        createTab(details.url, internal);
      } catch (e) {
        message = e.message;
        publish();
      }
    }
    return { action: 'deny' };
  });
  for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate'])
    wc.on(name, (event, destination) => {
      if (!allowedNavigation(destination || event.url, internal)) event.preventDefault();
    });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('did-start-navigation', (_event, url, _inPlace, mainFrame) => {
    if ((mainFrame || _event.isMainFrame) && tabs.has(id)) tabs.get(id).pendingURL = url || _event.url;
  });
  wc.on('context-menu', (_event, params) => {
    const items = api.getContextMenuItems(wc, params);
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  for (const name of ['page-title-updated', 'did-start-loading', 'did-stop-loading', 'did-navigate-in-page'])
    wc.on(name, publish);
  wc.on('did-finish-load', () => {
    if (tabs.has(id)) tabs.get(id).pendingURL = null;
    publish();
    save();
  });
  wc.on('render-process-gone', () => {
    message = 'A webpage stopped responding. Reload it or close its tab.';
    publish();
  });
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    if (key === 'l') {
      event.preventDefault();
      win.webContents.focus();
      win.webContents.send(channel + ':focus-address');
    }
    if (key === 't') {
      event.preventDefault();
      createTab();
    }
    if (key === 'w') {
      event.preventDefault();
      closeTab(id);
    }
  });
  if (activate) select(id);
  else layout();
  wc.loadURL(url).catch(e => navigationError(wc, e));
  return wc;
}
function allowedNavigation(url, internal) {
  const own = [...plugins.values()].filter(p => p.extension && p.enabled).map(p => p.extension.id);
  return navigationAllowed(url, '', false) || own.some(id => navigationAllowed(url, id, internal));
}
function readPreferences() {
  try {
    const file = path.join(base(), 'plugins.json');
    if (fs.lstatSync(file).size > 4096) throw Error('Invalid plugin preferences');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.schema !== 1) throw Error('Unknown preferences schema');
    for (const key of Object.keys(preferences))
      if (typeof data.enabled?.[key] === 'boolean') preferences[key] = data.enabled[key];
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
}
function savePreferences() {
  fs.mkdirSync(base(), { recursive: true });
  const target = path.join(base(), 'plugins.json'),
    temporary = target + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ schema: 1, enabled: preferences }), { mode: 0o600 });
  fs.renameSync(temporary, target);
}
function currentSession() {
  const list = [...tabs.values()].filter(t => !t.internal && /^https?:/.test(t.view.webContents.getURL()));
  return {
    urls: list.map(t => t.view.webContents.getURL()),
    active: Math.max(
      0,
      list.findIndex(t => t.view.webContents.id === active)
    )
  };
}
async function loadPlugin(key) {
  const p = plugins.get(key);
  if (!p) throw Error('Unknown plugin');
  p.extension = await browserSession.extensions.loadExtension(unpack(p.spec));
  if (key === 'ublock') {
    extension = p.extension;
    await waitForBlocker();
  }
  p.enabled = true;
  p.error = '';
}
async function togglePlugin(key) {
  if (!['sessions', ...plugins.keys()].includes(key)) throw Error('Unknown plugin');
  if (pluginBusy) throw Error('Wait for the current plugin change');
  pluginBusy = true;
  publish();
  try {
    if (key === 'sessions') preferences.sessions = !preferences.sessions;
    else {
      const p = plugins.get(key);
      if (p.enabled) {
        for (const [id, tab] of [...tabs]) if (tab.view.webContents.getURL().startsWith(p.extension.url)) closeTab(id);
        browserSession.extensions.removeExtension(p.extension.id);
        p.enabled = false;
      } else await loadPlugin(key);
      preferences[key] = p.enabled;
      // A reload removes already-injected CSS/scripts after unloading an extension.
      // Web tabs are held while uBlock reinitializes, before reload is allowed.
      for (const tab of tabs.values())
        if (!tab.internal && /^https?:/.test(tab.view.webContents.getURL())) tab.view.webContents.reload();
      message = p.spec.name + (p.enabled ? ' enabled.' : ' disabled.') + ' Open web tabs refreshed.';
    }
    savePreferences();
  } catch (failure) {
    if (plugins.has(key)) plugins.get(key).error = failure.message;
    throw failure;
  } finally {
    pluginBusy = false;
    publish();
  }
}

async function initialize() {
  browserSession = session.fromPartition(partition);
  browserSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  api = new ElectronChromeExtensions({
    session: browserSession,
    license: 'GPL-3.0',
    createTab(details) {
      const url = details.url || 'about:blank';
      const internal = [...plugins.values()].some(p => p.extension && url.startsWith(p.extension.url));
      return [createTab(url, internal, details.active !== false), win];
    },
    selectTab(wc) {
      select(wc.id);
    },
    removeTab(wc) {
      if (wc) closeTab(wc.id, true);
    },
    requestPermissions() {
      return false;
    }
  });
  readPreferences();
  try {
    namedSessions = loadSessions(base());
  } catch (e) {
    message = 'Saved sessions could not be read: ' + e.message;
  }
  for (const [key, plugin] of plugins) {
    if (!preferences[key]) continue;
    try {
      await loadPlugin(key);
    } catch (failure) {
      plugin.error = failure.message;
      if (key === 'ublock') throw failure;
    }
  }
  ready = true;
}
async function open() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }
  closing = false;
  const chromeSession = session.fromPartition('yoinkr-research-controls');
  ElectronChromeExtensions.handleCRXProtocol(chromeSession);
  chromeSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 500,
    title: 'Yoinkr research browser',
    backgroundColor: '#15191f',
    webPreferences: {
      session: chromeSession,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.on('resize', layout);
  win.on('close', () => {
    save();
    closing = true;
  });
  win.on('closed', () => {
    for (const id of [...tabs.keys()]) closeTab(id);
    tabs.clear();
    active = null;
    win = null;
  });
  initialization ||= initialize();
  initialization.catch(() => {});
  await win.loadURL(chromeURL);
  try {
    await initialization;
    if (!win || win.isDestroyed()) return;
    const saved = preferences.sessions ? restore() : { urls: [], active: 0 };
    saved.urls.forEach(url => createTab(url, false, false));
    const restored = [...tabs.keys()];
    if (restored.length) select(restored[Math.min(saved.active, restored.length - 1)]);
    publish();
  } catch (e) {
    error = 'Protection unavailable: ' + e.message;
    publish();
  }
}
function trusted(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    event.senderFrame.url !== chromeURL
  )
    throw Error('Untrusted browser control sender');
}
ipcMain.handle(channel, async (event, command) => {
  trusted(event);
  if (!command || typeof command.type !== 'string') throw Error('Invalid browser command');
  if (command.type === 'ready') return snapshot();
  if (!ready) throw Error('Browser plugins are not ready');
  if (pluginBusy) throw Error('Wait for the plugin change to finish');
  message = '';
  const tab = tabs.get(active)?.view.webContents;
  switch (command.type) {
    case 'plugin-toggle':
      await togglePlugin(command.key);
      break;
    case 'plugin-settings': {
      const p = plugins.get(command.key);
      if (!p?.enabled || !p.extension) throw Error('Enable this plugin first');
      const manifest = p.extension.manifest;
      const page =
        manifest.options_ui?.page ||
        manifest.options_page ||
        manifest.browser_action?.default_popup ||
        manifest.action?.default_popup;
      if (!page) throw Error('Use this plugin’s toolbar icon on a supported page');
      createTab(new URL(page, p.extension.url).href, true);
      break;
    }
    case 'session-save': {
      if (!preferences.sessions) throw Error('Enable sessions first');
      const current = currentSession();
      saveSession(base(), command.name, current.urls, current.active);
      namedSessions = loadSessions(base());
      break;
    }
    case 'session-restore': {
      if (!preferences.sessions) throw Error('Enable sessions first');
      const saved = namedSessions.find(s => s.id === command.id);
      if (!saved) throw Error('Unknown saved session');
      if (tabs.size + saved.urls.length > 32) throw Error('Close some tabs before restoring this session');
      const opened = saved.urls.map(url => createTab(url, false, false));
      select(opened[saved.active]?.id || opened[0].id);
      break;
    }
    case 'session-delete':
      if (!preferences.sessions) throw Error('Enable sessions first');
      removeSession(base(), command.id);
      namedSessions = loadSessions(base());
      break;
    case 'new':
      createTab();
      break;
    case 'navigate': {
      const url = webURL(command.url);
      if (!tab || tabs.get(active).internal) createTab(url);
      else {
        tabs.get(active).pendingURL = url;
        tab.loadURL(url).catch(e => navigationError(tab, e));
      }
      break;
    }
    case 'select':
      select(command.id);
      break;
    case 'close':
      closeTab(command.id);
      break;
    case 'back':
      if (tab?.navigationHistory.canGoBack()) tab.navigationHistory.goBack();
      break;
    case 'forward':
      if (tab?.navigationHistory.canGoForward()) tab.navigationHistory.goForward();
      break;
    case 'reload':
      tab?.reload();
      break;
    case 'dashboard':
      if (!plugins.get('ublock').enabled) throw Error('Enable uBlock Origin first');
      createTab(extension.url + 'dashboard.html', true);
      break;
    case 'logger':
      if (!plugins.get('ublock').enabled) throw Error('Enable uBlock Origin first');
      createTab(extension.url + 'logger-ui.html', true);
      break;
    default:
      throw Error('Unknown browser command');
  }
  return snapshot();
});
ipcMain.on(channel + ':blocked-tab', (event, targetURL) => {
  let resolved = -1;
  if (
    extension &&
    event.sender.session === browserSession &&
    event.sender.getType() === 'backgroundPage' &&
    event.senderFrame?.url === extension.url + 'background.html'
  ) {
    try {
      const destination = blockedTarget(targetURL, extension.id);
      for (const tab of tabs.values()) {
        const wc = tab.view.webContents;
        if (wc && !wc.isDestroyed() && tab.pendingURL?.split('#')[0] === destination.split('#')[0]) {
          tab.pendingURL = null;
          resolved = wc.id;
          break;
        }
      }
    } catch {}
  }
  // Setting returnValue sends the synchronous reply immediately: do it once.
  event.returnValue = resolved;
});

const setMenu = Menu.setApplicationMenu.bind(Menu);
Menu.setApplicationMenu = menu => {
  menu ||= new Menu();
  if (!menu.getMenuItemById('yoinkr-research-menu'))
    menu.append(
      new MenuItem({
        id: 'yoinkr-research-menu',
        label: 'Yoinkr browser',
        submenu: [
          {
            id: 'yoinkr-research-open',
            label: 'Open research browser',
            accelerator: 'CmdOrCtrl+Alt+R',
            click: () => open().catch(e => console.error('Yoinkr browser:', e.message))
          }
        ]
      })
    );
  return setMenu(menu);
};
app.whenReady().then(() => Menu.setApplicationMenu(Menu.getApplicationMenu()));
