// Optional demonstration broker. Localhost only; no public broker contact.
import { createServer } from 'node:net';
import { Aedes } from 'aedes';
const port = Number(process.env.YOINKR_DEMO_PORT ?? process.env.MODKIT_DEMO_PORT ?? 18883);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('choose a port from 1024 to 65535');
const broker = await Aedes.createBroker(),
  server = createServer(broker.handle);
server.once('error', e => {
  console.error(e.message);
  clearInterval(timer);
  broker.close(() => {
    process.exitCode = 1;
  });
});
server.listen(port, '127.0.0.1', () => {
  console.log(
    `Local demo broker: mqtt://127.0.0.1:${port}\nConnect the native MQTT Explorer window with subscription #. Ctrl+C stops this broker.`
  );
});
let tick = 0;
const timer = setInterval(() => {
  tick++;
  const readings = [
    ['demo/plot/temperature', String(Math.round((21 + Math.sin(tick / 5)) * 10) / 10)],
    [
      'demo/home/kitchen/temperature',
      JSON.stringify({ temperature: Math.round((21 + Math.sin(tick / 5)) * 10) / 10, unit: 'C' })
    ],
    ['demo/home/light/state', tick % 4 ? 'ON' : 'OFF'],
    ['demo/device/status', JSON.stringify({ online: true, sequence: tick })]
  ];
  for (const [topic, payload] of readings)
    broker.publish({ cmd: 'publish', topic, payload: Buffer.from(payload), qos: 0, retain: true }, () => {});
}, 1200);
const stop = () => {
  clearInterval(timer);
  broker.close(() => server.close(() => process.exit(0)));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
