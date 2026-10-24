import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { startWorkbench } from '../src/workbench.js';
import { libraryFixture } from '../scripts/general/fixtures/library.mjs';
async function setup(t, operations = {}) {
  const f = await libraryFixture(),
    app = await startWorkbench({
      cases: [f.cases[0]],
      knowledgeRoots: [f.records],
      findingRoot: f.findings,
      reportRoot: join(f.root, 'reports'),
      caseRoot: join(f.root, 'created'),
      port: 0,
      operations
    });
  t.after(async () => {
    await app.close();
    await rm(f.root, { recursive: true, force: true });
  });
  const headers = { 'X-Yoinkr-Token': app.boot.token, 'Content-Type': 'application/json' },
    get = path => fetch(app.url + path, { headers }),
    post = (path, body) => fetch(app.url + path, { method: 'POST', headers, body: JSON.stringify(body) });
  return { f, app, headers, get, post };
}
test('library API is authenticated and accepts IDs/filters rather than arbitrary paths', async t => {
  const { app, get, post } = await setup(t);
  assert.equal((await fetch(app.url + '/api/library/search')).status, 403);
  assert.equal((await get('/api/library/search?root=/etc')).status, 400);
  assert.equal((await get('/api/library/search?query=a&query=b')).status, 400);
  assert.equal((await get('/api/library/search?limit=10000')).status, 400);
  assert.equal((await get('/api/library/document?id=/etc/passwd')).status, 400);
  assert.equal((await post('/api/library/refresh', { root: '/etc' })).status, 400);
  assert.equal((await post('/api/library/open', { sourceId: '/etc' })).status, 400);
  const matches = await (await get('/api/library/search?query=finite&kind=note')).json();
  assert.equal(matches.total, 1);
  const detail = await (await get('/api/library/document?id=' + matches.items[0].id)).json();
  assert.match(detail.text, /Bounded history/);
  assert.equal(detail.canOpenCase, true);
});
test('saved findings persist with selected hashes, while opening prior cases only registers validated operations', async t => {
  let calls = 0;
  const { f, get, post } = await setup(t, { investigate: async () => calls++ });
  const items = await (await get('/api/library/search?kind=note&query=finite')).json(),
    d = items.items[0],
    before = await readFile(d.path);
  const r = await post('/api/library/finding', {
    title: 'Use finite history',
    body: 'Reuse this bounded pattern, with limits.',
    tags: ['plotting'],
    citations: [{ documentId: d.id, sha256: d.sha256, parentSha256: d.parentSha256 }]
  });
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.finding.authority, 'manual');
  assert.ok(saved.findingDocumentId);
  assert.deepEqual(await readFile(d.path), before);
  assert.equal((await (await get('/api/library/search?kind=finding&query=plotting')).json()).total, 1);
  const opened = await post('/api/library/open', { sourceId: d.sourceId });
  assert.equal(opened.status, 200);
  const result = await opened.json();
  assert.equal(result.cases.length, 2);
  assert.equal(result.reuse.seed, 'format.js');
  assert.equal(calls, 0);
  assert.equal(result.reuse.route, 'direct');
  const html = await (await get('/')).text();
  assert.match(html, /Prior work library/);
  assert.equal(JSON.parse(await readFile(join(f.findings, saved.finding.id + '.json'))).citations[0].sha256, d.sha256);
});
test('library mutations share the operation lock, but read-only searches remain available during a job', async t => {
  let release;
  const gate = new Promise(r => (release = r));
  const { app, get, post } = await setup(t, {
    query: async () => {
      await gate;
      return { result: 'done' };
    }
  });
  try {
    assert.equal((await post('/api/run', { caseId: app.boot.cases[0].id, action: 'query' })).status, 202);
    assert.equal((await get('/api/library/search')).status, 200);
    assert.equal((await post('/api/library/refresh', {})).status, 409);
    assert.equal((await post('/api/library/finding', {})).status, 409);
  } finally {
    release();
  }
});
test('prior-case registration rechecks real retained evidence rather than trusting searchable metadata', async t => {
  const { f, app, get, post } = await setup(t),
    r = await (await get('/api/library/search?kind=case&query=Numeric')).json();
  await writeFile(join(f.cases[1], 'evidence/donor.json'), 'changed');
  const response = await post('/api/library/open', { sourceId: r.items[0].sourceId });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Evidence changed/);
  assert.equal((await (await get('/api/state')).json()).cases.length, 1);
  assert.equal(
    (
      await post('/api/library/finding', {
        title: 'A',
        body: 'B',
        tags: [],
        citations: [{ documentId: r.items[0].id, sha256: 'wrong', parentSha256: r.items[0].parentSha256 }]
      })
    ).status,
    400
  );
});
test('library-only startup can open a discovered case, while finding stores cannot overlap sources or use symlinks', async t => {
  const f = await libraryFixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const base = {
      cases: [],
      knowledgeRoots: [f.records],
      findingRoot: f.findings,
      caseRoot: join(f.root, 'created'),
      reportRoot: join(f.root, 'reports'),
      port: 0
    },
    app = await startWorkbench(base);
  try {
    assert.equal(app.boot.cases.length, 0);
    const headers = { 'X-Yoinkr-Token': app.boot.token, 'Content-Type': 'application/json' },
      items = await (await fetch(app.url + '/api/library/search?kind=case', { headers })).json();
    const response = await fetch(app.url + '/api/library/open', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceId: items.items[0].sourceId })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cases.length, 1);
  } finally {
    await app.close();
  }
  await assert.rejects(startWorkbench({ ...base, findingRoot: join(f.cases[0], 'findings') }), /outside/);
  await rm(f.findings, { recursive: true });
  await symlink(f.cases[0], f.findings);
  await assert.rejects(startWorkbench(base), /ordinary directory/);
});
