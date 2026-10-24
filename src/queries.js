// Targeted projections use upstream REA's typed Evidence views, not a new analyzer.
import { mkdir, writeFile, readFile, stat, realpath, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCase } from './investigation.js';
import { containedFile, inside, saveJson, sha256 } from './workspace.js';
import { runRea } from './rea.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function queryView({
  view = 'summary',
  paths = [],
  properties = [],
  node,
  kind,
  offset = 0,
  limit = 20,
  availableKeys = false
} = {}) {
  if (!['summary', 'modules', 'module', 'facts'].includes(view))
    throw Error('view must be summary, modules, module or facts');
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1000000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error('offset must be 0 to 1000000 and limit 1 to 100');
  for (const [name, values] of [
    ['paths', paths],
    ['properties', properties]
  ])
    if (!Array.isArray(values) || values.length > 32 || values.some(v => typeof v !== 'string' || v.length > 2000))
      throw Error(name + ' must contain up to 32 bounded exact strings');
  if (typeof availableKeys !== 'boolean') throw Error('availableKeys must be boolean');
  if (
    kind !== undefined &&
    (!['javascript-asset', 'javascript-module', 'source-module'].includes(kind) || view !== 'modules')
  )
    throw Error('kind is supported only for module reference pages');
  if (node !== undefined && (view !== 'module' || !/^jag_node_[a-f0-9]{64}$/.test(node)))
    throw Error('node requires module view and an exact jag_node identity');
  if (view !== 'facts' && (properties.length || availableKeys))
    throw Error('properties and available keys require facts view');
  if (['summary', 'module'].includes(view) && (offset !== 0 || limit !== 20))
    throw Error('pagination is available only for modules and facts views');
  if (view === 'summary') {
    if (paths.length) throw Error('summary does not accept paths');
    return { kind: 'summary' };
  }
  if (view === 'module') {
    if ((node ? 1 : 0) + paths.length !== 1) throw Error('module view requires exactly one node or path selector');
    return { kind: 'item', collection: 'modules', selector: node ? { node_id: node } : { path: paths[0] } };
  }
  if (view === 'modules') {
    if (paths.length > 1) throw Error('module references accept at most one exact path');
    return {
      kind: 'javascript',
      collection: 'modules',
      projection: 'references',
      where: { ...(paths.length ? { path: paths[0] } : {}), ...(kind ? { kind } : {}) },
      offset,
      limit
    };
  }
  return {
    kind: 'javascript-facts',
    where: paths.length ? { paths: [...new Set(paths)] } : {},
    property_keys: [...new Set(properties)],
    include_available_property_keys: availableKeys,
    offset,
    limit
  };
}
export async function queryCase(casePath, { side = 'donor', ...options } = {}, backend = runRea) {
  if (!['donor', 'recipient'].includes(side)) throw Error('side must be donor or recipient');
  const view = queryView(options),
    { root, record, evidence } = await readCase(casePath);
  const parent = join(root, 'queries');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (!inside(root, await realpath(parent))) throw Error('query directory escaped the case');
  const directory = join(parent, randomUUID());
  await mkdir(directory, { mode: 0o700 });
  const request = { source: { kind: 'inline', evidence: evidence[side] }, view };
  await saveJson(join(directory, 'request.json'), request);
  try {
    const output = await backend(
      ['inspect-analysis-view', join(directory, 'request.json')],
      join(directory, 'evidence.json'),
      { maxBytes: 8 * 1024 * 1024 }
    );
    const result = output.normalized_result;
    if (result?.parent_evidence_id !== evidence[side].evidence_id || !same(result?.view, view))
      throw Error('query result parent identity or view differs from selected request');
    const recordOut = {
      schema: 1,
      caseId: record.id,
      createdAt: new Date().toISOString(),
      side,
      view,
      parentEvidenceId: evidence[side].evidence_id,
      parentEvidenceSha256: record.evidenceHashes[side + '.json'],
      evidenceId: output.evidence_id,
      evidenceSha256: sha256(await readFile(join(directory, 'evidence.json'))),
      requestSha256: sha256(await readFile(join(directory, 'request.json'))),
      status: 'projected',
      coverage: result.coverage,
      sourceCoverage: result.source_coverage ?? null,
      limitations: output.limitations ?? [],
      note: 'Projection of retained static Evidence; no live analysis or runtime acceptance performed.'
    };
    await saveJson(join(directory, 'QUERY.json'), recordOut);
    return { directory, ...recordOut, result };
  } catch (error) {
    await writeFile(join(directory, 'FAILED.txt'), error.message + '\n', { flag: 'wx', mode: 0o600 });
    throw error;
  }
}
async function bounded(root, name, max) {
  const file = await containedFile(root, name);
  if ((await stat(file)).size > max) throw Error('retained record exceeds read limit: ' + name);
  return readFile(file);
}
export async function caseHistory(casePath, { limit = 8 } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 32) throw Error('history limit must be 0 to 32');
  const { root, record, evidence } = await readCase(casePath),
    candidates = [],
    warnings = [];
  let scanOmitted = 0;
  for (const type of ['queries', 'followups']) {
    const parent = join(root, type);
    let entries;
    try {
      if (!inside(root, await realpath(parent))) throw Error('history directory escaped the case');
      entries = await readdir(parent, { withFileTypes: true });
    } catch (e) {
      if (e.code !== 'ENOENT') warnings.push({ path: type, error: e.message });
      continue;
    }
    const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    scanOmitted += Math.max(0, dirs.length - 128);
    for (const entry of dirs.slice(0, 128)) {
      const directory = join(parent, entry.name);
      candidates.push({ type, directory, mtime: (await stat(directory)).mtimeMs });
    }
    for (const entry of entries.filter(e => e.isSymbolicLink()))
      warnings.push({ path: type + '/' + entry.name, error: 'Symlink history entry skipped' });
  }
  candidates.sort((a, b) => b.mtime - a.mtime || a.directory.localeCompare(b.directory));
  const entries = [];
  for (const candidate of candidates.slice(0, limit)) {
    const { type, directory } = candidate,
      metadata = type === 'queries' ? 'QUERY.json' : 'FOLLOWUP.json';
    try {
      const requestBytes = await bounded(directory, 'request.json', 64 * 1024 * 1024),
        request = JSON.parse(requestBytes);
      let saved;
      try {
        saved = JSON.parse(await bounded(directory, metadata, 1024 * 1024));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        const failure = String(await bounded(directory, 'FAILED.txt', 65536));
        entries.push({
          type,
          directory,
          status: 'failed-unverified',
          detail: failure,
          note: 'Failure log only; no successful result Evidence is admitted.'
        });
        continue;
      }
      if (saved.schema !== 1 || saved.caseId !== record.id || !['donor', 'recipient'].includes(saved.side))
        throw Error('history case identity differs');
      const parent = evidence[saved.side],
        inline = type === 'queries' ? request.source?.evidence : request.application;
      if (
        saved.parentEvidenceId !== parent.evidence_id ||
        saved.parentEvidenceSha256 !== record.evidenceHashes[saved.side + '.json'] ||
        !same(inline, parent)
      )
        throw Error('history parent Evidence differs');
      const bytes = await bounded(directory, 'evidence.json', 64 * 1024 * 1024);
      if (sha256(bytes) !== saved.evidenceSha256 || sha256(requestBytes) !== saved.requestSha256)
        throw Error('history Evidence/request changed');
      const envelope = JSON.parse(bytes),
        output = envelope.data;
      if (envelope.ok !== true || output?.evidence_id !== saved.evidenceId)
        throw Error('history output identity differs');
      if (
        type === 'queries' &&
        (output.normalized_result?.parent_evidence_id !== parent.evidence_id ||
          !same(request.view, saved.view) ||
          !same(output.normalized_result?.view, request.view))
      )
        throw Error('query parent/view differs');
      if (
        type === 'followups' &&
        (!Array.isArray(output.normalized_result?.seed_matches) ||
          !Array.isArray(output.normalized_result?.graph?.nodes) ||
          !same(request.seed, saved.seed) ||
          request.direction !== saved.direction)
      )
        throw Error('trace seed/direction differs');
      entries.push({ type, directory, status: 'verified-record', record: saved, evidence: output });
    } catch (e) {
      warnings.push({ path: directory, error: e.message });
      entries.push({ type, directory, status: 'invalid-record', detail: e.message });
    }
  }
  return {
    entries,
    warnings,
    displayOmitted: Math.max(0, candidates.length - limit) + scanOmitted,
    scope:
      'Locally hash-checked query/trace history. Failed and invalid records are not admitted as graph or query Evidence.'
  };
}
