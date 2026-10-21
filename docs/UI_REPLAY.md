# Repeatable local browser UI checks (v0.12)

**UI checks** executes an explicitly registered declarative recipe in a fresh headless Chromium context. It snapshots the local application and selected fixture bytes, performs actions, evaluates declared expectations, and retains the observations and screenshots alongside the case.

This is recipient browser UI acceptance, distinct from module comparison and manual examples. It does not infer actions from English, replay desktop/Electron events, compare entire donor/recipient UIs, or treat a screenshot as proof of equivalence.

## Use

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node src/cli.js workbench --ui-recipe /path/to/ui-recipe.json
```

The recipe's existing validated case registers automatically. Up to 16 recipe files may be supplied. Registration and page load do not execute them. Select the case, open **UI checks**, choose the registered recipe and run it. **Report** includes recorded actions, expected/observed values, failures, screenshots and recipe/input/parent hashes. Previous cases and the module **Verify** workflow remain available.

The CLI supports the same runner and exits nonzero when the check fails:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node src/cli.js ui-check ./ui-recipe.json
```

Playwright/Chromium must already be installed; this feature does not download browsers or install extensions. Browser workbench requests can only choose registered recipe IDs, not executable, module, page, output or arbitrary recipe paths. The local HTML/JavaScript being tested is executed by Chromium; this is not a hostile-code sandbox or attachment to a personal browser profile.

## Recipe

```json
{
  "schema": 1,
  "title": "Markdown heading",
  "casePath": "./case",
  "target": {"root": "./app", "entry": "viewer.html"},
  "stepTimeoutMs": 2000,
  "steps": [
    {"action":"upload", "selector":"#file", "file":"fixtures/notes.md"},
    {"action":"assert", "selector":"#document h1", "property":"text", "expected":"Local Markdown"},
    {"action":"click", "selector":"#theme"},
    {"action":"assert", "selector":"body.light", "property":"visible", "expected":true}
  ]
}
```

Paths resolve relative to the recipe. The target must be a regular local directory with an HTML entry. Uploads use exact relative fixture paths inside the recipe directory. Symlinks/special files in the target, escaping fixture paths, remote page entries and unknown recipe fields are refused. Snapshot output must stay outside the target application.

Actions: `click`, `fill` / `select` with a string `value`, `upload` with a fixture `file`, and `assert`. Assertions read `text`, `value`, `count` or `visible`, using `equals` by default; text/value may use `contains`. Expectations must match the property type. At least one assertion is required. Expectations retry within the per-step deadline; a failed assertion is retained and later steps may continue, while an action failure ends the sequence.

## Retention and limits

The case's `ui-checks/<timestamp-ID>/` contains the recipe snapshot, exact application/fixture inputs, verification JSON, binding record, final screenshot and up to two failure screenshots. Source inputs are hash-checked against registration immediately before execution. Changed recipes, inputs or case parents require registration again.

The worker has a 60-second overall deadline, with per-step deadlines of 100–5,000 ms (2,000 default). Only its owned process group is terminated on a deadline. The browser uses a fresh profile/context, blocks HTTP(S) and WebSocket attempts, disallows service workers/download acceptance, and records page errors/unexpected dialogs. Blocked requests, page errors and unexpected dialogs fail the run. This is a local static-page harness; applications requiring remote services need a separately scoped harness.

Limits: 32 actions, 300-character selectors, 4,000-character input values, 1,000-character text expectations, 32 KiB recipe JSON, 512 target directory entries, 128 snapshotted files, 4 MiB/file and 16 MiB total input. Browser state text previews cap at 4,000 characters; comparisons use the full observed text. The worker's Node heap is capped at 256 MiB; this does not impose the same memory cap on Chromium.

Reports inspect the four latest UI runs. Snapshot/recipe/screenshot changes are reported as warnings and the altered run is not presented as valid retained evidence. An aggregate 8 MiB image budget bounds embedded screenshots; originals stay on disk. Original case acceptance, manual outcomes, REA Evidence and application installations are unchanged. Hashes identify retained bytes; they are not signatures proving a person performed an action.

## Document-viewer showcase

```sh
npm run build:ui-showcase -- ./builds/document-ui-v0.12
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node src/cli.js workbench \
  --ui-recipe ./builds/document-ui-v0.12/document-ui.json
```

The builder verifies the real installed VS Code Markdown/highlight CSS against the earlier extension-free viewer's provenance, preserving original bytes. Actual REA investigates bounded donor preview-script and readable recipient viewer-source.js slices; explicit CSS recovery is retained separately, including extraction-time provenance where CSS is outside the JS graph. The compiled runtime viewer.js is separately snapshotted and tested rather than fully analyzed. It does not claim that the VS Code extension backend was transferred.

The recipient is a byte-identical copy of the existing extension-free Chromium viewer. Its recipe performs **17 actions and 10 assertions** over Markdown/table, CSV, JSON, notebook, inactive document content, light/dark display and demo rendering. This checks the real recipient interface against explicit outcomes; it does not replay VS Code's full donor UI or add built-in Chromium MIME handlers.

## Validation

`npm test` covers the grammar, source identity, containment, failed browser setup, worker deadlines and API registration. `npm run test:ui-replay` uses real retained preview assets, actual REA, real Chromium, a successful recipe, an intentionally wrong expectation, changed-recipe rejection, screenshot integrity, offline reports and narrow layouts. Deliberate failures stay in private test copies. Use `YOINKR_UI_EVIDENCE` to choose a new evidence directory.
