# Observable examples and screenshot records (v0.10)

A feature transfer needs concrete behavior to compare: actions, expected results, and what actually happened. The workbench's **Examples** tab records these without treating a static graph, copied file, screenshot or manual assertion as automated equivalence.

## Browser workflow

1. Select a registered investigation and open **Examples**.
2. Give the example a title, choose the application observed, and list ordered actions (one per line).
3. Describe the expected result. Leave the outcome **Planned / not run**, or explicitly record a manual match, difference or blockage with an observation.
4. Optionally attach a static PNG screenshot. Only a file you select is uploaded; Yoinkr does not attach to a desktop application or record it automatically.
5. Save the example. A new immutable directory appears under the case's `examples/`. Re-saving creates another record rather than rewriting earlier observations.
6. Build a **Report** to review examples, screenshots, parent identities and integrity warnings. Reports remain self-contained offline.

Ordered steps are manually authored action sequences, not captured/replayable input events. `observed-match` means a person reported a match; it is never promoted to the case's acceptance status. Explicit JSON module tests can be attached and replayed through Verify; see [replay checks](REPLAY_CHECKS.md). Prose and screenshots remain manual evidence. The original `case.json`, REA Evidence, route and application files stay unchanged.

## CLI

An example JSON file has this shape:

```json
{
  "title": "Formatted JSON topic payload",
  "side": "donor",
  "steps": ["Select a JSON message", "Choose formatted view"],
  "expected": "An indented object, while the original bytes remain available",
  "outcome": "planned",
  "observation": ""
}
```

```sh
node src/cli.js case-example ./cases/topic-view --example ./json-view.json
node src/cli.js case-example ./cases/topic-view --example ./observed.json --screenshot ./capture.png
node src/cli.js case-examples ./cases/topic-view --limit 16
node src/cli.js case-report ./cases/topic-view --out ./reports/topic-review.html
```

Sides: `donor`, `recipient`, `both`. Outcomes: `planned`, `observed-match`, `observed-difference`, `blocked`. All observed outcomes require nonempty observation text. These are user-authored records, not results from the deterministic verifier. CLI listing excludes embedded image data.

## Identity, limits and rendering

Each directory retains `example.json`, `record.json` and, if supplied, `screenshot.png`. The record binds the example bytes to the case JSON and original donor/recipient/trace Evidence hashes. Screenshot metadata includes its hash, byte count and dimensions. Reading/reporting verifies parent Evidence, metadata and screenshot bytes; changed records are omitted and reported as warnings. Hashes detect changed retained bytes; they are not signatures proving who performed an action or whether an observation is true.

Limits: 64 example directories per case; title 200 characters; 1–32 steps of up to 500 characters; expected/observation text 4,000 characters each; text JSON 32 KiB. PNG files are limited to 4 MiB, 8,192 pixels per dimension and 16 million pixels total. PNG structure and chunk checksums are checked; SVG, other formats, animated PNG and arbitrary file paths are not accepted as screenshots.

Reports inspect up to 16 example directories in descending timestamp-prefixed filename order (newest first), explicitly reporting omitted counts and invalid records. An 8 MiB aggregate screenshot budget limits embedded image data; omitted image bytes remain in the case and their identity is shown. Existing report size limits still apply. All strings render as inert text; report images are embedded PNG data, without external URL loading. There is no screenshot/file-serving endpoint.

The ordinary API retains its 32 KiB body cap. The same authenticated session, Host/Origin checks and single-operation gate protect the dedicated `/api/example` endpoint, which accepts up to 6 MiB of JSON for a base64 screenshot. It only accepts the example action, with registered case IDs and typed fields.

## Verification

```sh
npm test
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:examples
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:workbench
```

The browser acceptance test uses a private copy of real MQTT REA Evidence. Its attachment deliberately depicts the test workbench, not the donor's behavior. It tests plans, manual differences, screenshot upload, inert rendering, offline display, deliberate screenshot corruption, narrow layout and unchanged parent metadata. Corruption remains confined to the test case. This verifies evidence-recording/report behavior, not a new donor/recipient transplant.

`YOINKR_CASE` selects an existing case directory and `YOINKR_EXAMPLES_EVIDENCE` selects a new output directory.
