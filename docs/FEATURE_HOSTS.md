# First real recipient adapter — Yoinkr

Yoinkr 0.28 rebrands the package and regenerates its digest. Earlier native/shared acceptance remains recorded under its original digest; current rename acceptance is in `evidence/v0.28/`.

Milestone 19 is delivered. Milestone 20 now validates the repaired package with the [shared acceptance suite](SHARED_FEATURE_VERIFICATION.md). The current recipe pins package 1.1.0 digest `175458a5e1277738fea13466c274b316cc7d1c97ca60bb10dafb6437a07e1187`; retained v0.21 artifacts below are historical proof of the older package. The original MQTT Explorer Raw/Diff package runs in an **application-owned tool window in a fresh actual VS Code runtime copy**. Native menu actions pass selected editor-model text, including unsaved changes, into the recovered components. The recipient integration uses no extension or extension API.

The currently verified binding is **Microsoft VS Code 1.142.0, Linux x86-64, Electron 43.7.7**. Six exact recipient fingerprints pin package/product metadata, executable, original main entry, workbench bundle and original sandbox preload. Code-OSS, other versions, Windows and macOS are not covered by this binding. Similar runtime architecture is not a compatibility guarantee.

## Try the retained lab copy

From the Yoinkr directory:

```sh
node src/cli.js host-status ./builds/vscode-raw-diff-v0.22
node src/cli.js host-launch ./builds/vscode-raw-diff-v0.22
```

You can also run `./builds/vscode-raw-diff-v0.22/launch-code.sh`. The generated launcher checks its playbook, patched files, unchanged recipient fingerprints and restored/removed assets before starting. Both launch paths use a separate lab profile and disable user extensions, telemetry, experiments and updating. Normal VS Code installations and profiles are not selected. A root-only test environment can explicitly pass `--no-sandbox`; ordinary desktop launches retain Chromium's normal sandbox defaults.

In the copied application:

1. Open a text file and select the text to compare. **Yoinkr → Capture selection as baseline** (`Ctrl+Alt+B`) captures it.
2. Edit that text without saving, or select another value in another editor. **Yoinkr → Compare selected text** (`Ctrl+Alt+D`) sends the new selection to the original Raw/Diff UI.
3. **Yoinkr → Open recovered comparison** (`Ctrl+Alt+M`) opens/focuses the tool window. Its Capture/Compare buttons can also read the last active editor's selection.
4. Use the original Raw/Diff controls, history selection and Copy payload. Clear comparison removes the saved selections.

Captures require a nonempty text selection. The adapter reads the active editor model; it does not approximate selection using visible DOM text, read a file instead of unsaved changes, or shuttle captured data through the clipboard. Copy payload uses an explicit Electron clipboard capability. Comparison state and mode are saved under the lab profile's `YoinkrComparison/session.json`, so reopening the tool or restarting the app restores them. Selected content remains local and can be cleared.

## Prepare another fresh copy

Prepare the frozen package using [FEATURE_PACKAGES.md](FEATURE_PACKAGES.md). The reference adapter accepts source-package digest:

```text
175458a5e1277738fea13466c274b316cc7d1c97ca60bb10dafb6437a07e1187
```

The complete package is copied unchanged, including originals, transformations, locks, attribution, manifest and payload. No recipient imports or recipient-specific changes enter it. Different package digests require an explicitly reviewed binding, even when their renderer bytes happen to match.

```sh
npm ci
node src/cli.js host-adapters
node src/cli.js host-plan recipes/vscode-raw-diff/adapter.json \
  --input-root /path/to/verified-vscode-runtime \
  --feature-package /path/to/frozen-source-package

node src/cli.js host-apply recipes/vscode-raw-diff/adapter.json \
  --input-root /path/to/verified-vscode-runtime \
  --feature-package /path/to/frozen-source-package --out ./new-recipient-lab

node src/cli.js host-launch ./new-recipient-lab --profile demo
node src/cli.js host-status ./new-recipient-lab
```

Planning reads and hashes inputs and checks the exact hook sites. It creates no runtime or profile and executes no application. Applying copies the selected runtime into a **new** output directory before changing any files. It uses the existing declarative Electron playbook engine for file preconditions, mode preservation, status and rollback. The engine now permits at most 256 operations and 32 MiB per file, with a 96 MiB combined change limit as of v0.23, so the original 20 MiB workbench and the complete immutable package can be tracked.

The lab uses `workspace/p/<profile>/u` for user data and `e` for its empty user-extension directory. Long paths are refused if they exceed the Linux IPC socket path limit. No normal application install, normal profile or client configuration is edited. Generated runtime copies and donor-derived packages remain private ignored outputs.

## Recipient contract and implementation

The shared operation registry in `src/host-adapters/index.js` provides catalog, plan, apply, activation, status and rollback operations. The first implementation lives in `src/host-adapters/vscode.js`; recipient runtime code is separate from the feature package.

The version-bound changes are:

- The copied package entry loads an adapter bootstrap, then the original VS Code main entry.
- An application native menu opens one owned comparison window and dispatches two capture commands.
- One uniquely identified workbench action handler handles the adapter capture command through VS Code's existing editor service. It returns the selected model range over a bounded, correlated reply channel. Empty/oversized selections produce useful errors. Diff editors use their modified editor. Other original commands retain their handler.
- A uniquely identified theme-service binding sends the initial host theme and later changes to the adapter. Its subscription belongs to the original workbench lifecycle.
- An isolated sandboxed tool renderer imports the unchanged package, supplies complete state and a restricted clipboard capability, persists preferences, and disposes its root/subscription on close.

The tool window has Node integration disabled and context isolation enabled. It denies navigation, new windows, webviews, external connections and unsolicited permissions. Main-process operations require the owned window, main frame and exact local page URL. Selection replies additionally match a generated request ID and the expected workbench sender. Operations, modes, indices and payload sizes are bounded. Combined comparison text is capped at 128 KiB; data is rejected rather than truncated. Unknown operations and foreign renderer requests fail.

These are boundaries within trusted application code, not a hostile-code sandbox. The host adapter relies on private version-specific VS Code implementation details. Exact pins and unique patch sites are deliberate: an unknown version or ambiguous hook is refused, not patched speculatively. Automatic version repair is milestone 23.

Status checks both all playbook-tracked assets and the original recipient fingerprints. Activation refuses drift. Feature mode/selection persistence is feature-scoped; it does not change editor settings. Real host theme changes feed the original component themes. File-save/publishing/deletion/plot capabilities excluded from the package remain excluded.

## Rollback

```sh
node src/cli.js host-rollback ./new-recipient-lab --dry-run
node src/cli.js host-rollback ./new-recipient-lab
node src/cli.js host-status ./new-recipient-lab
```

Rollback preflights every tracked file and backup. Modified output blocks rollback rather than discarding edits. A successful rollback restores the copied package entry and workbench bytes, removes the bootstrap, adapter and entire recovered package, and keeps separate lab-profile data and unrelated files. The restored runtime launches as ordinary VS Code without the Yoinkr menu. The original source installation was never changed.

## Native acceptance and scope

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node scripts/test-vscode-adapter.mjs \
  --adapter ./new-recipient-lab --out ./native-acceptance --xvfb /path/to/Xvfb
```

Acceptance reserves and resets the copied workspace’s `p/t` test profile. It launches real copied VS Code processes, with an owned Xvfb display, separate profiles, extension installation disabled and actual editor keyboard interaction. It captures screenshots and checks:

- Native commands, real editor-model input and unsaved changes rendered by the original comparison components.
- Frozen package identity, original mode switching, actual Electron clipboard output and real VS Code theme changes.
- Sandboxed feature rendering, bounded operations and refusal of a foreign renderer.
- Close/reopen, application restart, persisted session and explicit clearing.
- Ordinary editor saving, unchanged source fingerprints and refusal of a changed recipient before launch.
- A second fresh copy's read-only rollback preview, restoration, retained lab data and actual restored-app launch.

The retained result is `builds/vscode-raw-diff-v0.22/acceptance-final/RESULT.json`. The primary prepared copy remains applied for review; the separately verified `rollback-workspace/` is restored. `reports/vscode-raw-diff-v0.21.html` presents the native screenshots and checks. The release record is `evidence/v0.21/VERIFICATION.json`.

This completes a real recipient integration. It does not close milestone 20's shared full donor/recipient scenario suite, normalized visual comparisons, 50-cycle heap/listener measurements or relative performance gates. The same frozen package must be used again for the second recipient at milestone 21. No DSH integration, model/API key, cloud tokens, marketplace extension or GitHub publication is needed for this workflow.

## Second recipient

Milestone 21 now runs the identical frozen package in actual Joplin 3.7.21 through a separate note-selection adapter. Both recipients pass the same shared suite. See [Joplin setup, accepted safe-mode configuration and proof](SECOND_HOST.md).
