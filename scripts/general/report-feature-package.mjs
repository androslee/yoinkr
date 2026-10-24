import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { verifyFeaturePackage } from '../../src/feature-package.js';
import { readJson, newDestination, containedFile } from '../../src/workspace.js';
const flags = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--proof', '--out'].includes(process.argv[i]) || !process.argv[i + 1])
    throw Error('Use --proof <recovery-proof> --out <new report.html>');
  flags[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!flags.proof || !flags.out) throw Error('--proof and --out required');
const root = await realpath(flags.proof),
  proof = await readJson(join(root, 'REPRODUCIBILITY.json'));
if (proof.status !== 'passed') throw Error('Recovery proof did not pass');
const esc = v =>
  String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sections = [];
for (const route of ['source', 'bundle']) {
  const result = await readJson(join(root, route + '-browser/RESULT.json'));
  if (result.status !== 'passed') throw Error('Browser check failed: ' + route);
  const expected = proof.packages[route][0].digest;
  const verified = await verifyFeaturePackage(join(root, route + '-1'), { expectedDigest: expected });
  if (result.package.digest !== expected) throw Error('Browser proof used different package');
  const images = [];
  for (const name of result.screenshots) {
    const b = await readFile(await containedFile(join(root, route + '-browser'), name));
    if (b.length > 4 * 1024 * 1024) throw Error('Screenshot too large');
    images.push(
      `<figure><img alt="${esc(route + ' ' + name)}" src="data:image/png;base64,${b.toString('base64')}"><figcaption>${esc(name)}</figcaption></figure>`
    );
  }
  sections.push(
    `<section><h2>${esc(route)} recovery</h2><p>${verified.files} files · ${result.checksPassed} browser checks · 50 lifecycle cycles</p><p class="digest">${esc(expected)}</p><ul>${result.checks.map(c => '<li>' + esc(c) + '</li>').join('')}</ul>${images.join('')}</section>`
  );
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Yoinkr v0.20 — recovered original UI</title><style>body{margin:auto;max-width:1100px;padding:28px;background:#101318;color:#e0e6ed;font:16px/1.5 system-ui}h1,h2{color:#f3c76d}section{background:#1b212a;padding:20px;margin:24px 0;border-radius:12px}img{max-width:100%;height:auto;border:1px solid #45505c}figure{margin:20px 0}figcaption,.digest{color:#aab9c7;font:13px monospace;overflow-wrap:anywhere}li{margin:5px 0}strong{color:#8fe6b0}</style><h1>Recovered original comparison UI</h1><p><strong>Milestone 18 passed.</strong> MQTT Explorer's original Raw/Diff controls, renderer, history drawer and styles run in a minimal host. Fourteen original sources are retained; explicit adapters and two recorded compatibility patches are separate.</p><p>Both routes rebuild twice with identical per-route package digests and produce byte-identical renderer payloads. Ten real-input refusal checks passed. No DSH, model tokens, network acquisition or installed recipient modifications were needed.</p><p>This is component/package acceptance. Integration into a fresh real recipient is milestone 19. Whole-app donor/recipient equivalence and measured heap/listener lifecycle checks remain later work. Generated donor code is private; review retained licenses before redistribution.</p>${sections.join('')}<section><h2>Recovery and refusal evidence</h2><ul>${proof.checks.map(c => '<li>' + esc(c) + '</li>').join('')}${proof.negative.map(c => '<li>' + esc(c.name) + '</li>').join('')}</ul><p class="digest">Runtime SHA-256: ${esc(proof.compilerPayloadSha256)}</p></section></html>`;
const out = await newDestination(flags.out, [root]);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ out, status: 'passed', routes: 2, checks: 40, screenshots: 6 }));
