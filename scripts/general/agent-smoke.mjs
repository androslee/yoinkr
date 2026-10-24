import { verificationOutput } from './verification-output.mjs';
// Real stdio MCP + pinned REA + original, owned fixture code. No model/API key or host config.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../src/workspace.js';
import { writeMcpClientConfig } from '../../src/agent-mcp.js';
const root = await verificationOutput('agent', process.env.YOINKR_AGENT_EVIDENCE ?? process.env.MODKIT_AGENT_EVIDENCE);
await mkdir(root, { recursive: true, mode: 0o700 });
const donor = join(root, 'donor'),
  recipient = join(root, 'recipient');
await mkdir(donor);
await mkdir(recipient);
const sources = {
  'package.json': '{"name":"owned-agent-donor","version":"1.0.0","type":"module","main":"format.js"}',
  'format.js':
    'import {clamp} from "./math.js"; export function formatProgress(n){return `${Math.round(clamp(n)*100)}%`;}',
  'math.js': 'export function clamp(n){return Math.max(0,Math.min(1,n));}'
};
for (const [name, value] of Object.entries(sources)) await writeFile(join(donor, name), value);
const host = 'export function display(n){return "unwired";}';
await writeFile(join(recipient, 'host.js'), host);
await writeFile(
  join(recipient, 'package.json'),
  '{"name":"owned-agent-recipient","version":"1.0.0","type":"module","main":"host.js"}'
);
const recipe = {
  schema: 1,
  moduleType: 'module',
  entry: 'format.js',
  mount: 'feature',
  patches: [
    {
      file: 'host.js',
      beforeSha256: sha256(host),
      find: host,
      replace: 'export {formatProgress as display} from "./feature/format.js";'
    }
  ],
  oracle: { module: 'format.js', export: 'formatProgress' },
  recipient: { module: 'host.js', export: 'display' },
  cases: [
    { args: [-2], expected: '0%' },
    { args: [0.375], expected: '38%' },
    { args: [2], expected: '100%' }
  ]
};
await writeFile(join(root, 'recipe.json'), JSON.stringify(recipe));
const config = join(root, 'agent.json');
await writeFile(
  config,
  JSON.stringify({
    schema: 1,
    allowWrites: true,
    allowExecution: true,
    outputRoot: 'output',
    applications: [
      { id: 'donor', path: 'donor' },
      { id: 'recipient', path: 'recipient' }
    ],
    recipes: [{ id: 'format', path: 'recipe.json' }],
    knowledgeRoots: [root]
  })
);
const configOriginal = await readFile(config);
await writeMcpClientConfig(config, join(root, 'mcp-client.json'), { includeRea: true });
const generated = JSON.parse(await readFile(join(root, 'mcp-client.json')));
const checks = [],
  calls = [];
let client, rea, ro;
const connect = async entry => {
  const c = new Client({ name: 'yoinkr-release-acceptance', version: '0.18.0' });
  await c.connect(new StdioClientTransport({ ...entry, stderr: 'pipe' }));
  return c;
};
const call = async (c, name, args = {}) => {
  const result = await c.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  const value = result.structuredContent ?? JSON.parse(result.content.find(x => x.type === 'text').text);
  calls.push({ tool: name, jobId: value.id ?? null });
  return value;
};
const complete = async job => {
  const deadline = Date.now() + 240000;
  let j = job;
  while (j.status === 'running') {
    assert.ok(Date.now() < deadline, 'operation deadline exceeded');
    await new Promise(r => setTimeout(r, 100));
    j = await call(client, 'yoinkr_job', { jobId: job.id });
  }
  assert.equal(j.status, 'succeeded', j.error);
  let raw = '',
    offset = 0;
  do {
    const p = await call(client, 'yoinkr_result', { jobId: job.id, offset });
    assert.ok(p.text.length <= 12000);
    raw += p.text;
    offset = p.nextOffset;
    if (offset === null) assert.equal(sha256(raw), p.sha256);
  } while (offset !== null);
  return JSON.parse(raw);
};
try {
  client = await connect(generated.mcpServers.yoinkr);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 17);
  assert.ok(listed.tools.some(t => t.name === 'yoinkr_verify'));
  checks.push('Official MCP client negotiates stdio and discovers capability-gated Yoinkr tools');
  const catalog = await call(client, 'yoinkr_catalog');
  assert.equal(catalog.registrations.applications.length, 2);
  assert.equal(catalog.registrations.recipes.length, 1);
  const investigation = await complete(
    await call(client, 'yoinkr_investigate', {
      donorId: 'donor',
      recipientId: 'recipient',
      feature: 'Original bounded progress formatting',
      seed: 'format.js',
      route: 'direct'
    })
  );
  const caseId = investigation.registrationId;
  assert.equal(investigation.record.provider.version, '6.7.0');
  assert.deepEqual(investigation.record.trace.files, ['format.js', 'math.js']);
  checks.push('Agent investigation uses actual pinned REA analysis and dependency tracing');
  const approvedRecipe = await call(client, 'yoinkr_recipe', { recipeId: 'format' });
  assert.equal(approvedRecipe.recipe.entry, 'format.js');
  const c = await call(client, 'yoinkr_case', { caseId });
  assert.equal(c.status, 'investigated');
  const query = await complete(await call(client, 'yoinkr_query', { caseId, view: 'modules', limit: 5 }));
  assert.equal(query.status, 'projected');
  assert.ok(query.parentEvidenceSha256);
  checks.push('Agent query projects retained REA Evidence with parent identity and hash');
  const traced = await complete(await call(client, 'yoinkr_trace', { caseId, seed: 'format.js' }));
  assert.equal(traced.status, 'traced');
  assert.ok(traced.seedMatches);
  checks.push('Follow-up trace retains its own REA Evidence without replacing the case');
  const exported = await complete(await call(client, 'yoinkr_export', { caseId, traced: true }));
  assert.equal(exported.files.length, 2);
  for (const file of exported.files)
    assert.equal(await readFile(join(exported.directory, 'files', file.path), 'utf8'), sources[file.path]);
  checks.push('Explicit recovery preserves exact original donor module bytes');
  const inspected = await call(client, 'yoinkr_source', { exportId: exported.registrationId, file: 'format.js' });
  assert.ok(JSON.stringify(inspected).includes('formatProgress'));
  checks.push('Recovered source can be inspected through the same protocol with provenance');
  const integrated = await complete(
    await call(client, 'yoinkr_integrate', { caseId, exportId: exported.registrationId, recipeId: 'format' })
  );
  assert.equal(integrated.status, 'prepared');
  assert.equal(await readFile(join(recipient, 'host.js'), 'utf8'), host);
  checks.push('Registered recipe integrates into a fresh copy, leaving original recipient unchanged');
  const verified = await complete(await call(client, 'yoinkr_verify', { workspaceId: integrated.registrationId }));
  assert.equal(verified.passed, true);
  assert.equal(verified.cases.length, 3);
  assert.ok((await stat(join(verified.directory, 'verification.json'))).isFile());
  checks.push('Explicit module execution passes three donor-versus-recipient behavior comparisons');
  const history = await call(client, 'yoinkr_history', { caseId });
  const h = history.status === 'running' ? await complete(history) : history;
  assert.equal(h.entries.length, 2);
  assert.ok(h.entries.every(x => x.status === 'verified-record'));
  const search = await call(client, 'yoinkr_search', { query: 'progress' });
  const searchValue = search.status === 'running' ? await complete(search) : search;
  assert.ok(searchValue.total);
  checks.push('New cases and retained history are available through prior-work and case tools');
  const unknown = await client.callTool({ name: 'yoinkr_case', arguments: { caseId: '../../etc/passwd' } });
  assert.equal(unknown.isError, true);
  checks.push('Unregistered/traversal inputs are rejected through the actual protocol');
  // A second plain server is read-only; no special DSH adapter or credentials.
  const roConfig = join(root, 'readonly.json');
  await writeFile(
    roConfig,
    JSON.stringify({
      schema: 1,
      outputRoot: 'readonly-output',
      cases: [{ id: 'progress', path: investigation.directory }]
    })
  );
  ro = await connect({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../src/cli.js', import.meta.url)), 'mcp', '--config', roConfig]
  });
  const readTools = await ro.listTools();
  assert.equal(readTools.tools.length, 11);
  assert.ok(!readTools.tools.some(t => t.name === 'yoinkr_verify' || t.name === 'yoinkr_export'));
  checks.push('Standalone read-only configuration exposes no extraction or execution tools');
  // Verify real upstream MCP discovery independently; no duplicate analysis catalog in Yoinkr.
  rea = await connect(generated.mcpServers.rea);
  const upstream = await rea.listTools();
  assert.ok(upstream.tools.length > 0);
  assert.ok(upstream.tools.every(t => !t.name.startsWith('yoinkr_')));
  checks.push('Optional upstream REA MCP starts independently and supplies its real tool catalog');
  assert.deepEqual(await readFile(config), configOriginal);
  checks.push('Client fragments are generated without editing any agent host configuration');
  await writeFile(
    join(root, 'ACCEPTANCE.json'),
    JSON.stringify(
      {
        schema: 1,
        version: '0.18.0',
        checks,
        calls,
        case: investigation.directory,
        workspace: integrated.directory,
        reaTools: upstream.tools.length,
        comparisonCases: verified.cases.length,
        passed: true,
        scope:
          'Actual standard MCP stdio, actual pinned REA, original owned fixture source, fresh module copy and differential execution. No arbitrary app portability or hostile-code confinement claimed.'
      },
      null,
      2
    ) + '\n'
  );
  console.log('AGENT MCP ACCEPTANCE PASSED:', checks.length, 'Evidence:', root);
} finally {
  await Promise.allSettled([client?.close(), ro?.close(), rea?.close()]);
}
