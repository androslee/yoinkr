import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  webURL,
  navigationAllowed,
  archiveEntries,
  blockedTarget
} = require('../examples/ublock-vscode/runtime/policy.cjs');
test('browser address policy normalizes web hosts and rejects privileged protocols', () => {
  assert.equal(webURL('example.com/docs'), 'https://example.com/docs');
  assert.equal(webURL('localhost:8080/test'), 'https://localhost:8080/test');
  assert.equal(webURL('http://127.0.0.1:8080/test'), 'http://127.0.0.1:8080/test');
  for (const value of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,test',
    'chrome-extension://abc/options.html',
    'https://user:pass@example.com',
    'https://'
  ])
    assert.throws(() => webURL(value));
});
test('browser internal navigation is confined to the selected extension and internal tabs', () => {
  assert.equal(navigationAllowed('https://example.com', 'owned'), true);
  assert.equal(navigationAllowed('about:blank', 'owned'), true);
  assert.equal(navigationAllowed('chrome-extension://owned/dashboard.html', 'owned', true), true);
  assert.equal(navigationAllowed('chrome-extension://other/dashboard.html', 'owned', true), false);
  assert.equal(navigationAllowed('chrome-extension://owned/dashboard.html', 'owned', false), false);
  assert.equal(navigationAllowed('chrome-extension://owned/document-blocked.html?details=test', 'owned'), true);
  assert.equal(navigationAllowed('chrome-extension://other/document-blocked.html', 'owned'), false);
  assert.equal(navigationAllowed('file:///tmp/secret', 'owned', true), false);
  assert.equal(navigationAllowed('javascript:alert(1)', 'owned', true), false);
});
test('extension archive extraction rejects traversal, wrong roots and missing manifests', () => {
  const bytes = new Uint8Array([1]);
  const normal = { 'uBlock0.chromium/manifest.json': bytes, 'uBlock0.chromium/js/test.js': bytes };
  assert.deepEqual(
    archiveEntries(normal).map(([name]) => name),
    ['manifest.json', 'js/test.js']
  );
  for (const path of [
    'uBlock0.chromium/../escape',
    'uBlock0.chromium/js/../../escape',
    'uBlock0.chromium/C:/file',
    'uBlock0.chromium/js\\escape',
    'other/manifest.json'
  ])
    assert.throws(() => archiveEntries({ ...normal, [path]: bytes }));
  assert.throws(() => archiveEntries({ 'uBlock0.chromium/file.js': bytes }), /manifest/);
});

test('blocked-site mapping accepts only the owned interstitial and web destination', () => {
  const target = 'https://example.com/ads';
  const owned =
    'chrome-extension://owned/document-blocked.html?details=' + encodeURIComponent(JSON.stringify({ url: target }));
  assert.equal(blockedTarget(owned, 'owned'), target);
  assert.throws(() => blockedTarget(owned, 'other'));
  assert.throws(() => blockedTarget(owned.replace('document-blocked.html', 'dashboard.html'), 'owned'));
  assert.throws(() => blockedTarget('chrome-extension://owned/document-blocked.html?details=bad', 'owned'));
  assert.throws(() =>
    blockedTarget(
      'chrome-extension://owned/document-blocked.html?details=' +
        encodeURIComponent(JSON.stringify({ url: 'file:///etc/passwd' })),
      'owned'
    )
  );
});

test('named browser sessions persist, update by name and delete without accepting local files', async () => {
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { loadSessions, saveSession, removeSession } = require('../examples/ublock-vscode/runtime/session-store.cjs');
  const root = await mkdtemp(join(tmpdir(), 'yoinkr-sessions-'));
  try {
    assert.deepEqual(loadSessions(root), []);
    const first = saveSession(root, 'Research', ['https://example.com', 'https://example.org'], 1);
    assert.equal(loadSessions(root)[0].active, 1);
    const updated = saveSession(root, 'Research', ['https://example.net'], 0);
    assert.equal(updated.id, first.id);
    assert.equal(loadSessions(root).length, 1);
    assert.throws(() => saveSession(root, 'Unsafe', ['file:///etc/passwd'], 0));
    assert.throws(() => saveSession(root, 'Unsafe', ['javascript:alert(1)'], 0));
    assert.throws(() => saveSession(root, '', ['https://example.com'], 0));
    assert.equal(JSON.parse(await readFile(join(root, 'sessions.json'))).sessions.length, 1);
    removeSession(root, first.id);
    assert.deepEqual(loadSessions(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('root-level original extension archives still reject absolute paths and traversal', () => {
  const bytes = new Uint8Array([1]);
  const valid = { 'manifest.json': bytes, 'ui/popup.html': bytes };
  assert.equal(archiveEntries(valid, '').length, 2);
  for (const name of ['/escape', '../escape', 'ui/../../escape', 'C:/escape'])
    assert.throws(() => archiveEntries({ ...valid, [name]: bytes }, ''));
});
