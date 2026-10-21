# Yoinkr: REA analysis + Universal Modder-style transfer workflow

Corrected direction, 2026-10-18. The user's goal is to investigate an existing application's feature or assets and bring them into another application, in the style of REA and Universal Modder. Yoinkr's purpose is not limited to newly authored plugins or shared UI adapters.

## Phase 2 plan

Phase 1 is delivered at 16/16 milestones. The [detailed phase 2 plan](PHASE_2_PLAN.md) adds **8 milestones, numbered 17–24**. Milestones 17–23 are delivered in v0.19–v0.25; milestone 24 is in progress in v0.26, with Windows native acceptance open. [Portable delivery setup and remaining acceptance](PORTABLE_DELIVERY.md). See the [original-app baseline guide](FEATURE_BASELINES.md) and [runnable package guide](FEATURE_PACKAGES.md), followed by the [real recipient adapter](FEATURE_HOSTS.md) and [shared acceptance](SHARED_FEATURE_VERIFICATION.md) and [second recipient](SECOND_HOST.md). Its central proof is the same recovered MQTT Explorer Raw/Diff UI package running in two real recipients through separate host adapters. It defines architecture, dependency recovery, donor/recipient acceptance, a process bridge, update repair, performance gates and fresh-checkout reproduction. The combined roadmap is 24 scoped milestones: 23 delivered and 1 planned.

## Foundation

**REA is the analysis backend.** Reuse its real artifact reconstruction, JavaScript application graph, feature/semantic tracing, native-provider handoffs and Evidence contracts. Do not replace it with package-name comparison or write another decompiler. The local pinned backend is now installed and exercised by the real integration tests.

**Universal Modder is the workflow model.** Search prior field notes, inspect donor and host, choose a transfer route, build one slice, use the original as an oracle, verify in the host and retain exact-version findings. Its game-specific loaders/converters are not general desktop-app APIs; add corresponding playbooks for Electron, .NET/JVM, Qt/GTK and browser software.

**The existing mod loader is a delivery component.** Keep its reliability fixes and use it for compatible renderer features. Other features may need a normal extension, source rebuild, main-process integration, a converted asset or a separate donor service.

References: [REA](https://github.com/morluto/rea), [REA application workflows](https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md), [Universal Modder](https://github.com/rehan-remade/universal-modder), [mashup route selection](https://github.com/rehan-remade/universal-modder/blob/main/knowledge/techniques/choosing-a-mashup-route.md).

## Transfer routes

| Route | Software equivalent | First proof |
| --- | --- | --- |
| Direct module transfer | Recover an isolated donor implementation and dependency closure, adapt imports/host calls | Run recovered code in the recipient; compare donor behavior |
| Asset/data conversion | Extract donor icons, themes, templates or structured data; convert to host format | Check source/output identity, dimensions/schema, then render or use it in the host |
| Process/service bridge | Keep donor behavior running behind an explicit local protocol | Verify inputs/outputs, ownership, failure handling and latency |
| Behavior reconstruction | Trace code/behavior, rebuild the feature in the host runtime | Differential tests against donor examples |
| Native/component integration | Use REA's provider evidence to isolate routines or managed components and identify ABI/runtime dependencies | First recover one bounded function/component; run a checked host harness |

Sharing a runtime helps select a route; it does not dictate the only route. Cross-runtime work is in scope. The amount of extraction, conversion, bridging or reconstruction depends on the specific feature.

## Working v0.3 slice

1. `investigate` runs actual REA analysis on both inputs and actual feature tracing on the donor, storing complete upstream Evidence and provenance.
2. Concrete module paths in the reachable graph form a candidate working set. Source selection, unresolved relationships, coverage and native handoffs remain visible rather than being declared solved.
3. `export-feature` recovers original traced files plus explicitly selected assets from directories or ASAR into a private case folder. It validates source hashes where REA recorded the file, preserves paths and records extraction-only assets separately.
4. A case contains a route, human-readable report, integration/acceptance status and a field-note template.
5. Tests move an original donor implementation and its imported helper into a second fixture, compare eight inputs, transfer an asset and repeat actual analysis/extraction from a real ASAR.

This slice includes actual analysis and donor-code transfer. It does not yet automatically patch a real host or turn arbitrary native code into a portable module.

## v0.4 completed integration milestone

- Recipe-driven fresh working copies, hash-checked recipient changes, recovered module mounting and immutable donor oracle snapshots.
- Bounded donor/recipient Node execution, retained per-case diffs, expected outputs/errors, timeout/import-failure handling and nonzero verification exit status.
- Actual MQTT Explorer donor core recovered through REA, compiled with documented host adaptations, and integrated directly into a copied VS Code application startup/menu/window. Native UI tests ran with extensions disabled against a private MQTT broker.
- Actual VS Code preview CSS reused in an extension-free Chromium app-mode viewer. This is a browser-host example, not Chromium C++/MIME integration.
- Reproducible builders, separate profiles, donor/recipient evidence, source hashes, attribution, launchers and screenshots. See SHOWCASE.md and INTEGRATION_RECIPES.md.

## v0.5 investigation milestone

- Offline, self-contained browser reports over hash-checked retained application and semantic graphs: searchable canonical nodes, kind filters, pagination, relationship navigation, source ranges/source-map references, original observations, coverage and unknowns.
- Actual REA follow-up tracing over donor or recipient Evidence without re-analyzing live sources; unique retained requests/results and parent/output hashes; original cases and export selections preserved.
- Bounded local field-note search with artifact identities, note lines, excerpts, truncation and scan warnings. No model tokens or service required.
- Unit checks and actual browser/REA acceptance on the real MQTT Explorer investigation. See INVESTIGATION_WORKBENCH.md.

## v0.6 recovered source milestone

- Hash-checked explicit private exports rendered as inert text, with line/column navigation, find and donor graph source-range links.
- File identity independently bound to retained REA bytes where available; extraction-only assets and binary metadata remain distinct.
- Flat v3 source maps decoded by a pinned upstream library, generated-position lookup, separately attributed embedded originals and explicit missing/unsupported states. No source URL/path fetches.
- Source-aware browser reports and `case-source` JSON excerpts; actual MQTT source/browser checks plus a clearly labelled esbuild/REA source-map fixture. See SOURCE_INSPECTOR.md.

## v0.7 typed query and history milestone

- Targeted retained-Evidence queries through upstream REA: summary, typed module references, exact module item and selected/discovered observation properties.
- Explicit paging, source coverage, missing/null distinction and immutable per-query request/output/parent provenance.
- Browser history for saved queries and follow-up traces, with separately browsable validated trace graphs and clear invalid/failed records.
- Actual MQTT REA query/paging/item/fact/trace checks plus browser acceptance. See EVIDENCE_QUERIES.md.

## v0.8 interactive workbench milestone

- Loopback browser workbench for explicitly registered existing cases and recovered exports, with dark/light display.
- Browser-launched typed queries and retained-Evidence follow-up tracing, one active operation, clear job/error status and result details.
- Fresh source/history report generation and isolated iframe previews; reports and original case artifacts remain on disk.
- Unit/API tests and actual Chromium/REA acceptance using private MQTT case/export copies. See LOCAL_WORKBENCH.md.

## v0.9 investigation/recovery wizard milestone

- Browser creation of new donor/recipient investigations with registered application selection, feature/seed/route fields and optional exact source scope.
- Actual REA analysis and tracing with generated case paths, live activity and immediate case registration.
- Explicit per-file traced working-set selection and additional donor assets, with original-byte recovery, existing source hash checks and separate extraction-only provenance.
- Dynamic case/export selectors and immediate recovered-source reports; original applications and case acceptance remain unchanged.
- Unit/API coverage and real MQTT-source REA/browser acceptance. See INVESTIGATION_WIZARD.md.

## v0.10 observable-example milestone

- Manually authored ordered action sequences, expected results and explicitly labeled manual outcomes, with optional original PNG attachments.
- Immutable per-case records bound to parent case/Evidence hashes, screenshot checksums/dimensions and explicit corruption warnings.
- Browser/CLI recording and listing; self-contained offline reports with inert text, embedded PNGs and bounded omissions.
- These records do not rewrite original acceptance or claim automatic replay. Unit/API/browser verification covers actual retained MQTT Evidence and intentionally damaged test attachments. See OBSERVABLE_EXAMPLES.md.

## v0.11 replayable module-example milestone

- Optional explicit JSON input/expected value/error on recorded examples; no inference/execution of prose or screenshots.
- Explicit startup workspace registration and browser selection; bounded donor-snapshot versus recipient-module checks through the existing verifier.
- Immutable as-run results under workspace/case, linked input/recipe/example hashes, visible differences/diagnostics, and report corruption warnings.
- Real MQTT original-class versus existing VS Code-core module showcase, with source/compiler/glue attribution and actual REA investigation/export/integration. This remains separate from whole-application/native UI acceptance.
- Unit/API/Chromium acceptance includes known passing cases, false expectations, recipient regressions and changed-example refusal. See REPLAY_CHECKS.md.

## v0.12 recipient UI replay milestone

- Explicitly registered declarative local browser recipes, typed actions/expectations and fresh contexts over hash-checked snapshots.
- Recorded action results, expected/observed values, failure/final screenshots and offline report integrity checks.
- Real extension-free document viewer showcase: 17 actions / 10 assertions over formats, inert content and theme. Donor assets and new host behavior remain separately attributed.
- Recipient browser acceptance is separate from donor UI equivalence, desktop recording and module replay. See UI_REPLAY.md.

## v0.17 prior work library

[Prior work library](PRIOR_WORK_LIBRARY.md) adds cached, bounded workbench-wide metadata/note search, typed/outcome filters, exact-source inspection and authored findings with hash-bound citations. Known native/module comparisons retain recorded pass/failure labels; prose remains manual. Changed citations are refused before/after refresh. Existing cases can be fully validated and reused as investigation starting points without automatically running analysis. Records and findings survive workbench restart.

## v0.16 bounded native component workflow

[Native components](NATIVE_COMPONENTS.md) adds one reviewed Linux x86-64 zlib profile: original binary/headers/license, actual REA ELF export and linkage Evidence, whole-library copying, fixed ctypes ABI calls, independent CRC32 comparison, immutable reports and a recipient file-inventory task. Sixteen vectors pass; bad expectations fail and modified bytes are refused before execution. Provider PLT limitations remain explicit. This does not claim arbitrary native/managed reconstruction or general ABI discovery.

## v0.15 asset/data converters

[Asset converters](ASSET_CONVERTERS.md) add two fixed, reusable formats: pinned VS Code theme includes to recipient CSS palettes, and snippets to portable JSON templates. Runs retain source bytes/licenses, exact dependency and output hashes, converter identity, explicit omissions and an offline recipient scratchpad. Browser acceptance verifies real donor colors, all 28 templates, inert hostile content and no network requests. This does not claim arbitrary binary/image conversion or full editor behavior.

## v0.14 reusable Electron playbooks

[Electron playbooks](ELECTRON_PLAYBOOKS.md) provide declarative main/preload/renderer/asset delivery with exact package version and file/payload checks, a bounded isolated runtime copy, read-only plans, drift status and guarded rollback. Native acceptance proves the added IPC round trip and relaunches a separate restored copy; originals and profiles remain intact. This is verified on an extracted Linux VS Code runtime, not every Electron package or signed application.

## v0.13 named native feature transfer

- Original MQTT Explorer numeric conversion recovered unchanged through REA and compiled into an isolated native VS Code lab.
- New bounded history/SVG presentation, Pause/Resume, per-topic reset and native scoped IPC; donor React/D3 UI remains separately classified rather than claimed as transferred.
- Complete source/dependency/installed-file provenance, a bounded recipient source slice and actual copied-application acceptance with extensions disabled and an owned broker.
- See NATIVE_PLOT_TRANSFER.md for exact scope and native evidence.

## Phase 1 delivery count

[The numbered checklist](DELIVERY_CHECKLIST.md) contains **16 milestones: 16 delivered, 0 remaining**. The five headings below summarize broad workstreams. The new numbered implementation sequence is in [Phase 2](PHASE_2_PLAN.md). The named plotting transfer is delivered. Reusable host playbooks and the first asset/data converters are delivered. A bounded native component workflow is also delivered. Workbench-wide prior-work search and cited reusable findings are also delivered. Standalone agent tools are also delivered; the numbered plan is complete. Further work below remains an explicitly scoped expansion.

## Broad workstreams

### 1. Richer investigation and prior-work search

Graph browsing, retained semantic views, follow-up tracing and local field-note search now work. Recovered export source views and flat embedded-source maps also work. Targeted typed Evidence queries and saved query/trace browsing now work. Existing-case queries, follow-ups and report/export selection now have a browser UI. The donor/recipient investigation-creation wizard and explicit feature/export selection now work. Cases now include screenshots, manually authored action sequences and explicit observable examples. Explicit JSON module examples now connect to the bounded verifier and case reports. Next, broaden the verified real donor-to-recipient slice and add recorded UI/side-effect harnesses. Use REA's exact Evidence contracts and retain its unknowns. Donor, recipient, feature/asset and proposed route selection are available in the workbench.

### 2. Expand the verified real donor-to-recipient slice

Select a named real feature and two user-owned applications. Trace the donor, classify reachable dependencies (portable, host-provided, needs conversion/bridge, unresolved), export or reconstruct it, implement the actual host integration and replay donor acceptance cases. Store which bytes were recovered versus which glue or reconstructed code was newly written. Mark static analysis, fixture acceptance and real-host acceptance as separate evidence levels.

### 3. Host and converter playbooks

Add Electron renderer/preload/main-process playbooks and reusable local asset converters. Add managed assembly/JVM/native workflows through REA's existing providers and established runtime tooling. Firefox needs its own browser/source-extension playbook rather than pretending it is Electron. Each playbook records exact versions, formats, hooks, app data boundaries and rollback.

### 4. Replayable oracle and differential verification

Run explicitly selected donor/recipient harnesses with bounded resources, compare outputs/UI state/files/effects, and retain diffs. Record failures and unknowns; a clean launch does not mean an accurate transfer. The fixture oracle and the real MQTT-derived replay showcase check declared module behavior; the real native UI checks separately verify the MQTT feature subset. Neither proves whole-application equivalence.

### 5. Standalone agent workflow

Delivered in v0.18: standard stdio MCP tools expose cases, source, REA queries, extraction, registered recipes and differential acceptance results. REA's optional MCP server retains its own catalog. Reviewable client fragments work with compatible clients without requiring DSH or changing a host configuration. Analysis and ordinary execution stay local and token-free; a model may help with planning/reconstruction. See [Agent tools](AGENT_TOOLS.md) for capability flags, retained jobs, registrations and limits.

## Kept from the previous review

The v0.2 loader fixes remain useful: current-document execution, Page-domain enablement, reload/replacement-window handling, bounded protocol requests, safe mode without debugging, conflict filtering, persisted install order, atomic state writes, entry containment and bounded ASAR reads. Historical details are in [the loader review](LOADER_V02.md).

## Windows acceptance handoff (v0.26.1)

The [Windows verification guide](WINDOWS_ACCEPTANCE.md) supplies the core portability command and names the remaining native implementation and acceptance work. Core portability results never substitute for a native Windows feature-transfer result. Milestone 24 remains in progress.
