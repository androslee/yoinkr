import { readFile } from 'node:fs/promises';
import { delay } from './feature-drivers/common.js';
async function state(pid) {
  try {
    const text = await readFile('/proc/' + pid + '/stat', 'utf8'),
      fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return { pid, state: fields[0], birth: fields[19] };
  } catch (e) {
    if (e.code === 'ENOENT') return { pid, state: 'exited', birth: null };
    throw e;
  }
}
export async function snapshotOwnedDriver(driver) {
  const pids = driver.app ? await driver.app.evaluate(({ app }) => app.getAppMetrics().map(m => m.pid)) : [];
  return {
    processes: await Promise.all(pids.map(state)),
    serverHandles: process.getActiveResourcesInfo().filter(x => x === 'TCPServerWrap').length
  };
}
export async function closeOwnedDriver(driver, before) {
  const browser = driver.page?.context().browser(),
    child = driver.app?.process();
  await driver.close();
  let remaining = [];
  for (let i = 0; i < 60; i++) {
    remaining = [];
    for (const original of before.processes) {
      const current = await state(original.pid);
      if (current.birth === original.birth && !['exited', 'Z', 'X'].includes(current.state))
        remaining.push(current.pid);
    }
    if (!remaining.length) break;
    await delay(50);
  }
  const afterServerHandles = process.getActiveResourcesInfo().filter(x => x === 'TCPServerWrap').length;
  return {
    schema: 1,
    applicationExited: !child || child.exitCode !== null || child.signalCode !== null,
    browserDisconnected: !!driver.app || !browser?.isConnected(),
    remainingOwnedPids: remaining,
    processes: before.processes,
    serverHandlesBeforeClose: before.serverHandles,
    serverHandlesAfterClose: afterServerHandles,
    scope:
      'Only this owned app PID set; /proc birth times prevent PID reuse from being mistaken for a leak. Zombie/exited states are not running processes.'
  };
}
