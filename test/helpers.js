// Test helpers: build a real (tiny) asar on disk, and a mock CDP transport.

import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tempDir(prefix = 'yoinkr-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// entries: [{ path: 'package.json', content: {...}|string }]
export function writeAsar(dir, entries) {
  const data = [];
  let offset = 0;
  const header = { files: {} };
  for (const e of entries) {
    const buf = Buffer.from(typeof e.content === 'string' ? e.content : JSON.stringify(e.content), 'utf8');
    const parts = e.path.split('/');
    let node = header;
    for (const part of parts.slice(0, -1)) node = (node.files[part] ??= { files: {} });
    node.files[parts.at(-1)] = { offset: String(offset), size: String(buf.length) };
    data.push(buf);
    offset += buf.length;
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)]);
  const payload = Buffer.concat([uint32(4 + padded.length), uint32(json.length), padded]);
  const out = Buffer.concat([uint32(4), uint32(payload.length), payload, ...data]);
  const file = join(dir, 'app.asar');
  writeFileSync(file, out);
  return file;
}

function uint32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

// Mock transport: answers requests via `handler(req)` and can push events.
export function mockTransport(handler) {
  const messageHandlers = [];
  const closeHandlers = [];
  return {
    closed: false,
    ready: Promise.resolve(),
    sent: [],
    send(text) {
      this.sent.push(JSON.parse(text));
      const req = JSON.parse(text);
      const res = handler(req);
      if (res) queueMicrotask(() => messageHandlers.forEach((cb) => cb(JSON.stringify({ id: req.id, ...res }))));
    },
    onMessage(cb) { messageHandlers.push(cb); },
    onClose(cb) { closeHandlers.push(cb); },
    emit(method, params, sessionId) {
      messageHandlers.forEach((cb) => cb(JSON.stringify({ method, params, ...(sessionId ? { sessionId } : {}) })));
    },
    close() { this.closed = true; closeHandlers.forEach((cb) => cb()); },
  };
}

export { mkdirSync, rmSync };
