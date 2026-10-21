# Original application feature baselines (v0.19)

Phase 2 milestone 17 establishes a reproducible baseline for MQTT Explorer's original Raw/Diff comparison UI. The reference captures **83 declared actions, 38 assertions, seven scenarios and nine screenshots**, with real REA static and passive runtime Evidence. The same frozen recipe has been replayed in separate profiles. This is original-donor acceptance; feature packaging and recipient integration are the next milestones.

The workbench/agent setup remains standalone. No DSH instance or model API key is needed. Linux x86-64 is the supported original-app build/launch environment for this reference.

## What is captured

- Original application startup, an owned local MQTT connection and empty selection.
- JSON Raw/Diff rendering, changed line counts, previous/selected history comparisons and deselection.
- Keyboard selection and actual clipboard output on the owned display.
- Unicode, malformed JSON, empty payload behavior and a bounded large-text case (16,394 characters).
- Topic switching, renderer viewport resize, and dark theme through the actual settings drawer.
- Original console warnings, passive REA DOM/script inventories before and after actions, single-run performance counters and exact input identities.
- Static runtime-layout probes of VS Code 1.142.0 and Joplin 3.7.21, with proposed mounting surfaces and capability requirements. These probes do not establish recipient bootstrap compatibility or behavioral acceptance.

All 409 tracked donor files match revision `35f31973c456a024a37450f5961e4610dc9a9ce0`. The original full application uses its own entry point and renderer; no component-only replacement or new comparison UI is used for this proof. Build output hashes, the effective dependency locks, Electron identity, source/recipe/REA bindings and each action outcome are retained.

## Prerequisites

Install Yoinkr's declared dependencies with `npm ci`. The reference additionally needs Git, a supported Node version, a compatible Playwright module (`1.61.1` was verified), and a working Xvfb executable for the isolated Linux desktop. Set `PLAYWRIGHT_MODULE` to an installed Playwright ESM entry if it is not resolvable as `playwright`. Electron's usual Linux shared-library prerequisites must be present.

Supply a clean checkout of the pinned official MQTT Explorer revision and local recipient application directories. Joplin's extracted Linux AppImage directory is supported for the static probe. These inputs are operator-selected paths, not bundled user profiles. Downloading or installing prerequisites is separate from replay and can require network access.

## Build the original donor

From Yoinkr:

```sh
node scripts/build-mqtt-donor.mjs \
  --source /path/to/pinned/MQTT-Explorer \
  --out /path/to/new-donor-build
```

The builder copies tracked files, installs dependencies with lifecycle scripts disabled, explicitly acquires the declared Electron 39.2.7 runtime, and uses the donor's TypeScript 5.9.3 and webpack 5.98.0. The build uses original source/configuration in development mode. TypeScript is explicitly transpiled with `--noCheck`; this proves runtime behavior for the captured scenarios, not upstream type-check acceptance. Known upstream type-only-export warnings remain in the logs.

npm can rewrite sibling lockfiles during installation. The builder snapshots the effective npm locks in `MODKIT-NPM-LOCKS/`, then restores original tracked lockfile bytes before source attestation. `MODKIT-DONOR-BUILD.json` records both original-source identity and the inputs actually resolved for this build. It also records every output and the runtime executable hash.

To repeat the build with exact retained npm locks and an already acquired runtime:

```sh
node scripts/build-mqtt-donor.mjs \
  --source /path/to/pinned/MQTT-Explorer \
  --locks /path/to/previous-donor-build \
  --offline \
  --out /path/to/new-repeated-build
```

This uses `npm ci --offline`, copies the verified Electron runtime from the prior build, and performs no package acquisition. All required npm packages must already be cached. Output directories must be new and outside the source/prior-build inputs. An incomplete failed build remains available for diagnosis; use a fresh destination when retrying.

## Prepare matching REA Evidence

```sh
node scripts/prepare-mqtt-feature.mjs \
  --source /path/to/pinned/MQTT-Explorer \
  --code /path/to/VS-Code \
  --out /path/to/new-feature-case
```

Analyze the clean source checkout, rather than inventorying installed build dependencies. The donor build attestation connects these unchanged sources to the executed full app. Scope includes the selected comparison/decoder/selection sources and two recipient startup files; REA's partial coverage, trace limits and unknowns remain intact. A source filename or runtime script inventory does not prove handler causality.

The recipe is [recipes/mqtt-payload-baseline/recipe.json](../recipes/mqtt-payload-baseline/recipe.json). It contains scope, dependency hypotheses and declared actions with typed assertions. It is independent of earlier Yoinkr demonstration build directories.

## Capture against the original desktop app

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node scripts/capture-mqtt-baseline.mjs \
  --donor /path/to/original-donor-build \
  --case /path/to/feature-case \
  --code /path/to/VS-Code \
  --joplin /path/to/extracted-Joplin \
  --xvfb /path/to/Xvfb \
  --out /path/to/new-session
```

The reference runner creates a loopback broker, a publisher, a private display, and a new donor profile. It only publishes authored corpus messages. The donor source/build and Electron executable are hash-checked before launch. The actual ephemeral debugger endpoint comes from that owned profile; REA passively inspects it around the declared actions. Yoinkr performs the scripted UI actions; REA's passive captures are not labeled as doing those actions.

Ctrl+C cancels the session. Successful runs, failed assertions and cancellations retain explicit statuses and cleanup records. The app, publisher, broker and virtual display are owned and closed by the runner. Verification includes an actual cancelled original-app run, not only a mocked abort signal.

`--code` and `--joplin` add static recipient probes. They are not used to launch or patch the recipients. If omitted, the donor-only capture remains available, but it is not the complete two-recipient preparation proof.

## Inspect and report

```sh
node src/cli.js feature-status /path/to/session
node src/cli.js feature-report /path/to/session --out /path/to/new-report.html
```

The report is a standalone dark HTML document with screenshots, source identities, scope, action outcomes and dependency hypotheses. It has no script or external network dependency. Screenshot hashes are checked before embedding.

For a prepared session without execution:

```sh
node src/cli.js feature-prepare recipes/mqtt-payload-baseline/recipe.json \
  --input-root /path/to/original-donor-build \
  --case /path/to/feature-case \
  --out /path/to/new-prepared-session
```

The reference capture command prepares its own new session before launching. `feature-prepare` does not execute applications. A session is single-use for replay; prepare another to repeat it. A lock prevents duplicate replay. Interrupted processes leave visible state rather than being silently admitted as completed runs.

## Records and evidence levels

| Record | Meaning |
|---|---|
| `SESSION.json`, `recipe.json` | Frozen recipe, source/build/case bindings, recipient probes and execution status |
| `DEPENDENCIES.json` | Authored boundary/disposition hypotheses; `complete: false` |
| `action-NNN.json`, `OBSERVATIONS.json` | Typed scripted actions, expected/observed values, durations, failures and result hash |
| `before/after-runtime.json` | Original upstream passive REA Evidence |
| `before/after-RUNTIME.json` | Runtime Evidence hashes and parent bindings with explicit causality limits |
| `PERFORMANCE.json`, `BENCHMARK-ENVIRONMENT.json` | Single original development-build timing/counters and environment; no p95 or leak claim |
| `CONSOLE.json`, `application.log` | Original warnings/errors and bounded diagnostics |
| `CLEANUP.json`, `SERVICES-CLEANUP.json` | Application, broker, publisher and display cleanup results |

Large observed strings retain a preview, complete content hash and explicit omitted count. Comparisons use the full observed value before preview truncation. Assertions and capture limits fail explicitly. Source files are bounded, scenario/step counts are capped, and input recipes cannot supply arbitrary JavaScript or shell commands. Runtime execution still uses ordinary user permissions; it is not a hostile-code sandbox.

## Donor findings that affect the transfer

The baseline found that the visible container is `Sidebar/DetailsTab.tsx`; the older `ValuePanel.tsx` is useful source context but is not the demonstrated entry. The original `ValueRenderer`, `CodeDiff`, controls and helpers remain the feature implementation under investigation.

The selected payload view can remain stale when new messages arrive, while the topic tree has already changed. Selecting a different topic and returning refreshes it. Topic selection is debounced by 70 ms, so the recipe waits for actual `aria-selected` state instead of assuming clicks settle immediately. Failed attempts and bounded diagnostic screenshots retain the observed stale state. The transfer should provide explicit input updates and a regression test; any fix is recorded as an adaptation rather than claimed as unchanged donor behavior.

An empty MQTT message removes the selected topic in this pinned application. The baseline records that result and the resulting cleared panel. This is application-level behavior; it is not an oracle for directly rendering an empty string in the isolated comparison component.

The dependency plan leaves state/decoder hooks, plotting cross-links, lazy imports, styling and runtime packages as recovery work. Known original React warnings are retained. A successful baseline neither declares a complete dependency closure nor proves that this UI already runs inside a recipient.

Next is [milestone 18](PHASE_2_PLAN.md): build the runnable recovered package and make those dependencies explicit.
