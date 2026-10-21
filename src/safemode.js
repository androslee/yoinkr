// Safe mode / disable-on-failure. The point of this module is that a bad mod
// should degrade itself, not the app: an early abnormal exit disables the most
// recently added mod, one mod per crash, and says why.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULTS = { crashWindowMs: 20_000, crashThreshold: 2 };

export function emptyState(appId) {
  return { schema: 1, appId, installOrder: [], disabled: {}, consecutiveCrashes: 0, lastLaunch: null };
}

export function loadState(dir, appId) {
  const file = join(dir, 'state.json');
  if (!existsSync(file)) return emptyState(appId);
  return { ...emptyState(appId), ...JSON.parse(readFileSync(file, 'utf8')) };
}

export function saveState(dir, state) {
  mkdirSync(dir,{recursive:true});
  const file=join(dir,'state.json'),temp=file+`.${process.pid}.tmp`;
  writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(temp,file);
}

export function recordInstall(state, modId, at = new Date().toISOString()) {
  if (!state.installOrder.includes(modId)) state.installOrder.push(modId);
  delete state.disabled[modId];
  state.consecutiveCrashes = 0;
  return { state, at };
}

export function recordUninstall(state, modId) {
  state.installOrder = state.installOrder.filter((id) => id !== modId);
  delete state.disabled[modId];
  return state;
}

// Which mods actually run this launch. Explicit safe mode wins.
export function planLaunch(state, mods, opts = {}) {
  const notes = [];
  if (opts.safeMode) {
    return { enabled: [], safeMode: true, notes: ['safe mode requested — running with no mods'] };
  }
  const enabled = [];
  for (const mod of mods) {
    const why = Object.hasOwn(state.disabled??{},mod.id)?state.disabled[mod.id]:null;
    if (why) notes.push(`${mod.id}: disabled (${why.reason})`);
    else enabled.push(mod);
  }
  const order=state.installOrder??[];
  enabled.sort((a,b)=>(order.indexOf(a.id)<0?order.length:order.indexOf(a.id))-(order.indexOf(b.id)<0?order.length:order.indexOf(b.id)));
  return { enabled, safeMode: false, notes };
}

// Called when the app exits. Returns the actions taken, for the log.
export function recordExit(state, mods, { exitCode = 0, signal = null, uptimeMs = 0, crashWindowMs = DEFAULTS.crashWindowMs, crashThreshold = DEFAULTS.crashThreshold, at = new Date().toISOString() } = {}) {
  const actions = [];
  const abnormal = exitCode !== 0 || signal !== null;
  state.lastLaunch = { at, exitCode, signal, uptimeMs, abnormal };
  if (!abnormal) {
    state.consecutiveCrashes = 0;
    return actions;
  }
  if (uptimeMs >= crashWindowMs) {
    state.consecutiveCrashes = 0;
    // Crashed late: unlikely to be the mod's fault. Record, don't punish.
    actions.push({ action: 'noted', detail: `abnormal exit (${describeExit(exitCode, signal)}) after ${uptimeMs}ms — outside the crash window, no mod disabled` });
    return actions;
  }
  if(!mods.length){state.consecutiveCrashes=0;actions.push({action:'noted',detail:'abnormal exit with no injected mods; no mod blamed'});return actions;}
  state.consecutiveCrashes = (Number(state.consecutiveCrashes) || 0) + 1;
  actions.push({ action: 'crash', detail: `abnormal exit (${describeExit(exitCode, signal)}) after ${uptimeMs}ms — crash ${state.consecutiveCrashes}/${crashThreshold}` });
  if (state.consecutiveCrashes < crashThreshold) return actions;

  const candidates = mods.filter((m) => !Object.hasOwn(state.disabled,m.id));
  const victim = candidates[candidates.length - 1]; // most recently added
  if (!victim) {
    actions.push({ action: 'noted', detail: 'crash threshold reached but no mods left to disable' });
    return actions;
  }
  state.disabled[victim.id] = { reason: `disabled after ${state.consecutiveCrashes} consecutive early crashes`, at };
  state.consecutiveCrashes = 0;
  actions.push({ action: 'disabled', detail: `${victim.id} disabled — will not load until re-enabled`, modId: victim.id });
  return actions;
}

export function explain(state) {
  const lines = [];
  for (const [id, why] of Object.entries(state.disabled)) lines.push(`${id}: ${why.reason} (${why.at})`);
  if (state.lastLaunch) {
    const l = state.lastLaunch;
    lines.push(`last launch: ${l.at} exit=${l.exitCode} signal=${l.signal ?? '-'} uptime=${l.uptimeMs}ms`);
  }
  return lines.length ? lines.join('\n') : 'nothing disabled, no abnormal exits recorded';
}

function describeExit(exitCode, signal) {
  return signal ? `signal ${signal}` : `exit code ${exitCode}`;
}
