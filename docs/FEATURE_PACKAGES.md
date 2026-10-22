# Recovered renderer packages — v0.20

Milestone 18 is delivered. The original MQTT Explorer Raw/Diff interface now runs outside its application in a minimal browser host. Both the clean-source route and a supported recovery route from its actual webpack build pass the component checks. This is the package preparation step; [milestone 19](FEATURE_HOSTS.md) now integrates it into a fresh real recipient.

## What is original and what changed

The reference recipe pins MQTT Explorer revision `35f31973c456a024a37450f5961e4610dc9a9ce0`. Fourteen exact source files are preserved in `originals/`: ValueRenderer, ActionButtons, HistoryDrawer, CodeDiff, its gutters/counts/styles/helpers, code colors, keyboard selection, themes, Base64Message, Decoder and JsonAstParser. Original React/MUI controls, JSON formatting, Prism highlighting and diff logic render the comparison. This is recovered interface code, rather than a newly written imitation.

New, separately recorded adapters provide:

- Immutable topic/message inputs, replacing the application's mutable tree and subscription lifecycle. Updates therefore refresh without the donor's stale-panel defect.
- A small Redux setting store for the unchanged Raw/Diff buttons, and a plain-message decoder boundary. Sparkplug/custom decoders are excluded.
- History selection state supplied to the original HistoryDrawer, a clipboard capability and minimal layout. The whole DetailsTab, publishing, topic deletion and save-file controls are excluded.
- Visible disabled markers for numeric chart links. They cannot silently activate an absent chart service.
- Independent React roots and per-instance JSS class names, retaining the donor's own locked framework versions.

Two compatibility patches are recorded with exact before/result hashes, match counts and reasons. DiffCount reductions start at zero for empty input. The CodeDiff Ctrl+A selector targets the code element after the donor changed its gutter wrapper. Unchanged originals remain available beside `transformed/` copies. Component empty strings render directly; they do not trigger the original MQTT application's topic-removal behavior.

## Input preparation and recovery

Install Yoinkr with `npm ci`, including development dependencies for the pinned esbuild compiler. Supply the source checkout and original donor build described in [FEATURE_BASELINES.md](FEATURE_BASELINES.md); the effective npm locks under `MODKIT-NPM-LOCKS/` are required. Acquisition/building dependencies is separate from local recovery. These commands do not download dependencies or require model tokens.

Replace the example input paths with your own:

```sh
node src/cli.js feature-package recipes/mqtt-raw-diff/recipe.json \
  --input-root /path/to/original-donor-build \
  --source /path/to/clean-donor-checkout --route source --out ./source-package

node scripts/general/analyze-feature-bundles.mjs \
  --donor /path/to/original-donor-build --out ./bundle-analysis

node src/cli.js feature-package recipes/mqtt-raw-diff/recipe.json \
  --input-root /path/to/original-donor-build --route bundle \
  --evidence ./bundle-analysis/REA.json --out ./bundle-package

node src/cli.js feature-package-status ./source-package
node src/cli.js feature-package-preview ./source-package
```

Preview prints a loopback URL. Open it in a browser; Ctrl+C closes the owned server. It serves verified payload bytes held in memory, rather than donor installation files. Copy uses the browser's real clipboard capability, and failures appear in the feature. A successful preview is not proof of recipient integration.

Output directories must be new and outside donor/source inputs. The recipe checks the source hashes, both actual bundle hashes, effective lock hashes and original license. Missing cached dependencies are compilation errors; imports are explicitly resolved from the donor dependency cache, with outside-cache resolution refused. There is no fallback to a newly authored comparison implementation.

## Supported bundle recovery

The explicitly supported layout is `webpack5-eval-source-map-single-source-v1`, as found in this pinned donor's `app/build/app.bundle.js` and `src_components_Layout_ContentView_tsx.js` output. Source recovery uses the exact single-source inline `sourcesContent`, validated against module identity, source maps and recipe hashes, then recompiles the declared closure. It does **not** execute recovered webpack factories.

Retained records include original compiled factory bodies, loader parameter bindings, `r`/`d`/`n` helper assumptions, static module references, byte ranges, source maps, chunk hashes and matching REA module/node/observation identities. REA identifies the modules from the same original bundle bytes; source-map-assisted recovery rebuilds their scoped sources. External package imports resolve into the pinned cached lock, and application imports must be recovered files or declared adapter boundaries. The final compiler input closure records individual file hashes, package versions and npm integrities, including styles and bundled icons.

Both named output files are supplied because the feature originally resides in a lazily loaded chunk. The recovered renderer is a single static payload and needs no webpack runtime. A selected module with its own dynamic imports, unsupported helper, unresolved module, missing original source, duplicate/ambiguous identity, missing chunk or unknown wrapper is refused. Production/minified bundles without those maps, arbitrary bundlers, workers, native bindings and arbitrary lazy loading are unsupported. Static analysis is partial and cannot establish runtime execution; the original REA limitations stay in provenance.

## Package contract and integrity

`FEATURE.json` is a strict schema-1 manifest. Its canonical SHA-256 covers semantic metadata and every package file. It excludes output-directory names and timestamps. An explicit module context and compiler minification remove parent-project and debug-path differences; repeat builds are checked under both the project and an unrelated temporary parent directory. `originals/`, `transformed/`, adapters, input locks, `DEPENDENCIES.json`, `TRANSFORMS.json`, `PROVENANCE.json`, attribution and built payload are hash checked. Untracked files, symlinks escaping the package, missing assets and changed source/lock/transformation records fail verification.

Retain a trusted digest separately and supply `--digest <sha256>` when checking or previewing a previously accepted package. Self-consistency alone does not authenticate a package against someone who can rewrite both its contents and manifest. Review and explicitly execute only trusted recovered code; the renderer and local compiler are not hostile-code sandboxes.

The renderer exports:

```js
const instance = mount(emptyElement, {
  topic: 'lab/status', messages: ['old value', 'new value'],
  mode: 'diff', theme: 'dark', selected: null,
}, { clipboard: { writeText: text => hostClipboard.writeText(text) } });
instance.update(nextCompleteState);
const state = instance.snapshot();
instance.dispose();
```

`update` replaces complete state. Mode is `raw`/`diff`; theme is `light`/`dark`. History selection is an optional zero-based index, or null for previous-message comparison. Inputs contain 1–64 string messages, at most 128 KiB combined UTF-8 data, and a topic up to 1,024 characters. Invalid input leaves prior state intact; data is not truncated. Dispose is idempotent; update/snapshot after disposal fail. Clipboard failures are shown. Mount the feature in an owned document/isolated renderer; do not share the host's React or inject donor styling into unrelated application UI. No VS Code/Joplin imports enter this package.

## Reproduction and retained proof

```sh
node scripts/general/verify-feature-recovery.mjs \
  --source /path/to/clean-donor-checkout \
  --donor /path/to/original-donor-build \
  --evidence ./bundle-analysis/REA.json --out ./recovery-proof

PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node scripts/general/test-feature-package.mjs \
  --package ./recovery-proof/source-1 --out ./source-browser-proof
# Repeat for bundle-1 with a new output directory.
npm test
```

The local v0.20 proof is in `builds/mqtt-raw-diff-v0.20/REPRODUCIBILITY.json`, with browser results/screenshots in `source-browser/` and `bundle-browser/`. REA input snapshots and complete Evidence are in `builds/mqtt-raw-diff-analysis-v0.20/`. The delivery record is `evidence/v0.20/VERIFICATION.json`. Open `reports/mqtt-raw-diff-v0.20.html` for the self-contained dark report with six screenshots.

Acceptance passed:

- **197 unit tests**, including strict recipe validation, inert extraction, unsupported wrappers/loaders/dynamic references, duplicate identities, tampering, missing assets and path escape checks.
- Two builds of each route have identical package digests. The source and bundle routes produce byte-identical renderer payloads. Their package digests differ because their recovery provenance differs.
- **20 browser checks per route**, covering original controls/rendering/history, actual clipboard output, state updates, JSON/text/Unicode/malformed/empty data, Ctrl+A, resizing, themes, limits, independent instances and cleanup. Each route completes 50 mount/update/dispose cycles without retained feature DOM or accumulating JSS style elements. Both have zero page runtime errors.
- Ten real-input refusal checks: changed source/lock, missing dependencies/Evidence/chunk, unsupported layout, modified originals/lock/transform record and missing runtime asset.

Timing samples cover approximately 1, 10 and 100 KiB combined comparisons. They are local component measurements, not donor-versus-recipient performance claims. Heap/listener instrumentation and full shared-scenario equivalence belong to milestone 20. Native acceptance is currently Linux x86-64; browser portability does not establish Windows/macOS desktop support.

## Sharing

Public code consists of Yoinkr's tooling, adapters, tests and hash-pinned recipe. Generated donor packages, build copies, reports and Evidence remain ignored private outputs. MQTT Explorer's input `LICENSE.md` names Creative Commons Attribution-NoDerivatives 4.0 and contains its own distribution/attribution conditions; its exact bytes and dependency notices are retained. Do not treat Yoinkr's MIT license as permission to redistribute generated donor-derived packages. Distribution status is explicitly marked for review. No GitHub publication or application installation change happens during package preparation.

Milestone 19 now supplies the [first real VS Code recipient adapter](FEATURE_HOSTS.md) using this frozen package. Milestone 21 must then reuse the same accepted package digest in Joplin.

## Package 1.1.0 / Yoinkr v0.22

Shared acceptance detected that the history adapter displayed oldest-first rather than the original newest-first order. Version 1.1.0 fixes presentation and click-to-chronological-index mapping while retaining unchanged donor sources. Both source and bundle routes reproduce twice with byte-identical renderer payloads; both pass their 20 component checks. Legacy 1.0.0 package proofs remain verifiable and retained. The current recipient recipe pins the repaired source digest. See [shared acceptance](SHARED_FEATURE_VERIFICATION.md) for new digests and measured outcomes; preceding v0.20 examples and counts are historical.
