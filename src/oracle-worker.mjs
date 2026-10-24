// Explicit verification executes selected modules. This is a bounded process,
// not a sandbox for hostile/untrusted donor code.
import { pathToFileURL } from 'node:url';
const encode = value => {
  if (value === undefined) return { type: 'undefined' };
  const json = JSON.stringify(value, (_k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw Error('non-finite output');
    if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') throw Error('non-JSON output');
    return v;
  });
  if (json === undefined || Buffer.byteLength(json) > 64000) throw Error('unsupported or oversized output');
  return { type: 'json', value: JSON.parse(json) };
};
process.once('message', async job => {
  try {
    const module = await import(pathToFileURL(job.module).href);
    if (!Object.hasOwn(module, job.export) || typeof module[job.export] !== 'function')
      throw Error('named callable export is missing: ' + job.export);
    const results = [];
    for (const c of job.cases) {
      try {
        const value = await module[job.export](...c.args);
        try {
          results.push({ kind: 'value', output: encode(value) });
        } catch (e) {
          results.push({ kind: 'unsupported', message: String(e.message) });
        }
      } catch (e) {
        results.push({ kind: 'throw', name: String(e?.name ?? 'Error'), message: String(e?.message ?? e) });
      }
    }
    process.send({ kind: 'results', results }, () => process.exit(0));
  } catch (e) {
    process.send({ kind: 'fatal', name: String(e?.name ?? 'Error'), message: String(e?.message ?? e) }, () =>
      process.exit(1)
    );
  }
});
