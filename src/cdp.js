// Small bounded CDP client, usable with a real socket or an offline mock.
export class CdpClient {
  constructor(transport, { timeoutMs = 10_000 } = {}) {
    this.transport = transport; this.timeoutMs = timeoutMs; this.nextId = 1;
    this.pending = new Map(); this.listeners = new Map(); this.closed = false;
    transport.onMessage(msg => {
      try { this._handle(msg); } catch (err) { this._failAll(err); }
    });
    transport.onClose?.(() => { this.closed = true; this._failAll(new Error('transport closed')); });
  }
  _handle(raw) {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (msg.id !== undefined) {
      const waiter = this.pending.get(msg.id); if (!waiter) return;
      this.pending.delete(msg.id); clearTimeout(waiter.timer);
      if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
      else waiter.resolve(msg.result);
    } else if (msg.method) {
      for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params ?? {}, msg.sessionId);
      for (const cb of this.listeners.get('*') ?? []) cb(msg);
    }
  }
  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(cb); return () => this.listeners.get(method)?.delete(cb);
  }
  call(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('transport closed'));
    const id = this.nextId++, frame = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: timed out after ${this.timeoutMs}ms`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.transport.send(JSON.stringify(frame)); }
      catch (err) { clearTimeout(timer); this.pending.delete(id); reject(err); }
    });
  }
  async attachToTarget(targetId) { return (await this.call('Target.attachToTarget', { targetId, flatten: true })).sessionId; }
  async listTargets() { return (await this.call('Target.getTargets')).targetInfos ?? []; }
  async waitForTarget(predicate, { timeoutMs = 15_000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    do { const found = (await this.listTargets()).find(predicate); if (found) return found;
      if (Date.now() >= deadline) break; await new Promise(r => setTimeout(r, intervalMs));
    } while (true); return null;
  }
  async addScriptToEvaluateOnNewDocument(source, sessionId) {
    return (await this.call('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId)).identifier;
  }
  async evaluate(expression, sessionId) {
    const res = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res?.exceptionDetails) throw new Error(`mod threw: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    return res?.result?.value;
  }
  _failAll(err) { for (const w of this.pending.values()) { clearTimeout(w.timer); w.reject(err); } this.pending.clear(); }
  close() { this.closed = true; this._failAll(new Error('client closed')); this.listeners.clear(); this.transport.close(); }
}

// Guard each document against duplicate registration/evaluation races. This is
// error containment, not a sandbox: mods execute with the renderer's authority.
export function wrapModSource(modId, source) {
  const id = JSON.stringify(modId);
  return `(function(){const id=${id};const runs=window.__modkitRuns||(window.__modkitRuns=Object.create(null));if(runs[id])return;runs[id]='running';try{${source}\nruns[id]='loaded';}catch(e){runs[id]='failed';console.error('[yoinkr]',id,e&&e.stack||e);const errors=window.__modkitErrors||(window.__modkitErrors=Object.create(null));errors[id]=String(e&&e.stack||e);}})();`;
}

/** Register reload hooks AND run in current documents; attach future windows.
 * Polling discovers independent top-level windows, not just related popups.
 * Future windows may execute app code before discovery; this is not a preload.
 */
export async function injectRenderers(cdp, mods, { intervalMs = 250, onError = () => {}, onInjected = () => {} } = {}) {
  const sessions = new Map(), scripts = [], failed = new Set(); let stopped = false, busy = false;
  async function refresh() {
    if (stopped || busy) return; busy = true;
    try {
      const targets = (await cdp.listTargets()).filter(t => t.type === 'page' && !/^(devtools|chrome-devtools):/.test(t.url ?? ''));
      const live = new Set(targets.map(t => t.targetId));
      for (const [id, session] of sessions) if (!live.has(id)) {
        sessions.delete(id); await cdp.call('Target.detachFromTarget', { sessionId: session }).catch(() => {});
      }
      for (const target of targets) {
        if (stopped || sessions.has(target.targetId) || failed.has(target.targetId)) continue;
        try {
          const session = await cdp.attachToTarget(target.targetId); sessions.set(target.targetId, session);
          await cdp.call('Page.enable',{},session);
          for (const mod of mods) {
            const source = wrapModSource(mod.id, mod.source);
            const identifier = await cdp.addScriptToEvaluateOnNewDocument(source, session);
            scripts.push({ identifier, session });
            await cdp.evaluate(source, session);
            onInjected(mod.id, target.targetId);
          }
        } catch (err) { failed.add(target.targetId); onError(err, target.targetId); }
      }
    } finally { busy = false; }
  }
  await refresh();
  const timer = setInterval(() => { refresh().catch(onError); }, intervalMs);
  return { sessions, scripts, async stop() {
    stopped = true; clearInterval(timer);
    // Normal stop follows child exit. These calls also remove future hooks if
    // the caller disconnects while its fixture/browser remains alive.
    for (const {identifier,session} of scripts) await cdp.call('Page.removeScriptToEvaluateOnNewDocument', {identifier}, session).catch(() => {});
    for (const sessionId of sessions.values()) await cdp.call('Target.detachFromTarget',{sessionId}).catch(() => {});
  } };
}
