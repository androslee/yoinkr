import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  { PlotHistory } = require('../addons/mqtt-plot/plot-history.cjs');
test('plot ring retains newest ordered samples and returns copies rather than mutable internal points', () => {
  const h = new PlotHistory({ points: 3, convert: Number });
  for (let i = 0; i < 10; i++) assert.equal(h.add('a', String(i), i), true);
  const s = h.series('a');
  assert.deepEqual(
    s.points.map(p => p.value),
    [7, 8, 9]
  );
  assert.equal(s.received, 10);
  s.points[0].value = 999;
  assert.equal(h.series('a').points[0].value, 7);
});
test('plot storage rejects invalid/nonfinite values and honors topic and byte bounds', () => {
  const h = new PlotHistory({ topics: 1, convert: Number });
  for (const v of ['bad', 'Infinity', '-Infinity', 'é'.repeat(140000)]) assert.equal(h.add('a', v), false);
  assert.equal(h.add('a', '1', Infinity), false);
  assert.equal(h.topics.size, 0);
  assert.equal(h.add('a', '2', 1), true);
  assert.equal(h.add('b', '3', 2), false);
  assert.equal(h.series('b').points.length, 0);
});
test('per-topic reset preserves other histories and global clear removes all samples', () => {
  const h = new PlotHistory({ convert: Number });
  h.add('a', '1');
  h.add('b', '2');
  h.clear('a');
  assert.equal(h.series('a').received, 0);
  assert.equal(h.series('b').received, 1);
  h.clear();
  assert.equal(h.topics.size, 0);
});
test('plot bounds are validated and original raw text is passed to the selected converter', () => {
  for (const opts of [{ points: 1 }, { points: 241 }, { topics: 0 }, { topics: 1001 }, { convert: 42 }])
    assert.throws(() => new PlotHistory({ ...opts, convert: opts.convert ?? Number }));
  let seen;
  const h = new PlotHistory({
    convert: text => {
      seen = text;
      return 1.5;
    }
  });
  h.add('value', '1,5');
  assert.equal(seen, '1,5');
  assert.equal(h.series('value').points[0].value, 1.5);
});
