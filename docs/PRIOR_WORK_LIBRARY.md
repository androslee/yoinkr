# Prior work library (v0.17)

Click **Find prior work** in the local workbench. Search earlier cases and field notes, inspect the exact retained source record, and save a reusable finding with citations. No model, embedding service, application launch or new REA analysis is involved.

The library now bridges the previous case-note CLI and the workbench: it also recognizes module/native comparison records, native workspaces, converter runs and Electron playbook metadata. A result's type and evidence level remain visible. An authored note that says “verified” stays manual; a recorded automated pass describes the historical run, not the current state of every application file.

## Browse, inspect and reuse

1. Open **Find prior work** and enter words, a source hash, feature name or tag. All literal terms must match; the search is case-insensitive. An empty query browses the catalog.
2. Filter by record type and recorded outcome. Use Previous/Next for larger result sets. Title matches rank first; time and path provide stable ordering.
3. Choose **View source record** to see its path, SHA-256, parent-record hash and retained text. Finding conclusions are displayed directly, with their original JSON available separately. Large source records have explicit search/display omissions.
4. A case or its field note can **Open case operations** or **Use as investigation starting point**. Opening rereads the full retained REA case and validates its Evidence hashes through the existing case reader. Reuse fills the feature, route, first traced source seed and registered application choices. Review and submit the new investigation yourself; reuse never launches analysis automatically. The existing limit of 16 active cases still applies; a larger searchable catalog does not silently evict active cases.
5. Use **Refresh index** after adding or changing records on disk. Coverage limits and skipped/invalid records are visible under **Index coverage and warnings**. Indexing is bounded and is not a claim to have searched the whole filesystem.

Native/converter/playbook/module metadata can be searched and inspected, but is not silently converted into a JavaScript investigation or executed. Full graph/source viewing remains in the existing case-report tools. The library indexes selected metadata and notes, not every source file, screenshot, binary or graph.

## Reusable findings

Use **Add citation** on result cards or **Cite this record** on an opened source. Select up to eight records, enter a title, conclusion/limits and optional comma-separated tags, then save. A new immutable JSON file is written to the configured finding store. Case notes, donor applications and original verification files are unchanged.

Each citation keeps the source/document IDs, displayed evidence level/outcome, exact source hash and parent hash selected at that time. The browser sends these expected hashes when saving. If a record changes, saving fails rather than silently citing different bytes. Refreshing does not replace the citation basket with newer hashes; remove and explicitly reselect the changed source after review.

Saved findings remain authored/manual records even when they cite a recorded automated pass. On opening a finding, references report whether they match the saved citation, changed since it was saved, changed after indexing, or are no longer registered. Citation paths are descriptive text; the server does not follow arbitrary paths embedded in a finding. To reopen evidence, its original source must be in the registered catalog. Relocating a case changes its source identity; the library does not guess that another copy with the same case ID is equivalent.

Findings persist across workbench restarts. Corrections create a new finding; this release does not edit/delete earlier ones or provide automatic deduplication, approval or semantic truth scoring. Record hashes detect ordinary drift, not malicious rewriting of an entire unsigned record and its citations.

## Search scope and startup

Registered cases/workspaces and the workbench case-creation directory are included automatically. Register additional local folders explicitly:

```sh
node src/cli.js workbench \
  --case ./builds/native-plot-v0.13/case-bounded \
  --knowledge-root ./builds \
  --finding-root ./findings
```

The delivered workbench on `http://127.0.0.1:4195` includes the existing cases/workspace/UI recipe, the project builds and a persistent project finding store. No home-directory scan is added. A library-only startup can use `--knowledge-root` without an active case; open a discovered case when ready to use the operation controls.

Up to 16 extra knowledge roots may be registered in the workbench; the underlying catalog accepts up to 64 roots, including automatically registered directories. Symlink directory traversal is skipped, selected file components must be ordinary, and a redirected source/store is refused on reread. Runtime, dependency, cache, private export, Evidence, input/output, profile and acceptance-test trees are pruned. Explicitly registering a pruned directory as a root is a deliberate operator choice; only the same known record formats are considered there. The configured finding directory is separately indexed and must be outside known application/case/workspace sources.

The index is built at startup and refreshed explicitly. Source text is cached for search; details, citation saves and case opening reread/hash-check the selected files. A cached search result can therefore appear after a file changes, but viewing/saving it is refused until refreshed. Concurrent filesystem edits are not an atomic snapshot; close writers or refresh/review when needed.

## Recognized records and authority

| Record | Catalog behavior |
|---|---|
| `case.json` | Feature/route/identity metadata. Full REA Evidence is checked when opening it into operations. |
| `FIELD-NOTE.md`, case `NATIVE-ACCEPTANCE.json` | Text/recorded claims, without inferring automated success from prose. |
| `.native/workspace.json` | Native component identity and preparation scope. |
| `.native/runs/*.json` | Recorded pass/failure only when library/recipe/Evidence IDs match the parent workspace and `passed` is boolean. |
| `.modkit/workspace.json`, `.modkit/runs/*/verification.json` | Module identity and comparisons bound to workspace/case/recipe IDs. |
| `CONVERSION.json` | Converter provenance; conversion alone is not recipient acceptance. |
| `.modkit-playbook/state.json` | Prepared/restored integration metadata; no new application launch or rollback. |
| Finding-store UUID JSON files | Authored conclusions with immutable selected-source citations. |

The catalog does not authenticate historical reports or re-run native/module/UI checks. Parent/hash bindings preserve which retained record was inspected; a current integrity check or new runtime verification remains an explicit action in its existing workflow.

## CLI and API

The existing `notes` CLI is unchanged. The broader catalog is available without starting a web service:

```sh
node src/cli.js library-search ./builds --query 'zlib' --kind verification --limit 10
node src/cli.js library-search ./builds --finding-root ./findings --kind finding
```

Search-only CLI usage does not create missing directories or findings. The workbench creates its finding store at startup. Stable source/document IDs are derived from canonical locations and record paths, not content or title, while citation hashes preserve the selected version.

All workbench library APIs use the existing loopback Host/Origin checks and session token:

- `GET /api/library/search`: literal query, kind/status filter, offset and limit only.
- `GET /api/library/document?id=...`: one indexed document ID; no path argument.
- `POST /api/library/refresh`: empty JSON object; refreshes the configured scope only.
- `POST /api/library/open`: one indexed case `sourceId`; validates full retained Evidence before registration.
- `POST /api/library/finding`: title/body/tags and selected citation IDs plus expected record/parent hashes; no output path option.

Refresh, case registration and finding writes share the operation lock with analysis/verification jobs. Read-only library search remains available while a job runs. Records render through text nodes and form values, not interpreted donor HTML.

## Bounds and evidence

Default discovery limits are 2,000 directories, depth 10, 20,000 observed directory entries and 512 entries per directory. At most 2,048 documents and 16 MiB of record bytes are indexed. Metadata records are capped at 1 MiB, field notes at 64 KiB and findings at 32 KiB. Only the first 256 run entries are considered, with the newest eight eligible verification records indexed per workspace; omitted coverage is reported. Finding stores consider at most 256 entries. Search uses the first 65,536 characters of each record, returns at most 50 results per page, and accepts at most 256 query characters / 12 literal terms. Detail previews display at most 32,768 characters. A finding has a 200-character title, 8,000-character body, up to eight 40-character tags and 1–8 hash-bound citations.

Browser acceptance covers actual retained Yoinkr cases/native reports, saved citations, source-change refusal before/after refresh, inert hostile note text, a validated prior-case starting point and persistence across restart. Private fixtures supply changed-source cases; their records are not new native proof. Evidence is retained under `evidence/v0.17/`.
