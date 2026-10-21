// Drift detection: an app that updated underneath a mod is the main way
// self-modding goes quietly wrong. Pin what a mod was installed against, and
// say so loudly when it moves.

import { readHeader, readEntryJson, sha256File } from './asar.js';

export async function computeState(app) {
  // app: { appId, asarPath }
  const { header } = readHeader(app.asarPath);
  const pkg = readEntryJson(app.asarPath, 'package.json');
  return {
    appId: app.appId,
    appVersion: pkg?.version ?? null,
    asarSha256: await sha256File(app.asarPath),
    entries: countEntries(header),
  };
}

export function makePin(state, modIds, pinnedAt = new Date().toISOString()) {
  return { schema: 1, pinnedAt, mods: [...modIds].sort(), appVersion: state.appVersion, asarSha256: state.asarSha256, entries: state.entries };
}

export function checkDrift(pin, current, policy = 'refuse') {
  if(!['refuse','warn','continue'].includes(policy))throw new Error('invalid drift policy; use pin to rebaseline');
  if (!pin) return { verdict: 'unpinned', action: policy === 'refuse' ? 'warn' : policy, changed: null };
  if (pin.asarSha256 === current.asarSha256) return { verdict: 'match', action: 'continue', changed: null };
  const action = policy === 'refuse' ? 'refuse' : policy === 'continue' ? 'continue' : 'warn';
  return {
    verdict: 'drift',
    action,
    pinnedVersion: pin.appVersion,
    currentVersion: current.appVersion,
    changed: diffEntryCounts(pin.entries, current.entries),
  };
}

export function diffEntryCounts(before, after) {
  if (!before || !after) return null;
  const changed = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) changed[key] = { pinned: before[key] ?? 0, current: after[key] ?? 0 };
  }
  return Object.keys(changed).length ? changed : null;
}

// Flatten the header tree into comparable counts per top-level directory.
export function countEntries(header) {
  const counts = {};
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node?.files ?? {})) {
      const label = prefix ? `${prefix}/${name}` : name;
      if (child?.files) walk(child, label);
      else {
        const bucket = prefix || '(root)';
        counts[bucket] = (counts[bucket] ?? 0) + 1;
      }
    }
  };
  walk(header, '');
  return counts;
}
