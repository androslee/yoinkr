# Yoinkr

**Your favorite features. In your favorite apps.**

Version 0.28.0 — investigate, recover, integrate, verify.

Yoinkr is a **REA-backed reverse-engineering and feature-transfer workbench for desktop software**, with a workflow inspired by Universal Modder. Start with an existing donor app and a feature or asset you want, investigate its implementation, recover the relevant files/dependencies, choose a transfer route, integrate it in a recipient, and verify it against the donor.

The existing Electron renderer loader is one way to deliver a recovered feature. It is a component of this project, rather than its entire purpose.

## Run Yoinkr

Use Node 22.19+ within the 22.x line, 24.11+ within 24.x, or 26+. From the source checkout:

```sh
git clone git@github.com:androslee/yoinkr.git
cd yoinkr
npm ci --ignore-scripts
node src/cli.js --help
node src/cli.js backend
node src/cli.js workbench --app /path/to/donor --app /path/to/recipient
```

Open the printed localhost URL. Register two actual application directories or supply an existing `--case` or `--delivery-config`. The installed npm command is `yoinkr`. [Rename, existing settings and saved-workspace compatibility](docs/RENAMING.md).

## New examples: Element message search and OBS annotations

A second donor's original search-highlighting code now runs in a native VS Code transcript-search window, with twelve scoped Linux recipient checks and guarded rollback. GIMP's original stroke-smoothing function is recovered into an experimental OBS/Qt annotation module; numerical checks and SDK compilation pass, while original GIMP/GTK and actual OBS acceptance remain pending. [Setup, launch, recovered/new-code boundaries and the Qt/GTK verification gate](docs/CREATOR_EXAMPLES.md). The existing Windows milestone remains open independently of these examples.

## New: portable Linux delivery

Export/import a recipe-only bundle, check supplied inputs, and build fresh VS Code/Joplin lab recipients through the CLI, local workbench or standalone MCP. The workflow recovers the original feature, replays the original donor and both recipients, retains a report and supports guarded rollback. It never downloads inputs or requires DSH. **Milestone 24 remains in progress: Windows native acceptance is still open.** [Setup, acquisition, permissions and reproduction](docs/PORTABLE_DELIVERY.md). A ready-to-share recipe-only bundle is in `recipes/reference-raw-diff/`.

## Remaining Windows verification

A one-command core portability runner and the exact remaining native integration checklist are available in the [Windows acceptance guide](docs/WINDOWS_ACCEPTANCE.md). Its receipts distinguish core portability from native application acceptance; Linux results cannot promote Windows support. Native Windows bindings and verification remain open.

## Framework coverage

See the [framework support matrix and application catalog](docs/FRAMEWORK_SUPPORT.md) for verified Electron integrations, the limited Chromium viewer demonstration, the native component bridge, and frameworks not yet exercised. The catalog includes five recognizable application examples for each of 16 families; examples are investigation candidates, not compatibility claims.

## New: assessed and verified version repair

A read-only assessment now identifies an unchanged host, proposes an exact structural repair for a real second VS Code version, and blocks ambiguous hooks. The repaired copy passes native, shared-donor and rollback tests while preserving the original binding. [Milestone 23 setup and evidence limits](docs/ADAPTER_REPAIR.md).

## New: a managed native process bridge

A saved-file action in actual VS Code now calls the original compiled zlib library through a bounded Python bridge. Cancellation, crash reporting, verified restart, repeated operations, source preservation and child cleanup are tested in the real recipient. [Protocol, setup and milestone 22 proof](docs/COMPONENT_BRIDGE.md).

## New: one package in two real desktop recipients

The same complete recovered Raw/Diff package now runs in actual VS Code and Joplin through separate adapters. Both pass the same 19 shared checkpoints; Joplin additionally passes 50 real lifecycle cycles, application-restart persistence and native rollback checks. No Joplin-specific edits enter the recovered feature. [Setup, scope and milestone 21 proof](docs/SECOND_HOST.md).

## New: shared original / recipient acceptance

One suite now checks the original app, recovered component and actual VS Code recipient. It caught and fixed reversed history order. Raw/normalized evidence, deliberate failure detection, startup/CPU measurements and 50 real lifecycle cycles keep behavior and performance claims reviewable. [Milestone 20 results and reproduction](docs/SHARED_FEATURE_VERIFICATION.md).

## New: original UI inside a real recipient

The frozen MQTT Explorer Raw/Diff package now runs in an application-owned VS Code tool window. Native menu commands capture actual editor selections, including unsaved edits; the adapter supplies clipboard, theme and saved-session services. No extension is installed. Fresh-copy installation, drift refusal and rollback are verified in the real app. [Recipient setup, commands and proof](docs/FEATURE_HOSTS.md).

## Runnable recovered UI packages

The original MQTT Explorer Raw/Diff controls, comparison renderer, history drawer and styling now run in a minimal host. Recover from the clean source or the pinned real webpack bundles, retain dependencies/originals/transformations, and verify an immutable package. Both routes pass browser/lifecycle checks and reproducible builds. [Package preparation, preview and proof](docs/FEATURE_PACKAGES.md).

## Original desktop feature baselines

The first phase 2 milestone captures MQTT Explorer's original Raw/Diff panel in its full desktop application: 83 declared actions, 38 assertions, nine screenshots, source/build provenance and passive REA observations. It includes static probes of the two intended recipients and a reusable reference build/capture recipe. [Original-app baseline guide](docs/FEATURE_BASELINES.md).

## New: standalone agent tools

Connect any compatible stdio MCP client to Yoinkr's registered cases, recovered source, recipes and fresh-copy transfer workflow. Long operations retain complete results on disk for paged reading. REA's full MCP catalog is available as a separate optional server. **DSH is not required** and no agent configuration is changed automatically.

```sh
npm ci
cp docs/examples/agent.json ./agent.json
node src/cli.js mcp-config --config ./agent.json --out ./mcp-client.json
```

[Standalone setup, input registrations, permissions and agent workflow](docs/AGENT_TOOLS.md). The [phase 1 delivery plan](docs/DELIVERY_CHECKLIST.md) is complete at 16/16 milestones. The detailed [phase 2 plan](docs/PHASE_2_PLAN.md) has eight milestones (17–24), with milestones 17–23 delivered and milestone 24 in progress for public reproducibility, with Windows native acceptance still open.

## New: prior work library

Click **Find prior work** in the workbench to search earlier cases, field notes, native/module comparisons, converter runs and playbooks. Save readable reusable findings with exact source citations, then reopen an earlier case or fill an investigation starting point without automatically running it.

[Search scope, evidence levels, citations and commands](docs/PRIOR_WORK_LIBRARY.md).

## Bounded native component transfers

The original compiled zlib library now runs in a separate recipient through a fixed C ABI adapter. Actual REA ELF export/linkage Evidence is retained; 16 native/reference vectors and a recipient asset checksum task are verified, with drift refusal and bounded subprocesses.

Open `builds/native-component-v0.16/native-report.html` for the readable proof. [Commands, setup, ABI and limits](docs/NATIVE_COMPONENTS.md).

## Reusable asset/data converters

Convert pinned VS Code themes into CSS palettes and snippets into portable template JSON. Runs retain exact originals, input/output provenance and a browser recipient preview. The delivered demo uses two real installed themes and 28 JavaScript templates, without extensions or donor code execution.

```sh
./builds/converters-v0.15/open-preview.sh
```

[Commands, formats, provenance and preview](docs/ASSET_CONVERTERS.md).

## Reusable Electron playbooks

Version- and hash-pinned main/preload/renderer changes now apply to fresh runtime copies, with read-only plans, drift checks and concrete rollback. The native showcase includes an actual main/preload/renderer round trip and a separately verified restored app.

```sh
./builds/playbook-v0.14/launch-code.sh
```

[Commands, manifest, demonstration and rollback](docs/ELECTRON_PLAYBOOKS.md).

## Live MQTT numeric charts in native VS Code

A fresh extension-free VS Code lab copy now plots numeric MQTT topics using recovered original MQTT Explorer conversion code, with new bounded history storage and SVG host presentation. Pause/Resume, per-topic reset and Clear history are included.

```sh
./builds/native-plot-v0.13/launch-code.sh
```

[Feature, recovered/new code, dependencies, native acceptance and rollback](docs/NATIVE_PLOT_TRANSFER.md).

## Repeatable browser UI checks

Register a local UI recipe and use **UI checks** to replay clicks, form input and file selection in a fresh browser, with explicit assertions and retained screenshots. Reports distinguish these recipient-interface checks from donor module comparisons and manual observations.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node src/cli.js workbench --ui-recipe ./document-ui.json
```

[Recipe format, real viewer showcase and limits](docs/UI_REPLAY.md). [Delivery checklist: 16 milestones, 16 delivered](docs/DELIVERY_CHECKLIST.md).

## Replay saved module examples

Add explicit JSON arguments and an expected value/error to an example, then use **Verify** to compare the recovered donor snapshot with a registered recipient working copy. Reports retain passing and failing results, output differences, diagnostics and exact input/recipe/example identities.

```sh
node src/cli.js workbench --workspace /path/to/prepared-workspace
node src/cli.js verify /path/to/prepared-workspace --example-id SAVED_ID
```

Registration does not execute code; the explicit Verify action runs the workspace's modules. [Workflow, real MQTT showcase, limits and verification](docs/REPLAY_CHECKS.md).

## Observable examples and screenshots

The **Examples** tab records ordered actions, expected results and manual observations, with optional PNG screenshots. Standalone reports show the records alongside their case/Evidence hashes and flag changed attachments. Planned examples and human-reported matches stay separate from automatic recipe verification.

[Workflow, CLI, provenance and validation](docs/OBSERVABLE_EXAMPLES.md).

## Browser investigation and recovery wizard

Choose **New investigation** in the workbench to select registered donor/recipient apps, describe a feature, run actual REA analysis and choose a proposed transfer route. The resulting case appears immediately. Select individual traced files or original assets in **Export**, then inspect their recovered source in **Report**, without restarting the server.

```sh
node src/cli.js workbench --app /path/to/donor --app /path/to/recipient
```

Analysis and export preserve original applications. [Wizard, startup paths, limits and validation](docs/INVESTIGATION_WIZARD.md).

## Interactive localhost workbench

```sh
npm run workbench
```

Open the printed local URL to choose an existing case, run typed REA queries or follow-up traces, select a recovered export, and generate/preview an updated report. Dark/light display, job status and saved results are included. It runs locally without model tokens; original application files stay unchanged.

[Startup, case registration and scope](docs/LOCAL_WORKBENCH.md).

## New: targeted Evidence queries and saved investigation history

[Open the combined MQTT workbench](reports/mqtt-workbench-v0.7.html) to review graphs, recovered code, saved query results and follow-up traces together. Typed queries ask upstream REA for retained summaries, module references/items or selected observation properties, without re-analyzing live source.

```sh
node src/cli.js case-query ./cases/my-feature --view modules --limit 20
node src/cli.js case-query ./cases/my-feature --view facts --available-keys
node src/cli.js case-report ./cases/my-feature --out ./reports/updated.html
```

Saved records retain request/output/parent hashes, paging and source coverage. Invalid or failed records are displayed separately and do not become successful query/graph Evidence. [Commands and history limits](docs/EVIDENCE_QUERIES.md).

## New: recovered source and source-map inspector

[Open the MQTT source report](reports/mqtt-sources-v0.6.html) to read original recovered code, jump from graph findings to source lines, search source text and inspect exported source maps. File hashes distinguish REA-bound bytes, extraction-only assets and map-embedded originals. Source is displayed as inert text; missing files are never fetched.

```sh
node src/cli.js case-report ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID --out ./reports/feature-source.html
node src/cli.js case-source ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID --file module.js --line 42
```

[Source inspector commands and limits](docs/SOURCE_INSPECTOR.md).

## New: offline investigation workbench

Open [the ready-made MQTT Explorer report](reports/mqtt-investigation-v0.5.html) in a browser. It includes searchable application/semantic nodes, source locations, relationship navigation, coverage and unresolved findings, with dark/light display.

```sh
node src/cli.js case-report ./cases/my-feature --out ./reports/my-feature.html
node src/cli.js trace ./builds/feature-examples-v0.4/mqtt-case \
  --seed backend/src/Model/TreeNode.ts --direction outgoing
node src/cli.js notes ./builds --query "circular import"
```

Follow-ups reuse retained REA Evidence and keep the original case immutable. Field-note search stays local. [Workbench commands, scope and limits](docs/INVESTIGATION_WORKBENCH.md).

## New: direct application integration showcase

The main showcase uses **no VS Code extension**. An isolated copy of the actual VS Code application loads recovered MQTT Explorer topic/payload functionality through a patched startup entry, native menu, BrowserWindow and scoped preload/IPC. The original installation is unchanged and the final copy uses its own portable profile. A second viewer runs directly in Chromium app mode with browser extensions disabled.

```sh
./builds/native-code-v0.4/launch-code.sh
# Optional localhost-only sample traffic, in a second terminal:
npm run demo:broker
# Connect the MQTT window to mqtt://127.0.0.1:18883

./builds/feature-examples-v0.4/chromium-documents/launch-documents.sh
```

See [SHOWCASE.md](docs/SHOWCASE.md) for exact reused code, scope, launch/rebuild steps, screenshots and limitations. The MQTT integration is a tested feature subset, not the entire original UI. The browser viewer supports Markdown, notebooks, CSV/TSV, JSON and text; built-in Chromium MIME handling and Word/Excel support remain future work. Extension-based prototypes remain optional fallbacks rather than the showcase route.

General `integrate`, `verify` and `workspace` commands also apply hash-checked recipes to fresh recipient copies and retain donor-versus-recipient comparison reports. [Recipe format and limits](docs/INTEGRATION_RECIPES.md).

## What works now

- **Actual REA integration:** pinned `rea-agents@6.7.0`, installed locally as a dependency. Calls upstream analysis and feature tracing; no homegrown decompiler or simulated REA results.
- **Donor and recipient investigation:** JavaScript directories, Electron installation directories and ASAR archives. REA reconstructs modules, imports, source-map and Electron/IPC relationships where available. Yoinkr retains upstream Evidence, graph coverage, limitations, hashes and native-analysis handoffs.
- **Feature-directed tracing:** seed a module, literal string, API, IPC channel, route, node ID or native export. Candidate donor files come from the actual reachable REA graph.
- **Code and asset recovery:** extract the traced files and explicitly selected assets into a private case folder, preserving original bytes, relative paths, source hashes and provenance. Changed analyzed files are refused. Assets absent from the graph are marked as extraction-time selections, not analysis-bound findings.
- **Transfer routes and field notes:** direct module transfer, asset conversion, process bridging or behavior reconstruction. The case stores the chosen route, evidence, unresolved work and a field note for future transfers.
- **Existing renderer delivery:** injection, reload/new-window handling, safe mode, drift checks and mod manifests remain available. [Loader details](docs/LOADER_V02.md).

The first real integration tests transfer original code, an imported helper and an asset from both a directory and a genuine ASAR. The copied implementation runs in a second fixture and matches eight donor inputs. Recipe integration and direct application delivery now extend that workflow. Arbitrary features and runtime families still need a suitable host recipe.

## Use

Node 22.19+/24.11+/26+, with a procps-compatible `ps` on Linux. From this project:

```sh
npm ci --ignore-scripts
node src/cli.js backend
node src/cli.js investigate /path/to/donor /path/to/recipient \
  --feature "Rich clipboard formatting" \
  --seed clipboard --seed-kind string \
  --route undecided --out ./cases/clipboard-investigation
```

Read the resulting `REPORT.md`, `case.json` and retained `evidence/`. For a concrete module, use `--seed renderer/clipboard.js --seed-kind module`. IPC uses `--seed-kind ipc` (mapped to REA's channel seed). Do not guess that similarly named APIs are interchangeable.

Extract the graph's candidate files, optionally adding assets:

```sh
node src/cli.js export-feature ./cases/clipboard-investigation \
  --traced --file assets/clipboard.svg
```

This creates `private/export-<id>/files/` and `EXPORT.json`. It leaves both applications untouched. Use a direct-transfer recipe to integrate and verify that working set in a fresh recipient workspace. A selected route alone remains a plan; general format conversion, bridge creation and arbitrary host integration are not automated. No extraction is implicitly launched merely by investigating an app.

Large applications can be scoped with repeated `--donor-source relative/path.js` and `--recipient-source relative/path.js`. These select exact inventoried files; REA does **not** automatically include dependencies excluded from selection. Start with an extracted feature slice when possible. Each REA call has a two-minute overall timeout, 30-second per-source analysis deadline and 64 MiB output cap; incomplete evidence stays in the failed case for diagnosis. Existing case directories are never overwritten.

Basic installed-app inventory is still available:

```sh
node src/cli.js list
node src/cli.js inspect code --json
node src/cli.js compare /path/to/app-a /path/to/app-b
```

Analysis is local and deterministic and needs no model tokens or runtime internet connection once dependencies are installed. Agent reasoning, reconstruction and complex conversions can use DSH's selected model. This integration does not run REA setup, register MCP servers, change DSH, install Ghidra, or attach to live apps.

## Verification

```sh
npm test
npm run test:research
# Optional renderer lifecycle test, with your own Playwright/Chromium:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

`test:research` invokes actual upstream REA and uses original temporary fixtures. It never executes analyzed third-party code: only the included fixture implementation is run for the donor/recipient comparison. [Verification](evidence/VERIFICATION.json).

See [the revised architecture and next milestones](docs/ROADMAP.md), [upstream provenance](docs/UPSTREAMS.md), and [the full investigation workflow](docs/TRANSFER_WORKFLOW.md). Native binary reconstruction, broader app/format converters and UI/side-effect differential verification remain to be integrated. The current deterministic runner covers JSON-callable Node modules; the direct VS Code adapter has separate native UI tests. The existing Electron loader is not a universal cross-engine injection mechanism.

## License

Yoinkr is licensed under [GNU GPLv3](LICENSE). Recovered third-party code retains its own licenses and notices; see [upstream provenance](docs/UPSTREAMS.md).
