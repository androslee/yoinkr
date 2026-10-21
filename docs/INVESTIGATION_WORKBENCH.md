# Investigation workbench (v0.5)

Browse retained REA Evidence without rerunning source analysis or requiring an AI service. The workbench is a single HTML file you can open locally in a browser. It starts in dark mode and makes no page network requests.

## Open the ready-made example

Open `reports/mqtt-investigation-v0.5.html` from this project in your browser. It shows the real MQTT Explorer investigation used by the v0.4 transfer. Original case acceptance remains `not-run`: the subsequent native UI and broker checks live separately under `evidence/`, rather than rewriting historical static Evidence to imply broader acceptance.

You can switch donor, recipient and initial trace graphs, including semantic graphs where REA retained them. Search node names, source paths, kinds and canonical IDs; filter kinds and page results. Selecting a node shows its retained record and navigable incoming/outgoing relationships. Source ranges and source-map references appear when recorded. Missing sources are not automatically downloaded or recovered.

Coverage shows upstream limitations and semantic unknowns, independently of report display limits. A search without results means no retained displayed match, not proof that a feature is absent. Static reachability and semantic candidates do not prove runtime behavior or portability.

For actual recovered source and embedded source-map originals, v0.6 adds an optional `--export` source inspector. See [SOURCE_INSPECTOR.md](SOURCE_INSPECTOR.md). Graph-only reports keep the original read-only behavior.

## Generate another report

```sh
node src/cli.js case-report ./cases/my-feature --out ./reports/my-feature.html
```

The command verifies the stored donor, recipient and initial trace hashes and their Evidence identities. It does not need the original applications to remain available. Reports include recorded local paths, source locations, hashes and observations: treat them like the corresponding private investigation when sharing files.

Output is a new file; existing outputs and original applications are preserved. Reports cannot write into retained case records. Each graph displays at most 4,000 nodes, 16,000 relationships and 1,000 unknown records. Individual detail previews cap at 64 KiB; display omissions are explicitly reported, and full original Evidence remains in the case. Embedded report data caps at 24 MiB. Large investigations should use a smaller source selection or a targeted trace.

Reports contain no active donor code. A restrictive Content Security Policy permits only the bundled report's own script/style hashes, and untrusted case metadata is rendered as text. Opening the report does not execute an application, install an extension or attach to a running application.

## Trace the next question

```sh
node src/cli.js trace ./builds/feature-examples-v0.4/mqtt-case \
  --seed backend/src/Model/TreeNode.ts --seed-kind module \
  --side donor --direction outgoing
```

`trace` sends the complete, hash-checked retained parent Evidence to the pinned REA backend. It does **not** re-analyze live applications. `--side` accepts donor or recipient; direction accepts incoming, outgoing or both. Seed kinds are module, string, api, ipc, route, node-id and native-export. IPC maps to REA's channel seed. Strings use containment; other seeds use exact matching and all are case-sensitive.

Each run creates a unique `followups/ID/` directory with the exact `request.json`, complete `evidence.json`, stderr log and `FOLLOWUP.json` recording parent/output/request hashes, matching seed count, coverage and limitations. No matches produces `no-matching-seed`, not a successful transfer. Failed runs retain `FAILED.txt` and any partial output. The original case, trace, selected exports and acceptance status stay unchanged. Follow-ups do not silently expand the files chosen for export; review their findings before making a new integration.

v0.7 reports also include hash-checked saved follow-up graphs and targeted query history. Regenerate a report after new work; earlier reports remain snapshots. See [EVIDENCE_QUERIES.md](EVIDENCE_QUERIES.md). The browser remains a read-only report, not yet an interactive transfer wizard or live graph editor.

## Find earlier fixes

```sh
node src/cli.js notes ./builds --query "circular import" --limit 20
```

The scanner looks for adjacent `case.json` and `FIELD-NOTE.md` files under the explicitly selected root. Search terms match case-insensitively and must all appear in the combined feature, route, artifact hashes or note. Results identify the case, donor/recipient artifact identities, matching note line and an excerpt. User-written field notes are searchable guidance, not verified behavioral Evidence.

No model, external search service or persistent index is used. The scan skips symlink directories, dependencies, private exports, Evidence, backups and browser/profile directories. It reads at most 2,000 directories to a depth of 10; notes cap at 1 MiB and metadata at 4 MiB. `truncated` and warnings make bounds/unreadable cases visible. The limit is 1–100 matches (default 20); reaching the limit conservatively marks the result truncated.

## Verification

`npm test` includes tampered/absent Evidence, identity mismatch, escaping symlinks, immutable follow-ups, failure retention, no-match results, note search boundaries and report escaping/output guards.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:investigation
```

The opt-in browser test uses the installed real MQTT Explorer case (override `YOINKR_CASE`), an actual REA follow-up and a temporary headless browser profile. It checks search, source ranges, relationship navigation, semantic pagination, unknowns, theme controls, hostile metadata, no page HTTP requests and screenshots. Evidence is written into a new investigation directory under `evidence/` (override `YOINKR_INVESTIGATION_EVIDENCE` with a fresh directory).
