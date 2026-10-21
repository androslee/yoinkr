# Replayable module checks (v0.11)

Observable examples can now include explicit JSON test data, and **Verify** can run selected examples against a prepared workspace's recovered donor snapshot and recipient module. This reuses the existing bounded verifier. No English instructions, screenshot or recorded manual match is turned into executable code.

## Set up and use

Prepare a working copy with the existing `integrate` command. Register it explicitly when starting the browser workbench:

```sh
node src/cli.js workbench --workspace /path/to/prepared-workspace
```

The workspace's validated case is registered automatically. Repeated `--workspace` accepts up to 16 working copies; `--case` and `--app` still work. Registration reads metadata and does not execute modules. The browser can only select registered workspaces associated with its selected case; it cannot supply arbitrary executable/module/output paths.

1. Under **Examples**, expand **Optional automated module test**.
2. Enter JSON with an argument array and exactly one expected value or expected exception:

```json
{"args":["A\n","hex"],"expected":"0x41 0x0A"}
```

```json
{"args":[-1],"expectedError":{"name":"RangeError","message":"negative"}}
```

3. Save the example. Its action descriptions, screenshot and human outcome stay distinct from the replay input.
4. Under **Verify**, choose a registered workspace and explicitly check 1–16 examples. Manual-only examples are shown disabled. No test runs on page load or registration.
5. Run the selected examples. Separate bounded Node processes invoke the callable donor and recipient exports declared by the workspace's hash-checked recipe. Both results must agree and satisfy the declared expected value/error. An import failure, unsupported output, timeout or missing/changed example cannot become a passing comparison.
6. Build a **Report** to see successful and failed runs, arguments, expected outcomes, separate donor/recipient values, diagnostics and retained provenance.

Execution uses normal user permissions and runs the selected workspace's modules; the process limits are not a hostile-code sandbox. Original application installations are not launched. This checks JSON-callable module behavior, not UI actions, network effects, screenshots or whole-application equivalence.

## CLI and retention

```sh
node src/cli.js case-examples ./case --limit 32
node src/cli.js verify ./workspace --example-id SAVED_ID --example-id ANOTHER_ID
node src/cli.js verify ./workspace
```

Without `--example-id`, `verify` retains its original behavior: run the recipe's cases. Non-passing CLI verification exits nonzero. The browser distinguishes completed checks with differences from infrastructure/validation failures.

Replay data must be finite JSON, no deeper than 16 levels and no larger than 16,000 bytes, with up to 32 arguments. The browser lists the latest 32 examples; older IDs can be selected explicitly through CLI. Existing source/snapshot checks, 128 MiB worker heaps, per-module deadlines and output limits still apply. Default deadline is five seconds per module, configurable between 50 and 30,000 ms.

Each replay appends the complete verification artifact under `.modkit/runs/` and a hash-bound copy under its case's `checks/`. Reports retain the recipe hash, as-run recipient input hashes, expected values, worker outputs and selected example hashes/parent identities. The workspace records `passed-selected-examples` or failure for the latest selected check; this does not overwrite the original case's acceptance status or a human example's outcome. A selected check does not imply that all recipe cases passed.

Historical runs preserve the input data and identities used at execution time. Editing a current example does not rewrite an older successful run. New replays reject a changed selected record. Changing a retained run or its case parent makes it an explicit report warning. Reports show up to eight latest runs, bounded output previews and omitted counts; complete results remain in the retained verification files. Hashes detect changed bytes, rather than proving whole-application correctness or authenticating a person's claim.

## Real MQTT showcase

```sh
npm run build:replay-showcase -- ./builds/replay-mqtt-v0.11
node src/cli.js workbench --workspace ./builds/replay-mqtt-v0.11/workspace
```

The builder verifies the unchanged original MQTT Explorer `Base64Message.ts` against retained REA Evidence and the earlier showcase provenance. It compiles that original class with esbuild/js-base64 and a small new UTF-8 callable adapter. The recipient side uses an unchanged copy of the existing VS Code integration's `donor-core.cjs`, with a separate newly written adapter. These are explicitly scoped module slices, not new full applications.

Actual REA investigates both slices. Original source/license, compiler output, wrapper code and the prior native-core artifact are attributed in `SHOWCASE.json`, with source/artifact hashes. The normal `export-feature` / `integrate` pipeline prepares the donor snapshot and recipient working copy. Four examples cover UTF-8 text, pretty JSON, uppercase hex bytes and invalid-JSON fallback. No extensions or native application launch are required to run these module comparisons. They do not repeat or replace the prior native VS Code UI acceptance tests.

## Validation

```sh
npm test
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:replay
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:workbench
```

The browser acceptance builder invokes actual REA over real MQTT-derived slices, then tests successful comparisons, browser-authored false expectations, a deliberate private recipient regression, report retention, changed-example rejection, narrow layout, local-only requests and unchanged original case metadata. Deliberate failures stay in the test working copy. Unit tests cover explicit input contracts, declared errors, bounded execution, integrity/containment, case binding and startup registration without execution.
