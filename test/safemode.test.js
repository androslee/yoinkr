import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  recordInstall,
  recordUninstall,
  planLaunch,
  recordExit,
  explain,
  DEFAULTS
} from '../src/safemode.js';
import { tempDir } from './helpers.js';
import { saveState, loadState } from '../src/safemode.js';

const mods = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

function fresh() {
  const state = emptyState('app');
  for (const m of mods) recordInstall(state, m.id);
  state.consecutiveCrashes = 0;
  return state;
}

test('one early crash is not enough to disable anything', () => {
  const state = fresh();
  const actions = recordExit(state, mods, { exitCode: 1, uptimeMs: 1000 });
  assert.deepEqual(
    actions.map(a => a.action),
    ['crash']
  );
  assert.equal(state.consecutiveCrashes, 1);
  assert.deepEqual(Object.keys(state.disabled), []);
});

test('the second consecutive early crash disables the most recently added mod', () => {
  const state = fresh();
  recordExit(state, mods, { exitCode: 1, uptimeMs: 1000 });
  const actions = recordExit(state, mods, { exitCode: null, signal: 'SIGSEGV', uptimeMs: 1000 });
  assert.deepEqual(
    actions.map(a => a.action),
    ['crash', 'disabled']
  );
  assert.deepEqual(Object.keys(state.disabled), ['third']);
  assert.deepEqual(
    planLaunch(state, mods).enabled.map(m => m.id),
    ['first', 'second']
  );
  assert.ok(planLaunch(state, mods).notes[0].includes('third'));
});

test('a crash outside the window is noted but punishes nobody', () => {
  const state = fresh();
  const actions = recordExit(state, mods, { exitCode: 1, uptimeMs: DEFAULTS.crashWindowMs + 1 });
  assert.deepEqual(
    actions.map(a => a.action),
    ['noted']
  );
  assert.deepEqual(Object.keys(state.disabled), []);
});

test('a clean run resets the crash counter', () => {
  const state = fresh();
  recordExit(state, mods, { exitCode: 1, uptimeMs: 1000 });
  assert.equal(state.consecutiveCrashes, 1);
  recordExit(state, mods, { exitCode: 0, uptimeMs: 1000 });
  assert.equal(state.consecutiveCrashes, 0);
  recordExit(state, mods, { exitCode: 1, uptimeMs: 1000 });
  assert.equal(state.consecutiveCrashes, 1, 'the counter restarted rather than carrying over');
});

test('safe mode runs with nothing, and explicit disable survives a reload', () => {
  const state = fresh();
  assert.deepEqual(planLaunch(state, mods, { safeMode: true }).enabled, []);
  state.disabled.first = { reason: 'by hand', at: new Date().toISOString() };
  const dir = tempDir();
  saveState(dir, state);
  const reloaded = loadState(dir, 'app');
  assert.deepEqual(
    planLaunch(reloaded, mods).enabled.map(m => m.id),
    ['second', 'third']
  );
  recordUninstall(reloaded, 'second');
  assert.deepEqual(reloaded.installOrder, ['first', 'third']);
  assert.ok(explain(reloaded).includes('first: by hand'));
});
