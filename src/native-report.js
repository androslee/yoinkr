const esc = x =>
  String(x ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const hex = x => (Number.isInteger(x) ? x.toString(16).padStart(8, '0') : 'unavailable');
/** Human-readable snapshot of a completed run; no script or runtime execution. */
export function renderNativeReport(state, verification, manifest) {
  const cases = verification.cases
    .map(
      c =>
        `<tr><td>${esc(c.name)}</td><td>${esc(hex(c.donor))}</td><td>${esc(hex(c.recipient))}</td><td>${esc(hex(c.reference))}</td><td>${c.passed ? 'PASS' : 'FAIL'}</td></tr>`
    )
    .join('');
  const files = manifest.files
    .map(f => `<tr><td>${esc(f.file)}</td><td>${esc(f.bytes)}</td><td>${esc(f.crc32)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Yoinkr native component verification</title><style>body{background:#111720;color:#d6e0ef;font:15px/1.6 system-ui,sans-serif;margin:32px auto;padding:0 22px;max-width:1200px}h1{font-size:30px}section{background:#1a2431;border:1px solid #34465c;border-radius:10px;margin:20px 0;padding:22px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{border-bottom:1px solid #34465c;text-align:left;padding:9px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.status{font-weight:bold}.passed{color:#7bd8ac}.failed{color:#ff9292}code{overflow-wrap:anywhere}@media(max-width:700px){table{font-size:11px}td,th{padding:5px}}</style><h1>Native component · zlib checksum transfer</h1><p class="status ${verification.passed ? 'passed' : 'failed'}">${verification.passed ? 'Verified within the declared profile' : 'Verification failed'} · ${verification.cases.length} cases</p><p>Original compiled library copied into a separate recipient. This report is a saved snapshot, not a live integrity check.</p><section><h2>Component identity and evidence</h2><p>Profile: <code>${esc(state.profile)}</code><br>zlib version: ${esc(state.headerVersion)}<br>Library SHA-256: <code>${esc(state.librarySha256)}</code><br>REA provider: ${esc(state.evidence.provider.id)}<br>Evidence: <code>${esc(state.evidence.evidenceId)}</code></p><p>Reviewed exports: crc32 and zlibVersion. Matching C headers establish the ABI; exported names alone do not. The entire original library is retained, including its relocations and internal implementations.</p><pre>${esc(
    JSON.stringify(
      verification.workers.map(w => ({
        library: w.result?.library,
        version: w.result?.version,
        abi: w.result?.abi,
        runtimeDependencies: w.result?.runtimeDependencies,
        failure: w.failure
      })),
      null,
      2
    )
  )}</pre></section><section><h2>Native donor / recipient / independent reference</h2><table><thead><tr><th>Case</th><th>Donor</th><th>Recipient</th><th>JS reference</th><th>Result</th></tr></thead><tbody>${cases}</tbody></table></section><section><h2>Recipient file inventory</h2><p>These asset checksums were calculated through the copied native library. CRC32 detects accidental changes; the manifest also retains SHA-256 file identities.</p><table><thead><tr><th>Asset</th><th>Bytes</th><th>CRC32</th></tr></thead><tbody>${files}</tbody></table></section><section><h2>Provider limitations and delivery scope</h2><pre>${esc(JSON.stringify({ diagnostics: state.evidence.diagnostics, limitations: state.evidence.limitations, scope: state.scope }, null, 2))}</pre></section><footer>Recorded ${esc(verification.at)} · Source, ABI headers, license, complete REA Evidence and verification JSON remain alongside this report.</footer></html>`;
}
