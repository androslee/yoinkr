import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import api from '../src/component-bridge.cjs';
const { FrameDecoder, encodeFrame, ComponentBridge, fingerprintPython, MAX_FRAME, MAX_INPUT } = api;
test('framing handles split headers, Unicode, concatenated messages and bounded sizes', () => {
  const received = [],
    d = new FrameDecoder(m => received.push(m)),
    a = encodeFrame({ text: 'café 雪' }),
    b = encodeFrame({ value: 2 });
  d.push(a.subarray(0, 2));
  d.push(a.subarray(2, 6));
  d.push(Buffer.concat([a.subarray(6), b]));
  d.end();
  assert.deepEqual(received, [{ text: 'café 雪' }, { value: 2 }]);
  for (const n of [0, MAX_FRAME + 1]) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(n);
    assert.throws(() => new FrameDecoder(() => {}).push(head), /oversized/);
  }
  assert.throws(() => encodeFrame({ data: 'x'.repeat(MAX_FRAME) }), /limit/);
});
test('decoder rejects malformed JSON, invalid UTF8 and truncated frames', () => {
  for (const body of [Buffer.from('{??'), Buffer.from([0xff])]) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    assert.throws(() => new FrameDecoder(() => {}).push(Buffer.concat([head, body])), /Malformed/);
  }
  const d = new FrameDecoder(() => {});
  d.push(Buffer.from([0, 0]));
  assert.throws(() => d.end(), /Truncated/);
});
const native = { skip: process.platform !== 'linux' || !existsSync('/usr/bin/python3') };
async function fixture(t, mode = 'echo') {
  const root = await mkdtemp(join(tmpdir(), 'mk-bridge-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const worker = join(root, 'worker.py');
  const code = `import sys,json,struct,time,os\nmode=${JSON.stringify(mode)}\ndef send(v):\n b=json.dumps(v).encode();sys.stdout.buffer.write(struct.pack('>I',len(b))+b);sys.stdout.buffer.flush()\nif mode=='startup-hang':time.sleep(30)\nif mode=='malformed':\n sys.stdout.buffer.write(struct.pack('>I',3)+b'{??');sys.stdout.buffer.flush();time.sleep(30)\nif mode=='oversize':\n sys.stdout.buffer.write(struct.pack('>I',1400001));sys.stdout.buffer.flush();time.sleep(30)\nsend({'kind':'hello','version':2 if mode=='version' else 1,'nonce':sys.argv[4],'digest':sys.argv[3],'librarySha256':sys.argv[2],'zlibVersion':'1.3','abi':{'platform':'linux','machine':'x86_64','ulongBytes':8,'uintBytes':4}})\nwhile True:\n h=sys.stdin.buffer.read(4)\n if not h:break\n m=json.loads(sys.stdin.buffer.read(struct.unpack('>I',h)[0]))\n if mode=='hang':time.sleep(30)\n if mode=='crash':os._exit(9)\n if mode=='operation':send({'kind':'error','version':1,'id':m['id'],'code':'operation','message':'bad request'});continue\n send({'kind':'result','version':1,'id':'wrong' if mode=='wrong-id' else m['id'],'value':0,'bytes':len(__import__('base64').b64decode(m['payload']['base64']))})\n`;
  await writeFile(worker, code);
  const descriptor = {
    entry: worker,
    library: join(root, 'registered-lib'),
    digest: 'a'.repeat(64),
    librarySha256: 'b'.repeat(64),
    zlibVersion: '1.3'
  };
  let verified = 0;
  const b = new ComponentBridge({
    verify: async () => {
      verified++;
      return descriptor;
    },
    python: await fingerprintPython('/usr/bin/python3'),
    startupMs: 500
  });
  t.after(() => b.dispose());
  return { b, verified: () => verified };
}
test('request validation prevents oversized input, foreign operations and queue growth', native, async t => {
  const { b } = await fixture(t, 'hang');
  await assert.rejects(b.request('text'), { code: 'validation' });
  await assert.rejects(b.request(Buffer.alloc(MAX_INPUT + 1)), { code: 'validation' });
  await assert.rejects(b.request(Buffer.alloc(0), { seed: -1 }), { code: 'validation' });
  await assert.rejects(b.request(Buffer.alloc(0), { timeoutMs: Infinity }), { code: 'validation' });
  const controllers = Array.from({ length: 8 }, () => new AbortController()),
    jobs = controllers.map(c => b.request(Buffer.from('a'), { signal: c.signal }).catch(e => e.code));
  await assert.rejects(b.request(Buffer.from('b')), { code: 'queue' });
  controllers.forEach(c => c.abort());
  await Promise.all(jobs);
  assert.equal(b.status().pending, 0);
});
for (const mode of ['version', 'malformed', 'oversize', 'wrong-id'])
  test('protocol violation fails pending call: ' + mode, native, async t => {
    const { b } = await fixture(t, mode);
    await assert.rejects(b.request(Buffer.from('a')), { code: 'protocol' });
    await b.dispose();
    assert.equal(b.status().pid, null);
  });
test('startup deadline is distinct from operation deadline', native, async t => {
  const { b } = await fixture(t, 'startup-hang');
  await assert.rejects(b.request(Buffer.from('a')), { code: 'startup' });
  await b.dispose();
  const active = await fixture(t, 'hang');
  await assert.rejects(active.b.request(Buffer.from('a'), { timeoutMs: 200 }), { code: 'timeout' });
  assert.equal(active.b.status().pending, 0);
});
test('active cancellation stops child and releases all pending operations', native, async t => {
  const { b } = await fixture(t, 'hang');
  await b.start();
  const controller = new AbortController(),
    first = b.request(Buffer.from('a'), { signal: controller.signal }).catch(e => e.code),
    second = b.request(Buffer.from('b')).catch(e => e.code);
  await new Promise(r => setTimeout(r, 30));
  controller.abort();
  assert.equal(await first, 'canceled');
  assert.equal(await second, 'canceled');
  await b.dispose();
  assert.equal(b.status().pid, null);
});
test('crash rejects calls; a new request performs fresh verified startup without replay', native, async t => {
  const { b, verified } = await fixture(t, 'crash');
  await b.start();
  const first = b.request(Buffer.from('a')).catch(e => e.code),
    second = b.request(Buffer.from('b')).catch(e => e.code);
  assert.deepEqual(await Promise.all([first, second]), ['crash', 'crash']);
  await assert.rejects(b.request(Buffer.from('c')), { code: 'crash' });
  assert.equal(verified(), 2);
  assert.equal(b.status().stats.starts, 2);
  assert.equal(b.status().stats.completed, 0);
});
test('operation errors do not masquerade as protocol errors or kill healthy child', native, async t => {
  const { b } = await fixture(t, 'operation');
  await assert.rejects(b.request(Buffer.from('a')), { code: 'operation' });
  const pid = b.status().pid;
  await assert.rejects(b.request(Buffer.from('b')), { code: 'operation' });
  assert.equal(b.status().pid, pid);
  assert.equal(b.status().state, 'ready');
});
test('interpreter drift and disposal during verification refuse child startup', native, async t => {
  const python = await fingerprintPython('/usr/bin/python3'),
    b = new ComponentBridge({ verify: async () => ({}), python: { ...python, sha256: '0'.repeat(64) } });
  t.after(() => b.dispose());
  await assert.rejects(b.request(Buffer.alloc(0)), { code: 'integrity' });
  assert.equal(b.status().stats.starts, 0);
  let release;
  const c = new ComponentBridge({ verify: () => new Promise(r => (release = r)), python });
  const waiting = c.start().catch(e => e.code);
  await c.dispose();
  release({});
  assert.equal(await waiting, 'closed');
  assert.equal(c.status().pid, null);
  await assert.rejects(c.request(Buffer.alloc(0)), { code: 'closed' });
});
