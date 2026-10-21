# Targeted Evidence queries and investigation history (v0.7)

`case-query` asks the pinned REA backend for an exact view of saved donor or recipient Evidence. It does not run a new source analysis, consult live application files or execute donor code. The browser report now includes saved query results and separately browsable follow-up trace graphs.

## Ready-made workbench

Open `reports/mqtt-workbench-v0.7.html` in your browser. It combines the original MQTT application/semantic graphs, recovered source, recorded typed queries and follow-up history. Earlier reports remain unchanged snapshots.

## Query commands

```sh
node src/cli.js case-query ./cases/my-feature --view summary
node src/cli.js case-query ./cases/my-feature --view modules --limit 20
node src/cli.js case-query ./cases/my-feature --view modules \
  --path backend/src/Model/TreeNode.ts --offset 0 --limit 3
node src/cli.js case-query ./cases/my-feature --view module --node jag_node_ACTUAL_ID
```

Replace the final placeholder with a complete canonical node ID from a returned module reference. A module path can represent multiple graph roles, so selecting by exact node ID avoids ambiguity. An exact `--path` is also supported by module view; ambiguous or missing items fail with the upstream diagnostic rather than choosing an arbitrary module.

`summary` returns REA's retained summary. `modules` uses its typed module-reference projection with identity, path, role and support basis. `module` uses its exact item projection, preserving original observations. `--side recipient` selects recipient Evidence (default donor).

`modules` supports one exact `--path` and optional `--kind javascript-asset|javascript-module|source-module`. `facts` supports repeated paths. These strings select recorded Evidence locations; they are not filesystem paths to read. No substring matching or path normalization is performed. Pagination applies only to modules/facts: offset 0–1,000,000, limit 1–100 (default 20). Follow the returned `coverage.next_offset` explicitly; the command does not silently gather later pages. Page exhaustion and source coverage remain different facts.

## Discover and read properties

```sh
node src/cli.js case-query ./cases/my-feature --view facts \
  --path backend/src/Model/TreeNode.ts --available-keys --limit 20
node src/cli.js case-query ./cases/my-feature --view facts \
  --path backend/src/Model/TreeNode.ts \
  --property path --property json_parse_status --limit 20
```

Without properties, facts return identities/provenance only. `--available-keys` lists each observation's available property names, without selecting all their values. Repeated `--property` selects exact keys. Absent keys stay absent; an observed JSON `null` stays null. Facts are not merged across observations, and static candidates do not become runtime facts. Up to 32 paths and 32 property keys are accepted, each up to 2,000 characters.

Each successful query creates `queries/UUID/` with complete `request.json`, `evidence.json`, stderr log and `QUERY.json`. Metadata records the case, selected side/view, parent Evidence ID/hash, request/output hashes, output ID, paging/source coverage and limitations. The CLI prints the metadata and normalized result as JSON. Output caps at 8 MiB; narrow the requested properties/page if needed. Failures retain `FAILED.txt` and any partial output rather than claiming success. Queries do not update the original case or its acceptance status.

## Review saved history

Generate a new report after querying or tracing:

```sh
node src/cli.js case-report ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID \
  --history-limit 8 --out ./reports/my-feature-updated.html
```

The export remains optional. The report is still self-contained and read-only; it does not start a server or launch queries/traces itself. v0.8 adds a separate optional [local workbench](LOCAL_WORKBENCH.md) for browser operation controls. Regenerate it to include later results.

The history selector shows query results and follow-ups with provenance. Module/fact results also have readable rows, preserving each observation separately, with links to canonical nodes in the matching donor or recipient graph. Cell previews cap at 1,000 characters; raw result previews and complete saved Evidence remain available. Valid follow-ups get a **Browse trace graph** button and a distinct graph entry. Donor source links apply only to donor graphs; recipient traces do not borrow similarly named donor files. Original static case acceptance stays unchanged.

History checks case identity, exact retained parent Evidence, request/output hashes and output identities. Query views and trace seeds/directions must match saved requests. Changed or malformed records appear as invalid diagnostics and are excluded from graph/query Evidence. Failure-only logs are explicitly unverified, not treated as successful observations. Hash checking detects changed records relative to their saved metadata; this local store is not a signed external attestation service.

History displays up to 8 records by default, adjustable from 0–32. It considers at most 128 regular directories per history type (deterministic name selection), then orders the scanned candidates by directory modification time. Omitted records and scan errors are reported. Symlink directories and escaping files are refused. Records excluded by these limits are not declarations of missing work. Use `--history-limit 0` for original graphs only when a large history exceeds the report's 24 MiB embedded-data limit. Individual result previews cap at 64 KiB; complete Evidence stays on disk.

No model tokens, runtime internet, extensions or changes to DSH are required. Reports can contain local paths and recorded application data, as with the existing private investigation reports.

## Verification

Unit tests cover typed selectors, invalid bounds, missing/null properties, parent/request/output binding, immutable cases, failures, escaping symlinks, tampering, report graph admission and hostile diagnostic text.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:queries
```

The acceptance test copies the real MQTT case, calls actual REA summaries/module pages/module items/property views and follow-up tracing, and checks their browser history. It deliberately changes a separate saved-result copy to verify exclusion. Test failures/changed copies are retained only in that separate evidence case, not in the normal ready-made workbench case. Override `YOINKR_CASE` and choose a new `YOINKR_QUERY_EVIDENCE` directory when needed.
