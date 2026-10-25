import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSourceMapIdentities } from '../scripts/applications/mqtt-build-inputs.mjs';
const source = 'webpack://mqtt-explorer-app/./component.ts';
const map = {
  version: 3,
  sources: [source + '?aaaa'],
  sourcesContent: ['original source'],
  names: [],
  mappings: 'AAAA'
};
const prefix = 'globalThis.yoinkrMustNotExecute = true;\n';
const suffix = '\n//# sourceURL=webpack-internal:///./component.ts\n';
const body =
  prefix +
  '//# sourceMappingURL=data:application/json;base64,' +
  Buffer.from(JSON.stringify(map)).toString('base64') +
  suffix;
const call = 'eval(' + JSON.stringify(body) + ');';
test('MQTT normalization preserves module code and source content without executing it', () => {
  const { output, changes } = normalizeSourceMapIdentities(call, { [source]: source + '?bbbb' });
  assert.equal(changes, 1);
  const next = JSON.parse(output.slice(5, -2));
  assert.ok(next.startsWith(prefix));
  assert.ok(next.endsWith(suffix));
  const encoded = next.match(/base64,([^\n]+)/)[1];
  const decoded = JSON.parse(Buffer.from(encoded, 'base64'));
  assert.deepEqual(decoded, { ...map, sources: [source + '?bbbb'] });
  assert.equal(globalThis.yoinkrMustNotExecute, undefined);
  assert.equal(normalizeSourceMapIdentities(output, { [source]: source + '?bbbb' }).output, output);
});
test('MQTT normalization rejects unknown identities and preserves non-map code', () => {
  assert.throws(() => normalizeSourceMapIdentities(call, {}), /Unknown/);
  assert.throws(() => normalizeSourceMapIdentities(call, { [source]: 'webpack://different/file' }), /invalid/);
  const plain = 'const untouched = "eval is only text";';
  assert.equal(normalizeSourceMapIdentities(plain, {}).output, plain);
});
