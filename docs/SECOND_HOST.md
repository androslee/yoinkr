# Second real recipient — Yoinkr v0.23

Naming update: Yoinkr 0.28 uses rebranded current recipes. The milestone results and digests below describe the earlier recorded builds; those records are retained unchanged. See [rename and compatibility](RENAMING.md).

Milestone 21 is delivered. The recovered MQTT Explorer Raw/Diff feature now runs in **two actual desktop recipients through separate adapters**: Microsoft VS Code 1.142.0 / Electron 43.7.7 and Joplin 3.7.21 / Electron 42.3.0, both Linux x86-64. Neither proof uses an extension/plugin integration API.

Both hosts contain the identical complete package, not just similar renderer output:

`ae4147da86e3bce2e2e5744d6b0bb71edf6998f250f0949719cc99e287f27f48`

The feature remains package 1.1.0 from milestone 20. There are no Joplin imports, conditionals, styles or edits inside it. Both recipients were replayed against the same frozen shared-suite version and original donor evidence. A new recipient did not require a feature rewrite.

## Try the retained copy

From Yoinkr:

```sh
node src/cli.js host-status builds/joplin-raw-diff-v0.23
node src/cli.js host-launch builds/joplin-raw-diff-v0.23
```

Alternatively run `builds/joplin-raw-diff-v0.23/launch-joplin.sh`. The generated launcher validates the playbook, recipient pins, adapter assets and complete feature payload before opening a separate lab profile. It never selects an existing Joplin profile. Only root test environments need an explicit `--no-sandbox`; ordinary launches retain Electron sandbox defaults.

Create or open a note, select part of its body, then use **Yoinkr → Capture selection as baseline** (`Ctrl+Alt+B`). Edit the note, select the changed body, and choose **Compare selected text** (`Ctrl+Alt+D`). **Open recovered comparison** (`Ctrl+Alt+M`) opens/focuses the tool. The original Raw/Diff controls, history, hunk counts and copy action remain interactive. Capture/Compare buttons inside the tool use the last note window. The lab profile retains comparison snapshots and preferences across restarts. Theme menu entries change Joplin's actual theme setting and update the comparison panel.

The accepted configuration is Joplin's built-in **safe mode**, which disables plugins and replaces its rich editor with a native textarea. Joplin's `selectedText` editor command is unavailable there, so the adapter reads the focused textarea's actual selection. This is an explicit host capability binding, not generated input or a clipboard approximation. Normal-editor command capture is implemented but is **not** a verified configuration in this release. Rich-text editing, rendering, arbitrary plugins, other versions/platforms and whole-application equivalence are outside this proof. Safe mode visibly disables note rendering; do not mistake that for a recovered-feature limitation.

## Prepare another copy

Run `npm ci` from a source checkout to install build/test dependencies. Obtain and extract the pinned Joplin 3.7.21 Linux AppImage. The original acquisition record names `Joplin-3.7.21.AppImage`, release SHA-256 `5d202dcaca31e14206826aa3f04125e7c218dbc3dc3d98479d811efbd6b856c1`. The preparer independently requires archive SHA-256 `767df409b18effe60421fbefcca873de237c7e813eac744ecdeebbc5e825a33a` before extracting anything. Other archive bytes require a new investigation/binding.

```sh
npm run prepare:joplin-runtime -- /path/to/extracted-AppImage /path/to/new-loose-runtime

npm run build:joplin-adapter -- \
  --runtime /path/to/new-loose-runtime \
  --feature /path/to/verified-mqtt-package \
  --recipe recipes/joplin-raw-diff/adapter.json \
  --out /path/to/new-joplin-adapter

node src/cli.js host-status /path/to/new-joplin-adapter
node src/cli.js host-launch /path/to/new-joplin-adapter
```

The preparer copies the extracted runtime, preserves relative symlinks/native companion assets, extracts `app.asar` unchanged into `resources/app`, and retains the original archive under another name. Preparation does not execute application code. The six exact recipient fingerprints cover package metadata, both main/renderer bundles, index, bridge and executable. Applying the adapter copies this selected input again before patching. Original application directories are never modified. A hash drift or missing/ambiguous hook refuses installation. New output directories are required.

The existing generic CLI also supports `host-plan` and `host-apply` with this recipe, `--input-root`, `--feature-package` and, for apply, `--out`. Each recipient has its own recipe, driver, selectors, version probe, launcher and rollback binding.

## Host-specific integration

Joplin has a different startup path and internal command system from VS Code. Its adapter patches two pinned locations:

- An existing renderer startup task installs a small note-selection/settings listener using the original command service/store. Safe-mode selection uses the actual focused textarea. Host IPC replies include the selected note's identifier and theme.
- Its cross-instance IPC code ignores `--profile` when choosing the secret-key location. The copied main bundle uses the selected lab profile for that service, avoiding the normal account profile.

A CommonJS bootstrap loads the adapter then Joplin's original main bundle. It removes only unsupported inspector/shared-memory/V8 instrumentation flags after Electron consumes them, so Joplin's strict argument parser can start during native testing. The native menu routes captures into an application-owned sandboxed comparison window. Host-specific sender URLs/channels, selection/timeouts, settings, clipboard, persistence and disposal stay outside the recovered package.

The playbook engine now permits **96 MiB of combined original/payload change bytes**, still bounded at 256 operations and 32 MiB per file. Tracking both Joplin bundles plus the complete immutable package requires more than the previous 64 MiB total. Runtime inventory remains limited to 50,000 entries and 3 GiB. Existing VS Code bindings are unchanged.

## Acceptance and cost

| Proof | Result |
| --- | --- |
| Common suite in Joplin | 19 checkpoints, all pass |
| Common suite rerun in VS Code | 19 checkpoints, all pass |
| Comparison to retained original donor | Zero unapproved differences in either recipient |
| Native/shared/persistence/ownership gates | 18 pass |
| Joplin lifecycle | 50 real open/use/close cycles; heap/listeners/timers/process/window gates pass |
| Real application restart | Snapshots, mode, selected history and theme restored |
| Generated public launcher | Real app starts; IPC secret stays inside the lab profile |
| Separate-copy rollback | 8 gates pass, including deliberate drift refusal and editing in the restored original app |
| Existing automated checks | 221 unit tests; 13 standalone MCP acceptance checks |

The original donor Ctrl+A selector defect remains the explicitly approved difference from milestone 20. It is recorded in raw observations and is not normalized away. This milestone reuses the already verified original donor run; it does not claim a new donor capture. Both recipient runs use its identical shared-suite version.

After forced GC, the Joplin main heap changed from 113,657,796 to 113,774,660 bytes (+116,864 bytes, within the existing budget). IPC listeners stayed at 28, app listeners at 12, timers at 1, process count at 4; no tool windows remained. All owned app processes exited after each run. These observations apply to this machine and pinned software.

A repeat local adapter preparation took **1.66 seconds**. That measures planning/hashing, runtime copy, guarded patch application and copying the complete package. It excludes downloading/extracting the application, initial engineering and acceptance testing. `PREPARATION.json` records the measurement and manual decisions.

Reused: the entire recovered feature package; shared suite/comparator; ownership checks; playbook/status/rollback engine; sandbox preload/panel shell and controller structure. Added: Joplin identity/hooks, native note capture/settings listener, menu/sender binding, lab launcher and versioned driver. The controller structure is separately maintained adapter code; this proof does not claim every adapter becomes automatic. Compatibility cost remains per version: recheck the six pins and exact hooks, then replay note capture, common scenarios, lifecycle and rollback. A feature-package revision requires both recipients to be reverified.

## Reproduce acceptance

Set `PLAYWRIGHT_MODULE` to an installed Playwright module. Native Linux checks require Xvfb. Supply explicit verified recipient copies and the milestone 20 passed donor run; no DSH, cloud account, API key or model tokens are required.

```sh
npm run test:second-host -- \
  --joplin /path/to/joplin-adapter --vscode /path/to/vscode-adapter \
  --donor-run /path/to/passed-original-donor-run \
  --xvfb /path/to/Xvfb --out /path/to/new-proof

npm run test:joplin-rollback -- \
  --runtime /path/to/new-loose-runtime --feature /path/to/verified-mqtt-package \
  --recipe recipes/joplin-raw-diff/adapter.json \
  --xvfb /path/to/Xvfb --out /path/to/separate-rollback-adapter
```

The rollback test starts the fully restored original application via native CDP with Joplin's built-in `--running-tests` flag, which skips cross-instance IPC. No adapter or inspector patch remains in that runtime. It creates/edits a real note and retains a screenshot. This testing flag is separate from the normal adapted lab launcher.

After completed tests, run `node scripts/applications/seal-second-host.mjs /path/to/new-proof` and likewise for the rollback adapter's `rollback-proof` subdirectory. This appends an integrity index without replacing earlier evidence; transient session/profile directories are excluded. Driver observations and source snapshots remain indexed.

`npm run report:second-host --` accepts `--proof`, `--joplin`, `--vscode`, `--rollback`, `--repeat`, `--launcher`, `--donor-run` and `--out` explicit paths. It verifies artifact indexes, complete package digests, both donor comparisons, lifecycle gates and rollback before writing a new offline dark HTML report. `--repeat` selects a repeat-preparation adapter made by the build script. `--launcher` selects a sealed public-launcher proof produced by `npm run test:joplin-launcher -- <adapter> <Xvfb> <new proof>`. It displays outcomes separately, rather than treating launch success as feature equivalence.

Local release evidence:

- `builds/joplin-native-runtime-v0.23/`: prepared original runtime and archive identity.
- `builds/joplin-raw-diff-v0.23/`: usable adapted lab copy.
- `builds/second-host-v0.23/`: 38 shared checkpoints, native/restart/lifecycle evidence and method snapshots.
- `builds/joplin-rollback-v0.23/rollback-proof/`: real rollback and restored-app proof.
- `builds/joplin-repeat-v0.23/PREPARATION.json`: measured repeat preparation.
- `reports/second-host-v0.23.html`: standalone readable report.
- `evidence/v0.23/VERIFICATION.json`: release checks and source hashes.

Private build outputs, notes/profiles and reports are excluded from the npm package. Published source recipes use explicit caller paths and do not depend on a DSH installation.
