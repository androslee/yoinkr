# Standalone agent tools (v0.18)

Yoinkr works independently of DSH. Its standard **stdio MCP server** lets compatible coding-agent clients investigate cases, recover original files, prepare fresh recipient copies and compare behavior. The workbench and existing CLI remain usable without an agent, account or API key. This bridge uses the official MCP SDK and the existing pinned REA engine; it does not implement another analyzer.

## Start from a GitHub checkout

Use a supported Node version (`^22.19.0`, `^24.11.0` or `>=26`). From the project directory:

```sh
npm ci
cp docs/examples/agent.json ./agent.json
node src/cli.js mcp-config --config ./agent.json --out ./mcp-client.json
```

The generated JSON contains a conventional `mcpServers.yoinkr` command/args entry. Review and import/merge that entry using your client's MCP settings. Client configuration formats vary; clients without this wrapper can use the generated command and argument array directly. Nothing automatically installs into a client, modifies its settings or starts DSH. Generated absolute paths belong to the current checkout; each person generates their own fragment. Do not commit someone else's generated client config.

To run the server directly:

```sh
node src/cli.js mcp --config ./agent.json
```

It waits for MCP JSON-RPC on stdin. Stdout is reserved for protocol messages; startup/error messages go to stderr. This is not an HTTP server or a browser page.

For the full upstream analysis catalog as a **separate optional server**:

```sh
node src/cli.js mcp-config --config ./agent.json --out ./mcp-with-rea.json --include-rea
```

This adds the already-installed `rea-agents` executable with `--mcp`; it does not invoke REA setup, download models or register a provider. REA has its own capability/tool surface; Yoinkr's registrations and capability flags constrain the Yoinkr server only. Enable the separate REA entry only when you want that catalog and have reviewed its own settings. REA's optional native/runtime providers may need their documented local tools. The demonstrated JavaScript transfer needs no separate service.

## Register inputs explicitly

Paths in `agent.json` resolve relative to that file, not the client's working directory. IDs must be unique within each category. For an owned JavaScript feature transfer:

```json
{
  "schema": 1,
  "allowWrites": true,
  "allowExecution": false,
  "outputRoot": "./agent-output",
  "cases": [],
  "applications": [
    {"id": "donor", "path": "./lab/donor"},
    {"id": "recipient", "path": "./lab/recipient"}
  ],
  "workspaces": [],
  "recipes": [{"id": "formatter", "path": "./lab/recipe.json"}],
  "exports": [],
  "knowledgeRoots": ["./cases"]
}
```

Registered paths must already exist, except `outputRoot`, which is created privately. Omit unused registrations; `./cases` above is an example directory you must create or change. Cases must have valid retained REA Evidence, workspaces must have Yoinkr metadata and recipes must pass the existing integration schema. A registered existing export is `{"id":"export-a","caseId":"case-a","path":"./cases/a/private/export-..."}` and must belong to its registered case.

Keep output outside donor, recipient, case and workspace input trees. No shell command, arbitrary output path, on-the-fly recipe body or new registration path is accepted by a tool. The operator edits the config and restarts to approve different inputs/recipes. Newly created cases, exports and workspaces receive IDs returned by the operation and appear in `yoinkr_catalog` for that server session.

`allowWrites: false` is the default: case/source/recipe/workspace reads, prior-work search and job-result reads are available. The server still writes its private session directory and retains oversized read results there. It does not change registered input records in this mode.

`allowWrites: true` additionally enables investigation, REA projections/traces (which retain Evidence in the case), extraction and fresh-copy integration. This does not execute transferred modules. `allowExecution: true` additionally enables differential module verification and requires `allowWrites`. Verification runs the registered code with ordinary user permissions, **not a hostile-code sandbox**. Inspect unfamiliar donor behavior first. Existing recipe hash, source-byte, Evidence identity and patch-base checks remain enforced.

## Tools

| Tool | Purpose |
|---|---|
| `yoinkr_catalog` | IDs, current session, capability flags and pinned REA version |
| `yoinkr_case` | Hash-checked case summary and provenance |
| `yoinkr_history` | Checked retained REA query/trace history |
| `yoinkr_examples` | Manual observations and saved JSON replay examples |
| `yoinkr_source` | Recovered source/source-map inspection via a registered export |
| `yoinkr_recipe` | Exact approved integration recipe and its pinned hash |
| `yoinkr_workspace` | Workspace status and recorded acceptance |
| `yoinkr_search` / `yoinkr_document` | Prior-work search and source integrity |
| `yoinkr_job` / `yoinkr_result` | Operation status and paged retained JSON results |
| `yoinkr_investigate` | Actual REA app analysis and tracing into a new case |
| `yoinkr_query` / `yoinkr_trace` | Targeted upstream Evidence operations |
| `yoinkr_export` | Exact original-file recovery into a private working set |
| `yoinkr_integrate` | Registered module recipe → fresh recipient working copy |
| `yoinkr_verify` | Explicit donor/recipient differential module execution |

Disabled write/execution tools are absent from discovery. The current bridge has 11 tools in read-only mode, 16 with writes, and 17 with execution. The existing CLI/workbench still own Electron playbooks, converters, native components and browser UI checks; this release does not advertise arbitrary native/desktop automation over MCP.

## Agent workflow and output handling

1. Call `yoinkr_catalog`. Use its registered IDs to read a case, approved recipe, examples or previous work.
2. Submit `yoinkr_investigate` with donor/recipient IDs, feature, seed and route. It returns a **job ID**, not a finished case. One operation runs at a time; a competing submission fails clearly instead of duplicating work.
3. Poll `yoinkr_job` for that job until `succeeded` or `failed`. Read its error if it failed. Jobs continue after cancellation of the individual MCP request; poll before retrying. Terminating the server process cannot guarantee a job finishes.
4. Read `yoinkr_result` with the job ID and `offset: 0`. Concatenate `text`, following `nextOffset` until null. Pages contain at most 12,000 UTF-16 code units and avoid splitting a surrogate pair. Complete UTF-8 bytes are bound by the returned SHA-256. Individual pages are text fragments, not complete JSON documents.
5. Use the resulting case ID for queries/traces and explicit extraction; inspect recovered source. Use its export ID and a registered recipe ID for integration. With execution deliberately enabled, verify the resulting workspace ID.

A small read result is returned directly. A larger read result is retained as a job and uses the same polling/paging protocol. A `succeeded` verification job means the comparison **ran**; inspect the result's `passed` and individual cases to decide whether behavior matched. Static analysis, manual screenshots and historical recorded acceptance remain distinct evidence levels.

Each server start creates a private `agent-<uuid>` session under `outputRoot`. Requests, complete JSON results, job records, Evidence and fresh copies remain on disk. The result cap is 32 MiB, the session cap is 128 jobs, and the underlying REA/worker limits still apply. Oversized operations fail with retained artifacts and advice to narrow the request; there is no promise of unlimited context/output. Job lookup and generated IDs are session-local; after restart, register saved case/export/workspace paths explicitly in the config. The prior-work catalog is cached for the session and refreshed after bridge-created cases/integrations/verifications; restart to discover external changes.

## Verification

```sh
npm test
YOINKR_AGENT_EVIDENCE=/tmp/yoinkr-agent-proof npm run test:agent
```

The evidence destination must be new. The standalone smoke starts official SDK clients against the actual stdio servers, runs pinned REA on owned fixture apps, recovers original code and a dependency, inspects it, applies a registered recipe to a new recipient copy and verifies three behavior cases. It checks source immutability, read-only discovery, invalid inputs, multi-page retained results, and independent upstream REA discovery. It needs no cloud model, API key, DSH instance or browser. Dependency installation needs network access unless packages are cached; ordinary local analysis and these checks do not consume model tokens.

## Portable feature delivery

Register an optional `deliveryConfig` path to expose the same two-recipient delivery workflow used by the CLI and workbench. Input paths stay in that local configuration; tool calls use registered bundle/run IDs. Checks and status are read-only, recipe export/import require write permission, and native replay/restoration require explicit execution permission. See [portable delivery setup and tool names](PORTABLE_DELIVERY.md). Windows native acceptance is still open.
