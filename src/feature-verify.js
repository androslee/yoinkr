/** Shared semantic replay and explicit original/recipient comparison. */
import { z } from 'zod';
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sha256, saveJson, readJson, containedFile, newDestination } from './workspace.js';
import { canonical } from './feature-package.js';
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('input'), topic: id, messages: z.array(z.string()).min(1).max(64) }).strict(),
  z.object({ action: z.literal('mode'), value: z.enum(['raw', 'diff']) }).strict(),
  z.object({ action: z.literal('theme'), value: z.enum(['light', 'dark']) }).strict(),
  z.object({ action: z.literal('history'), index: z.number().int().min(0).max(63) }).strict(),
  z
    .object({
      action: z.literal('resize'),
      width: z.number().int().min(480).max(2000),
      height: z.number().int().min(400).max(1600)
    })
    .strict(),
  ...['copy', 'clear', 'select-code'].map(a => z.object({ action: z.literal(a) }).strict()),
  z
    .object({
      action: z.literal('observe'),
      id,
      empty: z.boolean().optional(),
      clipboard: z.boolean().optional(),
      selection: z.boolean().optional(),
      screenshot: z.boolean().optional(),
      counts: z
        .object({
          added: z.number().int().nonnegative(),
          removed: z.number().int().nonnegative(),
          against: z.enum(['previous', 'selected'])
        })
        .strict()
        .optional()
    })
    .strict()
]);
const schema = z
  .object({
    schema: z.literal(1),
    kind: z.literal('shared-feature-suite'),
    id,
    baselineSha256: hash,
    coverage: z
      .array(z.object({ baseline: id, shared: id }).strict())
      .min(1)
      .max(32),
    normalization: z
      .object({ version: z.literal(1), ignore: z.array(z.string()), variants: z.array(z.string()) })
      .strict(),
    performance: z
      .object({
        version: z.literal(2),
        sharedCorpusBytes: z.tuple([z.literal(1024), z.literal(10240)]),
        recipientOnlyStressBytes: z.literal(102400),
        donorTransport: z
          .object({
            maxMessageBytes: z.literal(20000),
            source: z.literal('backend/src/index.ts'),
            sourceSha256: hash,
            decision: z.string()
          })
          .strict(),
        samples: z.number().int().min(10).max(30),
        warmOpenP95Ms: z.number().positive(),
        rendererCpuOverheadMs: z.number().positive(),
        rendererCpuOverheadFraction: z.number().nonnegative(),
        startupOverheadMs: z.number().positive(),
        startupOverheadFraction: z.number().nonnegative(),
        lifecycleCycles: z.literal(50),
        heapGrowthBytes: z.number().positive(),
        heapGrowthFraction: z.number().nonnegative(),
        metric: z.string()
      })
      .strict(),
    scenarios: z
      .array(z.object({ id, steps: z.array(action).min(1).max(128) }).strict())
      .min(1)
      .max(32)
  })
  .strict();
export function validateSharedSuite(value) {
  const suite = schema.parse(value);
  if (Buffer.byteLength(JSON.stringify(suite)) > 1024 * 1024) throw Error('Suite exceeds 1 MiB');
  const ids = new Set(),
    points = new Set();
  if (new Set(suite.coverage.map(c => c.baseline)).size !== suite.coverage.length)
    throw Error('Duplicate baseline coverage');
  for (const s of suite.scenarios) {
    if (ids.has(s.id)) throw Error('Duplicate scenario');
    ids.add(s.id);
    for (const a of s.steps) {
      if (a.action === 'input' && Buffer.byteLength(a.messages.join('')) > 131072) throw Error('Input exceeds 128 KiB');
      if (a.action === 'observe') {
        if (points.has(a.id)) throw Error('Duplicate observation');
        points.add(a.id);
      }
    }
  }
  if (!points.size || suite.scenarios.some(s => !s.steps.some(a => a.action === 'observe')))
    throw Error('Each scenario requires an observation');
  if (suite.coverage.some(c => !ids.has(c.shared))) throw Error('Coverage references absent scenario');
  return suite;
}
export function formattedMessages(messages) {
  const current = messages.at(-1) ?? '';
  let json = false;
  try {
    JSON.parse(current);
    json = true;
  } catch {}
  return messages.map(text => {
    if (json)
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
    return text;
  });
}
export function normalizeFeatureObservation(raw, { empty = false, clipboard = false, selection = false } = {}) {
  const blocks = raw.blocks.map(b => ({
    lines: b.lines.map(l => ({ text: l.text, kind: l.kind, background: l.background, tokens: l.tokens })),
    font: b.font,
    fontSize: b.fontSize,
    lineHeight: b.lineHeight,
    lineHeights: b.lines.map(l => l.height),
    counts: b.counts
  }));
  const visiblyEmpty = blocks.every(b => b.lines.every(l => l.text === ''));
  return {
    schema: 1,
    mode: empty ? null : raw.mode,
    view: empty && visiblyEmpty ? 'empty' : 'value',
    blocks: empty && visiblyEmpty ? [] : blocks,
    history: empty ? [] : raw.history.map(h => h.value),
    ...(clipboard ? { clipboard: raw.clipboard } : {}),
    ...(selection ? { selectionIncludesCurrent: raw.selectionIncludesCurrent } : {})
  };
}
export function differences(expected, actual, prefix = '') {
  if (canonical(expected) === canonical(actual)) return [];
  if (
    expected === null ||
    actual === null ||
    typeof expected !== 'object' ||
    typeof actual !== 'object' ||
    Array.isArray(expected) !== Array.isArray(actual)
  )
    return [{ path: prefix || '$', expected, actual }];
  const out = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)]))
    out.push(...differences(expected[key], actual[key], prefix ? prefix + '.' + key : key));
  return out;
}
export function checkObservation(raw, state, step) {
  const failures = [],
    current = formattedMessages(state.messages).at(-1) ?? '';
  if (step.empty) {
    if (raw.blocks.some(b => b.lines.some(l => l.text !== ''))) failures.push('Expected empty rendered value');
  } else {
    if (raw.mode !== state.mode) failures.push('Wrong selected Raw/Diff mode');
    if (!raw.blocks.length) failures.push('Missing comparison renderer');
    if (state.mode === 'raw' && raw.blocks[0]?.lines.map(l => l.text).join('\n') !== current)
      failures.push('Current rendered value differs from supplied payload');
    if (raw.history.map(h => h.value).join('\0') !== [...state.messages].reverse().join('\0'))
      failures.push('History must preserve original newest-first order');
    if (raw.controls.some(c => !c.visible || c.width < 30 || c.height < 25))
      failures.push('Missing or misaligned original mode control');
    if (raw.blocks.some(b => b.fontSize !== '12px' || b.lines.some(l => Math.abs(l.height - 16) > 1)))
      failures.push('Missing/misaligned original code styles');
  }
  if (step.counts && canonical(raw.blocks[0]?.counts) !== canonical(step.counts))
    failures.push('Incorrect change counts or selected-history comparison');
  if (step.clipboard && raw.clipboard !== state.messages.at(-1))
    failures.push('Clipboard output differs from input bytes');
  if (step.selection && !raw.selectionIncludesCurrent && !raw.knownDonorKeyboardDefect)
    failures.push('Keyboard selection does not include rendered current value');
  return failures;
}
export async function captureFeatureObservation(page, { clipboard, selectionNeedle = '' } = {}) {
  return page.evaluate(
    ({ clipboard, selectionNeedle }) => {
      const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const wrappers = [...document.querySelectorAll('div[tabindex="0"]')].filter(
        e => visible(e) && [...e.children].some(c => c.tagName === 'PRE')
      );
      const blocks = wrappers.map(wrapper => {
        const pre = [...wrapper.children].find(e => e.tagName === 'PRE'),
          style = getComputedStyle(pre);
        const leaf = [...pre.querySelectorAll('div')].filter(e => !e.querySelector('div'));
        const label = wrapper.parentElement.innerText.replace(/\s+/g, ' ').trim();
        const m = /Comparing with (previous|selected) message: \+\s*(\d+) lines?,\s*-\s*(\d+) lines?/.exec(label);
        return {
          text: pre.innerText,
          font: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          rect: pre.getBoundingClientRect().toJSON(),
          lines: leaf.map(e => {
            const s = getComputedStyle(e);
            return {
              text: e.innerText,
              kind:
                s.backgroundColor === 'rgba(10, 255, 10, 0.3)'
                  ? 'added'
                  : s.backgroundColor === 'rgba(255, 10, 10, 0.3)'
                    ? 'removed'
                    : 'unchanged',
              background: s.backgroundColor,
              height: e.getBoundingClientRect().height,
              tokens: [...e.querySelectorAll('.token')].map(t => ({
                type: t.className,
                text: t.textContent,
                color: getComputedStyle(t).color
              }))
            };
          }),
          counts: m ? { against: m[1], added: Number(m[2]), removed: Number(m[3]) } : null
        };
      });
      const controls = ['diff', 'raw'].map(mode => {
        const e = document.querySelector('#valueRendererDisplayMode-' + mode),
          r = e?.getBoundingClientRect();
        return {
          mode,
          visible: visible(e),
          pressed: e?.getAttribute('aria-pressed') ?? null,
          width: r?.width ?? 0,
          height: r?.height ?? 0
        };
      });
      const history = [...document.querySelectorAll('div[tabindex="0"]')]
        .filter(e => visible(e) && e.querySelector(':scope > div > span > pre'))
        .map(e => ({
          value: e.querySelector(':scope > div > span > pre').innerText,
          title: e.firstElementChild?.innerText,
          background: getComputedStyle(e).backgroundColor
        }));
      const selected = String(window.getSelection());
      return {
        schema: 1,
        blocks,
        controls,
        history,
        mode: controls.find(c => c.pressed === 'true')?.mode ?? null,
        selection: selected,
        selectionIncludesCurrent: selectionNeedle ? selected.includes(selectionNeedle) : true,
        clipboard: clipboard ?? null,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        url: location.href
      };
    },
    { clipboard, selectionNeedle }
  );
}
export const percentile = (samples, p = 0.95) => {
  if (!samples.length || samples.some(n => !Number.isFinite(n) || n < 0))
    throw Error('Cannot measure empty/nonfinite/negative samples');
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
};
export function evaluateLifecycle(before, after, policy) {
  for (const metrics of [before, after])
    for (const key of ['toolWindows', 'ipcListeners', 'appListeners', 'timeouts', 'heapUsed', 'processCount'])
      if (!Number.isFinite(metrics[key]) || metrics[key] < 0) throw Error('Invalid lifecycle observation: ' + key);
  const failures = [];
  if (!before.forcedGc || !after.forcedGc) failures.push('Forced-GC heap observation unavailable');
  if (after.toolWindows !== 0) failures.push('Owned feature window leaked');
  if (after.ipcListeners > before.ipcListeners || after.appListeners > before.appListeners)
    failures.push('Subscription count grew');
  if (after.timeouts > before.timeouts) failures.push('Timer count grew');
  if (after.heapUsed - before.heapUsed > Math.max(policy.heapGrowthBytes, before.heapUsed * policy.heapGrowthFraction))
    failures.push('Retained heap exceeded growth budget');
  if (after.processCount > before.processCount + 2)
    failures.push('Owned process count grew beyond spare-renderer allowance');
  return { passed: !failures.length, failures, before, after };
}
export async function replaySharedFeatureSuite(driver, suiteValue, out) {
  const suite = validateSharedSuite(suiteValue),
    directory = await newDestination(out, driver.protectedRoots ?? []);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { mode: 0o700 });
  const files = [],
    events = [],
    observations = [],
    failures = [];
  let state = { messages: [], mode: 'diff', theme: 'light', selected: null, topic: '' };
  const artifact = async (name, value, binary = false) => {
    const bytes = binary ? value : Buffer.from(JSON.stringify(value, null, 2) + '\n');
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    files.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
  };
  await artifact('SUITE.json', suite);
  await artifact('DRIVER.json', driver.identity);
  try {
    for (const scenario of suite.scenarios)
      for (const [index, step] of scenario.steps.entries()) {
        const started = performance.now(),
          event = { sequence: events.length, scenario: scenario.id, index, action: step.action, status: 'started' };
        events.push(event);
        try {
          if (step.action === 'input') {
            await driver.input(step.topic, step.messages);
            state = { ...state, messages: step.messages, topic: step.topic, selected: null };
          } else if (step.action === 'clear') {
            await driver.clear();
            state = { ...state, messages: [], selected: null };
          } else if (step.action === 'mode') {
            await driver.mode(step.value);
            state = { ...state, mode: step.value };
          } else if (step.action === 'theme') {
            await driver.theme(step.value);
            state = { ...state, theme: step.value };
          } else if (step.action === 'history') {
            await driver.history(step.index, state.messages);
            state = { ...state, selected: state.selected === step.index ? null : step.index };
          } else if (step.action === 'resize') await driver.resize(step.width, step.height);
          else if (step.action === 'select-code') await driver.selectCode();
          else if (step.action === 'copy') await driver.copy();
          else if (step.action === 'observe') {
            await driver.showHistory();
            const raw = await driver.observe({
              clipboard: step.clipboard,
              selectionNeedle: step.selection
                ? ((formattedMessages(state.messages).at(-1) ?? '').split('\n').find(l => l.includes('running')) ??
                  formattedMessages(state.messages).at(-1))
                : ''
            });
            if (step.selection && driver.identity.id === 'original-donor-v1' && !raw.selectionIncludesCurrent) {
              raw.knownDonorKeyboardDefect = await driver.page
                .locator('div[tabindex="0"]:has(> pre)')
                .first()
                .evaluate(e => e.querySelectorAll('pre ~ pre').length === 0);
            }
            const normalized = normalizeFeatureObservation(raw, step),
              problems = checkObservation(raw, state, step);
            await artifact(step.id + '.raw.json', raw);
            await artifact(step.id + '.normalized.json', normalized);
            if (step.screenshot)
              await artifact(step.id + '.png', await driver.page.screenshot({ fullPage: true }), true);
            observations.push({
              id: step.id,
              scenario: scenario.id,
              passed: problems.length === 0,
              failures: problems,
              raw: step.id + '.raw.json',
              normalized: step.id + '.normalized.json',
              state: structuredClone(state)
            });
            failures.push(...problems.map(message => ({ id: step.id, message })));
          }
          event.status = 'completed';
        } catch (e) {
          event.status = 'failed';
          event.error = e.message;
          throw e;
        } finally {
          event.durationMs = performance.now() - started;
        }
      }
  } catch (e) {
    failures.push({ message: e.message });
    if (driver.page)
      try {
        await artifact('failure-ui.json', await driver.observe({}));
        await artifact('failure.png', await driver.page.screenshot({ fullPage: true }), true);
      } catch {}
  }
  await artifact('EVENTS.json', events);
  await artifact('OBSERVATIONS.json', observations);
  const result = {
    schema: 1,
    kind: 'shared-feature-driver-run',
    driver: driver.identity,
    suiteId: suite.id,
    suiteSha256: sha256(canonical(suite)),
    status: failures.length ? 'failed' : 'passed',
    observations: observations.length,
    failures,
    files
  };
  await saveJson(join(directory, 'RUN.json'), result);
  return { directory, ...result };
}
export async function inspectFeatureRun(directory) {
  const root = await realpath(directory),
    run = await readJson(await containedFile(root, 'RUN.json'));
  if (
    run.schema !== 1 ||
    run.kind !== 'shared-feature-driver-run' ||
    !['passed', 'failed'].includes(run.status) ||
    !Array.isArray(run.files) ||
    run.files.length > 1024
  )
    throw Error('Invalid acceptance run');
  const names = new Set();
  let total = 0;
  for (const f of run.files) {
    if (names.has(f.path)) throw Error('Duplicate acceptance artifact');
    names.add(f.path);
    const file = await containedFile(root, f.path),
      size = (await stat(file)).size;
    total += size;
    if (size > 32 * 1024 * 1024 || total > 128 * 1024 * 1024) throw Error('Acceptance artifacts exceed read limit');
    const bytes = await readFile(file);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw Error('Acceptance artifact changed: ' + f.path);
  }
  const json = async name => {
    if (!names.has(name)) throw Error('Unregistered acceptance artifact: ' + name);
    return readJson(await containedFile(root, name));
  };
  const suite = validateSharedSuite(await json('SUITE.json'));
  if (sha256(canonical(suite)) !== run.suiteSha256) throw Error('Scenario identity changed');
  const observations = await json('OBSERVATIONS.json');
  if (!Array.isArray(observations) || observations.length !== run.observations)
    throw Error('Invalid observation manifest');
  const expected = suite.scenarios.flatMap(s => s.steps.filter(a => a.action === 'observe').map(a => a.id));
  if (
    run.status === 'passed' &&
    (canonical(expected) !== canonical(observations.map(o => o.id)) ||
      observations.some(o => !o.passed || o.failures.length))
  )
    throw Error('Passing run is missing or has failed assertions');
  for (const o of observations) {
    const step = suite.scenarios.flatMap(s => s.steps).find(a => a.action === 'observe' && a.id === o.id);
    if (!step) throw Error('Unknown observation');
    const raw = await json(o.raw),
      normalized = await json(o.normalized);
    if (canonical(normalizeFeatureObservation(raw, step)) !== canonical(normalized))
      throw Error('Normalized observation does not match raw input');
  }
  return { root, run, suite, observations, json };
}
export async function compareFeatureRuns(donorPath, recipientPath, out) {
  const [a, b] = await Promise.all([inspectFeatureRun(donorPath), inspectFeatureRun(recipientPath)]);
  if (a.run.suiteSha256 !== b.run.suiteSha256) throw Error('Scenario versions differ');
  const differencesList = [],
    approvedDifferences = [];
  for (const expected of a.observations) {
    const actual = b.observations.find(o => o.id === expected.id);
    if (!actual) {
      differencesList.push({ id: expected.id, path: '$', message: 'Missing recipient observation' });
      continue;
    }
    for (const d of differences(await a.json(expected.normalized), await b.json(actual.normalized))) {
      if (
        a.run.driver.id === 'original-donor-v1' &&
        expected.id === 'selection-and-copy' &&
        d.path === 'selectionIncludesCurrent' &&
        d.expected === false &&
        d.actual === true &&
        (await a.json(expected.raw)).knownDonorKeyboardDefect
      ) {
        approvedDifferences.push({
          id: expected.id,
          ...d,
          reason: 'Recorded original selector defect; recovered package has the explicit keyboard patch.'
        });
        continue;
      }
      differencesList.push({ id: expected.id, ...d });
    }
  }
  if (a.observations.length !== b.observations.length)
    differencesList.push({ path: '$', message: 'Observation count differs' });
  const result = {
    schema: 1,
    kind: 'shared-feature-comparison',
    status: a.run.status === 'passed' && b.run.status === 'passed' && !differencesList.length ? 'passed' : 'failed',
    suiteSha256: a.run.suiteSha256,
    donor: a.run.driver,
    recipient: b.run.driver,
    observations: a.observations.length,
    differences: differencesList,
    approvedDifferences,
    driverFailures: [a.run.failures, b.run.failures]
  };
  if (out) await saveJson(out, result);
  return result;
}
