import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('Aedes asynchronous startup supports retained messages and QoS on loopback', { timeout: 15000 }, async () => {
  const broker = await Aedes.createBroker();
  const server = createServer(broker.handle);
  const clients = [];
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = 'mqtt://127.0.0.1:' + server.address().port;
    const pub = mqtt.connect(url, { reconnectPeriod: 0 });
    clients.push(pub);
    await once(pub, 'connect');
    await pub.publishAsync('yoinkr/check', 'retained', { qos: 1, retain: true });
    const sub = mqtt.connect(url, { reconnectPeriod: 0 });
    clients.push(sub);
    await once(sub, 'connect');
    const message = once(sub, 'message');
    await sub.subscribeAsync('yoinkr/#', { qos: 1 });
    const [topic, payload, packet] = await message;
    assert.equal(topic, 'yoinkr/check');
    assert.equal(payload.toString(), 'retained');
    assert.equal(packet.retain, true);
    assert.equal(packet.qos, 1);
  } finally {
    await Promise.all(clients.map(c => c.endAsync(true)));
    await new Promise(r => broker.close(r));
    await new Promise(r => server.close(r));
  }
});
test(
  'the demo broker entry point starts, publishes and shuts down cleanly',
  { timeout: 15000, skip: process.platform === 'win32' },
  async () => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(r => probe.close(r));
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../scripts/applications/demo-broker.mjs', import.meta.url))],
      {
        env: { ...process.env, YOINKR_DEMO_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let log = '';
    child.stdout.on('data', b => {
      log += b;
    });
    child.stderr.on('data', b => {
      log += b;
    });
    const exited = once(child, 'exit');
    let client;
    try {
      const until = Date.now() + 5000;
      while (!log.includes('Local demo broker:')) {
        assert.equal(child.exitCode, null, log);
        assert.ok(Date.now() < until, 'Broker did not start: ' + log);
        await new Promise(r => setTimeout(r, 25));
      }
      client = mqtt.connect('mqtt://127.0.0.1:' + port, { reconnectPeriod: 0 });
      await once(client, 'connect', { signal: AbortSignal.timeout(5000) });
      const message = once(client, 'message', { signal: AbortSignal.timeout(5000) });
      await client.subscribeAsync('demo/#');
      const [topic, payload] = await message;
      assert.match(topic, /^demo\//);
      assert.ok(payload.length);
      await client.endAsync(true);
      client = null;
      child.kill('SIGTERM');
      const [code] = await Promise.race([
        exited,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('Broker shutdown timed out')), 5000);
          timer.unref();
        })
      ]);
      assert.equal(code, 0, log);
    } finally {
      if (client) await client.endAsync(true);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  }
);
