import { registerDeliveryTools } from './delivery-agent.js';
import { loadDeliveryConfig } from './delivery.js';
import { YOINKR_VERSION } from './version.js';
// Agent operations are Yoinkr workflows, not a duplicate of REA's tool catalog.
import { z } from 'zod';
import { readFile, writeFile, mkdir, realpath, stat, lstat } from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCase, followupTrace } from './investigation.js';
import { investigate, exportFeature, applicationRoot } from './research.js';
import { caseHistory, queryCase } from './queries.js';
import { readExamples } from './examples.js';
import { integrateFeature } from './workspace.js';
import { workspaceStatus, verifyWorkspace } from './verify.js';
import { readJson, sha256, inside, newDestination, validateRecipe, saveJson } from './workspace.js';
import { buildLibrary } from './library.js';
import { reaInfo } from './rea.js';
import { inspectSource } from './sources.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const text = z.string().min(1).max(1000);
const registration = z.object({ id, path: z.string().min(1).max(4096) }).strict();
export const agentConfigSchema = z
  .object({
    schema: z.literal(1),
    allowWrites: z.boolean().default(false),
    allowExecution: z.boolean().default(false),
    outputRoot: z.string().min(1).max(4096),
    cases: z.array(registration).max(64).default([]),
    applications: z.array(registration).max(64).default([]),
    workspaces: z.array(registration).max(64).default([]),
    recipes: z.array(registration).max(64).default([]),
    exports: z
      .array(z.object({ id, caseId: id, path: z.string().min(1).max(4096) }).strict())
      .max(64)
      .default([]),
    deliveryConfig: z.string().min(1).max(4096).optional(),
    knowledgeRoots: z.array(z.string().min(1).max(4096)).max(64).default([])
  })
  .strict()
  .refine(c => !c.allowExecution || c.allowWrites, 'allowExecution requires allowWrites');
const page = {
  offset: z.number().int().min(0).max(1000000).default(0),
  limit: z.number().int().min(1).max(50).default(20)
};
const side = z.enum(['donor', 'recipient']).default('donor');
const seedKind = z.enum(['module', 'string', 'api', 'ipc', 'route', 'node-id', 'native-export']).default('module');
const object = shape => z.object(shape).strict();
const scope =
  'Retained static Evidence is not runtime acceptance. Verification executes registered code with ordinary user permissions; it is not a hostile-code sandbox.';
export const RESULT_PAGE = 12000;

export async function loadAgentConfig(file) {
  const path = await realpath(resolve(file));
  if ((await stat(path)).size > 1024 * 1024) throw Error('agent config exceeds 1 MiB');
  const config = agentConfigSchema.parse(JSON.parse(await readFile(path, 'utf8'))),
    base = dirname(path);
  const maps = {
    cases: new Map(),
    applications: new Map(),
    workspaces: new Map(),
    recipes: new Map(),
    exports: new Map()
  };
  const absolute = p => (isAbsolute(p) ? p : resolve(base, p));
  for (const [kind, map] of Object.entries(maps))
    for (const item of config[kind]) {
      if (map.has(item.id)) throw Error('duplicate ' + kind + ' id: ' + item.id);
      const path = await realpath(absolute(item.path));
      if (kind === 'cases') await readCase(path);
      if (kind === 'applications') await applicationRoot(path);
      if (kind === 'workspaces') await workspaceStatus(path);
      if (kind === 'recipes') validateRecipe(await readJson(path));
      map.set(item.id, { ...item, path, ...(kind === 'recipes' ? { sha256: sha256(await readFile(path)) } : {}) });
    }
  for (const item of maps.exports.values()) {
    const parent = maps.cases.get(item.caseId);
    if (!parent || !inside(parent.path, item.path)) throw Error('export must belong to a registered case');
    const manifest = await readJson(join(item.path, 'EXPORT.json')),
      c = await readCase(parent.path);
    if (manifest.schema !== 1 || manifest.caseId !== c.record.id) throw Error('export case identity differs');
  }
  const knowledgeRoots = [];
  for (const root of config.knowledgeRoots) {
    const p = await realpath(absolute(root));
    if (!(await stat(p)).isDirectory()) throw Error('knowledge root must be a directory');
    knowledgeRoots.push(p);
  }
  const deliveryFile = config.deliveryConfig ? await realpath(absolute(config.deliveryConfig)) : null;
  const delivery = deliveryFile ? await loadDeliveryConfig(deliveryFile) : null;
  const protectedRoots = [
    ...(delivery
      ? [
          delivery.config.bundle,
          delivery.config.donor,
          delivery.config.source,
          ...Object.values(delivery.config.runtimes),
          delivery.config.outputRoot
        ]
      : []),
    ...maps.cases.values(),
    ...maps.applications.values(),
    ...maps.workspaces.values()
  ].map(x => (typeof x === 'string' ? x : x.path));
  // No output symlink or output tree inside an input; generated paths never come from tool arguments.
  const outputRoot = await newDestination(absolute(config.outputRoot), protectedRoots);
  try {
    if ((await lstat(outputRoot)).isSymbolicLink() || !(await stat(outputRoot)).isDirectory())
      throw Error('outputRoot must be an ordinary directory');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { path, config, maps, knowledgeRoots, outputRoot, deliveryFile };
}

export async function createAgent(file) {
  const loaded = await loadAgentConfig(file),
    { config, maps, knowledgeRoots, outputRoot } = loaded;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  if ((await realpath(outputRoot)) !== outputRoot) throw Error('outputRoot changed during setup');
  const session = join(outputRoot, 'agent-' + randomUUID());
  await mkdir(session, { mode: 0o700 });
  const jobs = new Map(),
    tools = new Map();
  let active = null,
    closing = false;
  const get = (kind, key) => {
    const item = maps[kind].get(key);
    if (!item) throw Error('unknown registered ' + kind + ' id: ' + key);
    return item;
  };
  const add = (name, description, schema, run, { write = false, execution = false } = {}) => {
    if ((write && !config.allowWrites) || (execution && !config.allowExecution)) return;
    tools.set(name, {
      name,
      description,
      inputSchema: schema,
      annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: !write, openWorldHint: execution },
      run: args => run(schema.parse(args))
    });
  };
  const summarizeJob = j => ({
    id: j.id,
    tool: j.tool,
    status: j.status,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt ?? null,
    directory: j.directory,
    result: j.result ?? null,
    error: j.error ?? null
  });
  const submit = async (tool, args, work) => {
    if (closing) throw Error('agent is closing');
    if (active) throw Error('another operation is running; poll yoinkr_job before retrying');
    if (jobs.size >= 128) throw Error('session job limit reached; restart with a fresh session');
    const job = { id: randomUUID(), tool, status: 'running', createdAt: new Date().toISOString() };
    job.directory = join(session, job.id);
    // Reserve before any await: simultaneous MCP calls cannot create orphan/duplicate jobs.
    jobs.set(job.id, job);
    active = job;
    job.promise = (async () => {
      try {
        await mkdir(job.directory, { mode: 0o700 });
        await saveJson(join(job.directory, 'REQUEST.json'), { schema: 1, tool, args, createdAt: job.createdAt });
        const result = await work(),
          serialized = JSON.stringify(result);
        if (Buffer.byteLength(serialized) > 32 * 1024 * 1024)
          throw Error('result exceeds 32 MiB; operation artifacts remain on disk; narrow the next request');
        await writeFile(join(job.directory, 'RESULT.json'), serialized, { flag: 'wx', mode: 0o600 });
        job.result = {
          characters: serialized.length,
          bytes: Buffer.byteLength(serialized),
          sha256: sha256(serialized)
        };
        job.status = 'succeeded';
      } catch (e) {
        job.status = 'failed';
        job.error = String(e.message).slice(0, 4000);
      } finally {
        job.finishedAt = new Date().toISOString();
        try {
          await saveJson(join(job.directory, 'JOB.json'), summarizeJob(job));
        } catch (e) {
          job.status = 'failed';
          job.error = 'job record could not be saved: ' + e.message;
        }
        active = null;
      }
    })();
    return summarizeJob(job);
  };
  const newPath = jobKind => join(session, jobKind + '-' + randomUUID());
  await registerDeliveryTools({ file: loaded.deliveryFile, add, submit, newPath });
  const caseRead = async key => {
    const c = get('cases', key);
    return readCase(c.path);
  };
  add(
    'yoinkr_catalog',
    'List registered IDs and enabled capabilities. Tool inputs accept these IDs, never arbitrary filesystem or shell paths.',
    object({}),
    async () => ({
      version: YOINKR_VERSION,
      rea: { version: reaInfo().version },
      capabilities: { writes: config.allowWrites, execution: config.allowExecution },
      registrations: Object.fromEntries(
        Object.entries(maps).map(([kind, map]) => [
          kind,
          [...map.values()].map(({ id, path, caseId }) => ({ id, path, ...(caseId ? { caseId } : {}) }))
        ])
      ),
      session,
      activeJob: active?.id ?? null,
      scope
    })
  );
  add('yoinkr_case', 'Read a hash-checked case summary and provenance.', object({ caseId: id }), async ({ caseId }) => {
    const { record } = await caseRead(caseId);
    return { registrationId: caseId, ...record, scope };
  });
  add(
    'yoinkr_history',
    'Read locally checked retained query/trace history; not fresh runtime acceptance.',
    object({ caseId: id, limit: z.number().int().min(0).max(8).default(4) }),
    async ({ caseId, limit }) => caseHistory(get('cases', caseId).path, { limit })
  );
  add(
    'yoinkr_examples',
    'Read saved manual observations and JSON replay examples, without images or execution.',
    object({ caseId: id, limit: z.number().int().min(1).max(16).default(8) }),
    async ({ caseId, limit }) => {
      await caseRead(caseId);
      return readExamples(get('cases', caseId).path, { limit, includeImages: false });
    }
  );
  add(
    'yoinkr_recipe',
    'Read an exact registered integration recipe and its pinned hash before applying it.',
    object({ recipeId: id }),
    async ({ recipeId }) => {
      const r = get('recipes', recipeId),
        bytes = await readFile(r.path);
      if (sha256(bytes) !== r.sha256) throw Error('registered recipe changed; restart after reviewing it');
      return { id: recipeId, sha256: r.sha256, recipe: JSON.parse(bytes) };
    }
  );
  add(
    'yoinkr_source',
    'Inspect a recovered export file or source-map location with retained-byte provenance.',
    object({
      exportId: id,
      file: z.string().min(1).max(2000),
      line: z.number().int().min(1).max(10000000).default(1),
      column: z.number().int().min(0).max(10000000).default(0),
      map: z.string().max(2000).optional()
    }),
    async ({ exportId, ...options }) => {
      const e = get('exports', exportId),
        c = get('cases', e.caseId);
      return inspectSource(c.path, { exportDirectory: e.path, ...options });
    }
  );
  add(
    'yoinkr_workspace',
    'Read current workspace status and recorded verification, without executing code.',
    object({ workspaceId: id }),
    async ({ workspaceId }) => workspaceStatus(get('workspaces', workspaceId).path)
  );
  let library;
  const getLibrary = async () => (library ??= await buildLibrary(knowledgeRoots));
  add(
    'yoinkr_search',
    'Search registered prior-work roots. Recorded findings and acceptance are historical, not fresh proof.',
    object({
      query: z.string().max(256).default(''),
      kind: z
        .enum(['', 'case', 'note', 'native', 'module', 'conversion', 'playbook', 'verification', 'finding'])
        .default(''),
      ...page
    }),
    async args => ({ ...(await getLibrary()).search(args), scope })
  );
  add(
    'yoinkr_document',
    'Read a prior-work document with current citation integrity checks.',
    object({ documentId: z.string().max(80) }),
    async ({ documentId }) => (await getLibrary()).detail(documentId)
  );
  add(
    'yoinkr_job',
    'Poll a submitted operation. Jobs finish independently of request cancellation; no blind resubmission.',
    object({ jobId: z.string().uuid() }),
    async ({ jobId }) => {
      const j = jobs.get(jobId);
      if (!j) throw Error('unknown job');
      return summarizeJob(j);
    }
  );
  add(
    'yoinkr_result',
    'Read a retained job result in bounded text pages. Concatenate text to reconstruct JSON; SHA-256 covers the complete UTF-8 result.',
    object({ jobId: z.string().uuid(), offset: z.number().int().min(0).max(64000000).default(0) }),
    async ({ jobId, offset }) => {
      const j = jobs.get(jobId);
      if (j?.status !== 'succeeded') throw Error('no successful result for this job');
      const resultPath = join(j.directory, 'RESULT.json');
      if ((await stat(resultPath)).size !== j.result.bytes) throw Error('retained result changed');
      const bytes = await readFile(resultPath);
      if (sha256(bytes) !== j.result.sha256) throw Error('retained result changed');
      const raw = bytes.toString('utf8');
      if (offset > raw.length) throw Error('offset exceeds result');
      // Avoid cutting a surrogate pair between pages.
      let end = Math.min(raw.length, offset + RESULT_PAGE);
      if (end < raw.length && /[\uD800-\uDBFF]/.test(raw[end - 1])) end--;
      return { ...j.result, offset, nextOffset: end < raw.length ? end : null, text: raw.slice(offset, end) };
    }
  );
  const write = { write: true };
  add(
    'yoinkr_query',
    'Submit a targeted projection using upstream REA. Retains query Evidence inside the selected case; poll job then read result.',
    object({
      caseId: id,
      side,
      view: z.enum(['summary', 'modules', 'module', 'facts']).default('summary'),
      paths: z.array(z.string().max(2000)).max(32).default([]),
      properties: z.array(z.string().max(2000)).max(32).default([]),
      node: z.string().max(100).optional(),
      kind: z.enum(['javascript-asset', 'javascript-module', 'source-module']).optional(),
      availableKeys: z.boolean().default(false),
      ...page
    }),
    async ({ caseId, ...options }) => {
      get('cases', caseId);
      return submit('yoinkr_query', { caseId, ...options }, () => queryCase(get('cases', caseId).path, options));
    },
    write
  );
  add(
    'yoinkr_trace',
    'Submit an upstream REA follow-up trace, retaining new Evidence without replacing the original case.',
    object({
      caseId: id,
      side,
      seed: text,
      seedKind,
      direction: z.enum(['incoming', 'outgoing', 'both']).default('outgoing')
    }),
    async ({ caseId, ...options }) => {
      get('cases', caseId);
      return submit('yoinkr_trace', { caseId, ...options }, () => followupTrace(get('cases', caseId).path, options));
    },
    write
  );
  add(
    'yoinkr_investigate',
    'Analyze two registered applications with actual REA and create a fresh case. Does not execute donor or recipient.',
    object({
      donorId: id,
      recipientId: id,
      feature: text,
      seed: text,
      seedKind,
      route: z.enum(['direct', 'convert', 'bridge', 'rebuild', 'undecided']).default('undecided'),
      donorSources: z.array(z.string().max(2000)).max(32).default([]),
      recipientSources: z.array(z.string().max(2000)).max(32).default([])
    }),
    async args => {
      const donor = get('applications', args.donorId),
        recipient = get('applications', args.recipientId);
      return submit('yoinkr_investigate', args, async () => {
        const path = newPath('case'),
          record = await investigate({ ...args, donor: donor.path, recipient: recipient.path, out: path }),
          key = 'case-' + randomUUID();
        maps.cases.set(key, { id: key, path });
        library = null;
        return { registrationId: key, directory: path, record, scope };
      });
    },
    write
  );
  add(
    'yoinkr_export',
    'Recover explicit files or the traced working set into a private case export. Extraction is not integration.',
    object({
      caseId: id,
      files: z.array(z.string().max(2000)).max(256).default([]),
      traced: z.boolean().default(false)
    }),
    async args => {
      const c = get('cases', args.caseId);
      await caseRead(args.caseId);
      return submit('yoinkr_export', args, async () => {
        const result = await exportFeature(c.path, args),
          key = 'export-' + randomUUID();
        maps.exports.set(key, { id: key, path: result.directory, caseId: args.caseId });
        return { registrationId: key, ...result };
      });
    },
    write
  );
  add(
    'yoinkr_integrate',
    'Apply a registered hash-pinned module recipe to a fresh recipient working copy. No original app is patched.',
    object({ caseId: id, exportId: id, recipeId: id }),
    async args => {
      const c = get('cases', args.caseId),
        e = get('exports', args.exportId),
        recipe = get('recipes', args.recipeId);
      if (e.caseId !== args.caseId) throw Error('export does not belong to selected case');
      await caseRead(args.caseId);
      return submit('yoinkr_integrate', args, async () => {
        const bytes = await readFile(recipe.path);
        if (sha256(bytes) !== recipe.sha256) throw Error('registered recipe changed; restart after reviewing it');
        // Snapshot exact approved recipe bytes; integration never rereads a mutable registration.
        const recipePath = newPath('recipe') + '.json';
        await writeFile(recipePath, bytes, { flag: 'wx', mode: 0o600 });
        const result = await integrateFeature(c.path, {
            exportDirectory: e.path,
            recipe: recipePath,
            out: newPath('workspace')
          }),
          key = 'workspace-' + randomUUID();
        maps.workspaces.set(key, { id: key, path: result.directory });
        library = null;
        return { registrationId: key, ...result };
      });
    },
    write
  );
  add(
    'yoinkr_verify',
    'Execute a registered donor snapshot and recipient working copy; retain bounded differential results. Ordinary user permissions, not a hostile-code sandbox.',
    object({
      workspaceId: id,
      timeoutMs: z.number().int().min(50).max(30000).default(5000),
      exampleIds: z.array(z.string().max(100)).min(1).max(32).optional()
    }),
    async args => {
      const w = get('workspaces', args.workspaceId);
      return submit('yoinkr_verify', args, async () => {
        const report = await verifyWorkspace(w.path, args);
        library = null;
        return report;
      });
    },
    { write: true, execution: true }
  );
  return {
    tools,
    session,
    loaded,
    async call(name, args = {}) {
      if (name.startsWith('modkit_')) name = 'yoinkr_' + name.slice(7);
      const tool = tools.get(name);
      if (!tool) throw Error('unknown or disabled Yoinkr tool');
      // Read operations can also return sizable records: retain, never silently truncate.
      const result = await tool.run(args),
        serialized = JSON.stringify(result);
      if (serialized.length <= RESULT_PAGE || name === 'yoinkr_result') return result;
      if (active) throw Error('result needs retention while another job is active; retry after it finishes');
      return submit(name, args, async () => result);
    },
    async close() {
      closing = true;
      await active?.promise;
    }
  };
}
