const $ = id => document.getElementById(id);
let latest = null;
async function command(message) {
  try {
    const state = await window.yoinkrBrowser.command(message);
    if (state) render(state);
  } catch (error) {
    $('message').textContent = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  }
}
function render(state) {
  latest = state;
  $('protection').textContent = state.ready
    ? state.blocking
      ? `uBlock Origin ${state.version} · ready`
      : 'Ad blocking OFF'
    : state.error || 'Starting uBlock Origin…';
  $('protection').classList.toggle('ready', state.ready && state.blocking);
  $('message').textContent = state.error || state.message || '';
  const current = state.tabs.find(t => t.id === state.active);
  if (document.activeElement !== $('address')) $('address').value = current?.url || '';
  $('back').disabled = !current?.back;
  $('forward').disabled = !current?.forward;
  for (const id of ['new', 'reload']) $(id).disabled = !state.ready || state.pluginBusy;
  for (const id of ['dashboard', 'logger']) $(id).disabled = !state.ready || !state.blocking || state.pluginBusy;
  $('plugin-controls').replaceChildren(
    ...state.plugins.map(plugin => {
      const group = document.createElement('div');
      group.className = 'plugin-group';
      const toggle = document.createElement('button');
      toggle.id = 'toggle-' + plugin.key;
      toggle.className = 'toggle';
      toggle.setAttribute('aria-pressed', String(plugin.enabled));
      toggle.textContent =
        (plugin.key === 'ublock' ? 'uBlock' : plugin.key === 'res' ? 'RES' : plugin.name) +
        ' · ' +
        (plugin.enabled ? 'ON' : 'OFF');
      toggle.title =
        plugin.error || 'Enable or disable ' + plugin.name + '. Open web tabs will reload to apply the change.';
      toggle.disabled = !state.ready || state.pluginBusy;
      toggle.addEventListener('click', () => command({ type: 'plugin-toggle', key: plugin.key }));
      const settings = document.createElement('button');
      settings.className = 'settings';
      settings.textContent = '⚙';
      settings.setAttribute('aria-label', plugin.name + ' settings');
      settings.disabled = !plugin.enabled || state.pluginBusy;
      settings.addEventListener('click', () => command({ type: 'plugin-settings', key: plugin.key }));
      group.append(toggle, settings);
      return group;
    })
  );
  $('toggle-sessions').setAttribute('aria-pressed', String(state.sessions.enabled));
  $('toggle-sessions').textContent = 'Sessions · ' + (state.sessions.enabled ? 'ON' : 'OFF');
  $('toggle-sessions').disabled = !state.ready || state.pluginBusy;
  const selected = $('saved-sessions').value;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Saved sessions…';
  $('saved-sessions').replaceChildren(
    placeholder,
    ...state.sessions.saved.map(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name + ' (' + session.count + ' tabs)';
      return option;
    })
  );
  if (state.sessions.saved.some(s => s.id === selected)) $('saved-sessions').value = selected;
  for (const id of ['session-name', 'save-session', 'saved-sessions', 'restore-session', 'delete-session'])
    $(id).disabled = !state.sessions.enabled || state.pluginBusy;
  $('actions').setAttribute('tab', String(state.active || -1));
  $('tabs').replaceChildren(
    ...state.tabs.map(tab => {
      const row = document.createElement('div');
      row.className = 'tab' + (tab.id === state.active ? ' active' : '');
      const select = document.createElement('button');
      select.className = 'select';
      select.textContent = tab.loading ? '◌ ' + tab.title : tab.title;
      select.title = tab.url;
      select.addEventListener('click', () => command({ type: 'select', id: tab.id }));
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close ' + tab.title);
      close.addEventListener('click', () => command({ type: 'close', id: tab.id }));
      row.append(select, close);
      return row;
    })
  );
}
$('address-form').addEventListener('submit', event => {
  event.preventDefault();
  command({ type: 'navigate', url: $('address').value });
});
for (const type of ['new', 'back', 'forward', 'reload', 'dashboard', 'logger'])
  $(type).addEventListener('click', () => command({ type }));
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'l') {
    event.preventDefault();
    $('address').focus();
    $('address').select();
  }
  if (event.key.toLowerCase() === 't') {
    event.preventDefault();
    command({ type: 'new' });
  }
  if (event.key.toLowerCase() === 'w' && latest?.active) {
    event.preventDefault();
    command({ type: 'close', id: latest.active });
  }
});
window.yoinkrBrowser.onState(render);
command({ type: 'ready' });
window.yoinkrAddress.onFocus(() => {
  $('address').focus();
  $('address').select();
});

$('toggle-sessions').addEventListener('click', () => command({ type: 'plugin-toggle', key: 'sessions' }));
$('save-session').addEventListener('click', () => command({ type: 'session-save', name: $('session-name').value }));
$('restore-session').addEventListener('click', () =>
  command({ type: 'session-restore', id: $('saved-sessions').value })
);
$('delete-session').addEventListener('click', () => command({ type: 'session-delete', id: $('saved-sessions').value }));
