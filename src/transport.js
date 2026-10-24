// Real transport: the global WebSocket in Node >= 22. Kept separate from
// cdp.js so the protocol layer stays testable with a mock.

export function wsTransport(url) {
  const ws = new WebSocket(url);
  const messageHandlers = [];
  const closeHandlers = [];
  let opened = false;

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      opened = true;
      resolve();
    });
    ws.addEventListener('error', ev => reject(new Error(`websocket error: ${ev?.message ?? 'unknown'}`)));
    ws.addEventListener('close', () => {
      opened = false;
      reject(new Error('websocket closed before or after connection'));
      closeHandlers.forEach(cb => cb());
    });
    ws.addEventListener('message', ev => {
      const data = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
      messageHandlers.forEach(cb => cb(data));
    });
  });

  return {
    ready,
    send(text) {
      if (!opened) throw new Error('transport not open');
      ws.send(text);
    },
    onMessage(cb) {
      messageHandlers.push(cb);
    },
    onClose(cb) {
      closeHandlers.push(cb);
    },
    close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  };
}

// DevTools endpoint discovery: http://127.0.0.1:<port>/json/version gives the
// webSocketDebuggerUrl for the browser-level target.
export async function discoverDebuggerUrl(port, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error(`devtools discovery failed: HTTP ${res.status}`);
  const info = await res.json();
  if (!info?.webSocketDebuggerUrl) throw new Error('no webSocketDebuggerUrl in /json/version');
  return info.webSocketDebuggerUrl;
}

export function freePort() {
  return 0; // pass 0 to the app: it picks one and reports it on stderr
}
