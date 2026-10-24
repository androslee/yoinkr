import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpClient, wrapModSource } from '../src/cdp.js';
import { mockTransport } from './helpers.js';

function client(handler) {
  const transport = mockTransport(handler);
  return { cdp: new CdpClient(transport), transport };
}

test('rpc calls are matched by id', async () => {
  const { cdp, transport } = client(req => {
    if (req.method === 'Target.getTargets') return { result: { targetInfos: [{ targetId: 'T1', type: 'page' }] } };
    return null;
  });
  const targets = await cdp.listTargets();
  assert.deepEqual(targets, [{ targetId: 'T1', type: 'page' }]);
  assert.equal(transport.sent.at(-1).method, 'Target.getTargets');
});

test('a CDP error rejects the call', async () => {
  const { cdp } = client(() => ({ error: { code: -32601, message: 'not supported' } }));
  await assert.rejects(cdp.call('Page.enable'), /not supported/);
});

test('attachToTarget sends flatten and threads the sessionId through', async () => {
  const { cdp, transport } = client(req => {
    if (req.method === 'Target.attachToTarget') {
      assert.equal(req.params.flatten, true);
      return { result: { sessionId: 'S1' } };
    }
    if (req.method === 'Page.addScriptToEvaluateOnNewDocument') {
      assert.equal(req.sessionId, 'S1');
      assert.equal(req.params.source, 'x();');
      return { result: { identifier: 'I1' } };
    }
    return null;
  });
  const sessionId = await cdp.attachToTarget('T1');
  assert.equal(await cdp.addScriptToEvaluateOnNewDocument('x();', sessionId), 'I1');
});

test('events reach their listeners', async () => {
  const seen = [];
  const { cdp, transport } = client(() => null);
  cdp.on('Runtime.consoleAPICalled', (params, sessionId) => seen.push([params.type, sessionId]));
  transport.emit('Runtime.consoleAPICalled', { type: 'error', args: [] }, 'S9');
  assert.deepEqual(seen, [['error', 'S9']]);
});

test('evaluate surfaces an exception thrown by the mod', async () => {
  const ok = client(() => ({ result: { result: { value: 42 } } }));
  assert.equal(await ok.cdp.evaluate('6*7'), 42);

  const bad = client(() => ({ result: { exceptionDetails: { exception: { description: 'TypeError: boom' } } } }));
  await assert.rejects(bad.cdp.evaluate('boom()'), /TypeError: boom/);
});

test('waitForTarget polls until the page appears', async () => {
  let calls = 0;
  const { cdp } = client(req => {
    if (req.method === 'Target.getTargets') {
      calls++;
      return { result: { targetInfos: calls < 3 ? [] : [{ targetId: 'T2', type: 'page', url: 'file:///a' }] } };
    }
    return null;
  });
  const target = await cdp.waitForTarget(t => t.type === 'page', { intervalMs: 5, timeoutMs: 2000 });
  assert.equal(target.targetId, 'T2');
  assert.equal(calls, 3);
  assert.equal(await cdp.waitForTarget(() => false, { intervalMs: 5, timeoutMs: 50 }), null);
});

test('wrapped mod source reports a throw instead of dying quietly', async () => {
  const wrapped = wrapModSource('demo-hello', "throw new Error('nope')");
  assert.match(wrapped, /try\{/);
  assert.match(wrapped, /__modkitErrors/);
  assert.match(wrapped, /demo-hello/);
});
