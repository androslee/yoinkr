# Portable recipes and guided delivery — milestone 24

Yoinkr 0.28 rebrands current recipes and generated UI. Historical native acceptance below remains tied to its recorded release. See [rename and compatibility](RENAMING.md).

The delivery workflow uses a clean Yoinkr checkout and explicitly supplied local inputs. It does not require DSH, a model, tokens, a cloud account or an agent host. Acquisition may require networking; recipe export/import, feature recovery, installation and replay contain no download step.

**Native support: Linux x86-64 only. Windows native acceptance has not been run. Milestone 24's Windows acceptance requirement remains open.** JavaScript tests on Linux do not establish Windows support. macOS and other architectures are also unsupported. Do not label this milestone fully delivered until its planned platform acceptance is resolved.

## What gets shared

`delivery-export` writes a bounded recipe-only directory containing recovery/recipient JSON, the frozen suite and baseline, synthetic sample data, this guide, attribution and a digest-indexed manifest. No donor code, application binaries, user content, credentials, local paths, profiles, previous builds or executable scripts are included. SHA-256 establishes integrity, not publisher authenticity. Review the recipe and publisher before execution.

The recovered feature contains original MQTT Explorer Raw/Diff components and styles; new Yoinkr glue supplies state boundaries, initialization and host services. Two explicit source repairs are retained alongside unchanged originals: empty-input handling and the Ctrl+A selector. The report lists transformations, dependencies and license records. See `docs/FEATURE_PACKAGES.md` in the source checkout for full details.

Redistribution of a recovered package or donor/recipient application is a separate license review. The reference bundle intentionally distributes recipes only. MQTT Explorer attribution and dependency licenses are carried into locally built packages; unknown distribution rights are not treated as permission.

## Inputs to acquire before going offline

1. Install the Node version range in `package.json`; run `npm ci` in a fresh Yoinkr source checkout. Cache npm dependencies first if repeating with `npm ci --offline`. Do not copy private `builds`, `cases`, `reports`, `backups` or profiles into the checkout.
2. Obtain the original MQTT Explorer source at revision `35f31973c456a024a37450f5961e4610dc9a9ce0` from <https://github.com/thomasnordquist/MQTT-Explorer>. Use a clean checkout. Build its original Electron 39.2.7 app with `node scripts/build-mqtt-donor.mjs --source /inputs/MQTT-Explorer --out /inputs/mqtt-built`. Build/acquisition requires dependencies; the builder's `--offline --locks /inputs/prior-donor` mode requires cached dependencies and a previously acquired matching runtime. Effective locks and exact built-file hashes must match `recovery.json`; a rebuild that differs is blocked, not silently re-pinned. The recipe's source/bundle/input hashes are authoritative.
3. Obtain the official **VS Code 1.142.0 Linux x64** archive from <https://update.code.visualstudio.com/1.142.0/linux-x64/stable>, verify the publisher acquisition hash and extract to `/inputs/code`. The exact six file pins in `vscode.json` must match. This reference uses Microsoft's distribution, not a claimed Code-OSS rebuild. VS Code distribution terms still apply; it is not bundled.
4. Obtain **Joplin 3.7.21 Linux x86-64 AppImage** from <https://github.com/laurent22/joplin/releases/tag/v3.7.21>. The retained acquisition hash is `5d202dcaca31e14206826aa3f04125e7c218dbc3dc3d98479d811efbd6b856c1`; verify it before extracting. Then run `node scripts/prepare-joplin-runtime.mjs /inputs/extracted-Joplin /inputs/joplin-loose`. Preparation copies the runtime and extracts ASAR; it does not use a personal profile. The preparer verifies archive hash `767df409b18effe60421fbefcca873de237c7e813eac744ecdeebbc5e825a33a`. The six runtime pins in `joplin.json` must match.
5. Install **Playwright 1.61.1** and its Chromium browser into a separately supplied tooling directory, plus **Xvfb** and Electron's Linux shared-library dependencies. Supply the actual absolute paths in the local config. Replay starts an owned Xvfb display; it does not reuse your desktop or launch another AI service. Normal-user application launches retain the existing adapter's sandbox behavior.

These are operator-supplied inputs, not defaults to anyone's installation. A source revision alone does not freeze npm resolution; the build guide and effective-lock provenance matter. If upstream artifacts disappear or hashes differ, acquisition is blocked until a new version is investigated and verified. No automatic download, installation or re-pinning occurs.

## Export, move and import the reference recipes

From the clean checkout, with new destination directories and existing parent directories:

```sh
node src/cli.js delivery-export /tmp/yoinkr-reference
node src/cli.js delivery-inspect /tmp/yoinkr-reference
node src/cli.js delivery-import /tmp/yoinkr-reference --out /tmp/yoinkr-imported
```

Copy `/tmp/yoinkr-reference` to another machine using your normal file transfer. Import checks every declared byte, refuses extra files/symlinks/traversal and retains the same content digest. It never executes recipe-provided commands. Use a new destination when repeating.

Create `delivery.local.json` outside the shared bundle:

```json
{
  "schema": 1,
  "bundle": "/tmp/yoinkr-imported",
  "donor": "/inputs/mqtt-built",
  "source": "/inputs/MQTT-Explorer",
  "runtimes": {"vscode": "/inputs/code", "joplin": "/inputs/joplin-loose"},
  "outputRoot": "/outputs/yoinkr-delivery",
  "xvfb": "/tools/bin/Xvfb",
  "playwrightModule": "/tools/node_modules/playwright/index.mjs"
}
```

Relative paths resolve against this local config. Outputs must be outside inputs. Config files and run outputs are private machine-specific records; do not publish them as portable recipes.

## Guided workbench and equivalent CLI

```sh
node src/cli.js delivery-check delivery.local.json
node src/cli.js delivery-run delivery.local.json
node src/cli.js delivery-status /outputs/yoinkr-delivery/delivery-UUID
node src/cli.js workbench --delivery-config delivery.local.json --port 4195
```

Open the displayed localhost URL and use **Delivery**. Check prerequisites, then **Build and verify both recipients**. Stage progress and errors remain in the activity panel and the run's `STATUS.json`; `REPORT.html` is a standalone dark report. Only the explicitly registered local configuration is available from the browser. No arbitrary path or shell command is accepted through its delivery endpoints.

The run snapshots the validated bundle; recovers the original feature from supplied clean source and built dependencies; checks the package against each adapter's frozen digest; creates new VS Code and Joplin lab copies; then replays the same shared suite in the **fresh original donor, minimal host and both real recipients**. Each recipient is compared with that fresh donor run. A successful build or clean adapter alone is not a runtime pass. Existing donor differences remain explicitly reported. Joplin is accepted only in built-in safe mode with native textarea selection; rich-editor capture is not verified.

Run outputs retain package originals, transformations, licenses, adapter playbooks, current integrity and fresh acceptance observations/screenshots. The digest-indexed recipe bundle is portable; the generated application workspaces and reports can contain absolute paths and test profiles and are private. A failed run preserves partial output and the failed stage; start another run after fixing inputs. Neither workbench nor MCP should automatically retry a failed execution.

To use a successful lab copy, run `node src/cli.js host-launch /outputs/yoinkr-delivery/delivery-UUID/vscode` (or `joplin`). To restore **both lab copies**, close their manually opened app windows and run:

```sh
node src/cli.js delivery-rollback /outputs/yoinkr-delivery/delivery-UUID
```

Rollback preflights both workspaces before modifying either, refuses drift, restores original files and removes added adapter assets. Original installations are untouched. Lab profiles are retained. Status distinguishes recorded acceptance from current integrity and records restoration separately.

## Standalone MCP

Add `"deliveryConfig": "/path/to/delivery.local.json"` to the existing agent configuration. `outputRoot` remains the independent agent result store. With no write/execute permissions, `yoinkr_delivery_check` and `yoinkr_delivery_status` inspect registered inputs/current run status. Recipe export/import require `allowWrites: true`; `yoinkr_delivery_run` and `yoinkr_delivery_rollback` also require `allowExecution: true`. Long operations use existing jobs and paged on-disk results. Tool arguments select registered IDs, never arbitrary filesystem paths. The browser and CLI call the same delivery implementation.

## Reproduction and platform acceptance

Start with an empty Yoinkr build tree. Run `npm ci` (or a cached `npm ci --offline`), supply the documented inputs, and execute the export/import round trip plus `delivery-check`, `delivery-run`, `delivery-status` and `delivery-rollback`. Repeat from another clean tree with cached dependencies and network access disabled for replay. Native acceptance must show all four runs and donor comparisons passing, both recipients clean before rollback and restored afterward, and no remaining owned application/browser/display processes.

A Linux replay is not proof of Windows compatibility. The release evidence must state exactly how networking was blocked; absence of download calls alone is not proof of network isolation. Public GitHub publication is a separate user action; this workflow never publishes or changes an agent's configuration automatically.

## Recorded Linux verification in v0.26

The clean-source Linux lane installed dependencies with `npm ci --offline --ignore-scripts`, then replayed with only loopback enabled in `unshare -Urn`; an external connection failed with no external route. All 76 shared checkpoints passed across the fresh original donor, minimal host, VS Code and Joplin, and all three donor comparisons passed. The browser journey passed 15 checks including drift refusal and both-copy restoration; the official MCP stdio client passed six delivery checks; all 248 unit/regression tests passed. Prerequisite checks read tooling metadata without importing operator-selected JavaScript. A browser-startup failure regression verifies preview-server cleanup.

This was a fresh source tree with its own dependency installation and no previous Yoinkr build directories. Matching cached original donor/source/runtime inputs were supplied explicitly; this does not claim a new network acquisition, a GitHub clone/publication, Windows acceptance or a second physical machine. Retained release scope and hashes: `evidence/v0.26/VERIFICATION.json`; readable local result: `reports/portable-delivery-v0.26.html`. Private build/evidence directories remain excluded from the public npm package.
