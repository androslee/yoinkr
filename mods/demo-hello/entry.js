// demo-hello: the smallest mod that proves the pipeline. Runs in every
// renderer document at load, so it must not assume any app-specific DOM.

(function () {
  const show = () => {
    if (!document.body || document.getElementById('yoinkr-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'yoinkr-banner';
    bar.textContent = 'yoinkr: demo-hello is loaded';
    bar.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;padding:4px 8px;' +
      'font:12px/1.4 system-ui;background:#1f6feb;color:#fff;z-index:2147483647;' +
      'opacity:.85;pointer-events:none');
    document.body.appendChild(bar);
    window.__modkitDemo = { loadedAt: new Date().toISOString() };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
})();
