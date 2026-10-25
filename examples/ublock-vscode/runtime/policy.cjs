// Adapter-owned browser policy, shared by the main process and unit tests.
function webURL(value) {
  if (typeof value !== 'string' || value.length > 8192) throw Error('Invalid address');
  const raw = value.trim();
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) && !/^[^/?#]+:\d+(?:[/?#]|$)/.test(raw);
  const url = new URL(hasScheme ? raw : 'https://' + raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error('Enter an HTTP or HTTPS address without embedded credentials');
  return url.href;
}
function navigationAllowed(value, extensionId, internal = false) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) ||
      value === 'about:blank' ||
      (extensionId &&
        url.protocol === 'chrome-extension:' &&
        url.hostname === extensionId &&
        (internal || url.pathname === '/document-blocked.html'))
    );
  } catch {
    return false;
  }
}
function archiveEntries(entries, prefix = 'uBlock0.chromium/') {
  const result = [];
  let total = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith(prefix)) throw Error('Unexpected archive root');
    const relative = name.slice(prefix.length);
    if (!relative) continue;
    const pieces = relative.replace(/\/$/, '').split('/');
    if (relative.includes('\\') || pieces.some(p => !p || p === '.' || p === '..' || p.includes(':')))
      throw Error('Unsafe archive path');
    if (name.endsWith('/')) continue;
    total += bytes.length;
    if (bytes.length > 16 * 1024 * 1024 || total > 64 * 1024 * 1024 || result.length >= 2000)
      throw Error('Archive exceeds extraction limits');
    result.push([relative, bytes]);
  }
  if (!result.some(([name]) => name === 'manifest.json')) throw Error('Missing extension manifest');
  return result;
}
function blockedTarget(value, extensionId) {
  if (typeof value !== 'string' || value.length > 65536) throw Error('Invalid blocked-site URL');
  const url = new URL(value);
  if (url.protocol !== 'chrome-extension:' || url.hostname !== extensionId || url.pathname !== '/document-blocked.html')
    throw Error('Not the owned uBlock interstitial');
  const details = JSON.parse(url.searchParams.get('details'));
  if (!details || typeof details.url !== 'string' || !/^https?:/.test(details.url))
    throw Error('Invalid blocked target');
  return webURL(details.url);
}
module.exports = { webURL, navigationAllowed, archiveEntries, blockedTarget };
