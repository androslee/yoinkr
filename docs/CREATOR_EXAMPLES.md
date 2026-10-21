# Element → VS Code and GIMP → OBS

Yoinkr 0.28.0 continues two new donor/recipient examples. They are independent of the remaining milestone 24 Windows work. DSH, a model, cloud credentials, personal chat accounts and streaming credentials are not required.

## Current results

| Example | Implemented and checked | Still required |
| --- | --- | --- |
| Element Web highlighting → actual VS Code | Exact original highlighting classes extracted at a pinned commit, compiled, and used in a new local transcript search window. Twelve native Linux recipient checks include real app/menu/window, search/filtering, sender permissions, input import and guarded rollback. | Full original Element app baseline, more original UI if desired, live Matrix service integration and Windows/macOS. This is not the complete original room/search interface. |
| GIMP smoothing → OBS annotation module | Exact original C function extracted at a pinned commit; bounded compatibility shim; deterministic numerical comparison for 18 settings combinations and 512 points each. Native OBS source adds a Qt dock and transparent 1920×1080 annotation source. Compiled and linked against OBS 30.0.2 / Qt 6.4.2 SDKs on Linux x64. | Actual GIMP GTK donor observation; actual OBS load and scene/rendered-frame acceptance; input usability, transparency, lifecycle, profile isolation and rollback. No GUI support claim follows from compilation. |

The transcript panel uses Element's original `BaseHighlighter` and `HtmlHighlighter` class definitions from `apps/web/src/HtmlUtils.tsx`. New Yoinkr code supplies local JSON loading, all-term matching, room filtering, DOM text-token presentation and the native host. Text is appended with `textContent`, including literal HTML-looking messages. It does not connect to Matrix or load private chat history automatically. Search input excludes empty highlight terms before invoking the donor's algorithm.

The OBS candidate uses `gimp_paint_core_smooth_coords` from `app/paint/gimppaintcore.c`. The function's bytes are unchanged. A compatibility layer supplies just the structs/macros it reads and retains the newest 100 input points, matching GIMP's maximum quality window. Tests compare identical `(x,y,velocity)` traces; the new OBS pointer adapter computes normalized pointer velocity and has not been shown equivalent to GIMP's full input pipeline. Brush dynamics, GIMP widgets, tablet-pressure behavior, undo/redo, source persistence and other painting tools are not transferred.

## Acquire sources explicitly

Install the supported Node version and run `npm ci` in a source checkout, including development dependencies. Acquisition requires internet access and fails on any changed source hash. Builds use supplied local directories without downloads.

```sh
npm run acquire:example-sources -- element-search /path/to/new-element-sources
npm run acquire:example-sources -- gimp-smoothing /path/to/new-gimp-sources
```

The reference inputs are:

* Element Web `6b97ebf1ad502d2f82f9a95a85c7c011177d4060` — HtmlUtils and the original AGPL license.
* GNOME GIMP `5a569ea4df7c29416f34bd109b66c8bdb5482292` — paint core, paint options and COPYING.

All original bytes and licenses are retained in generated packages, along with source ranges, original-slice hashes, compiler output and new adapters. Public recipes contain pins, not recovered code. Generated outputs contain donor code and are private build artifacts. Their licensing is not replaced by Yoinkr's GPLv3 license. When redistributing a derived example, retain the full applicable license and corresponding source for the exact output. The OBS source builder copies its entire recovered donor package into `donor/` for this purpose.

## Build and launch the Element example

The current recipient is the original VS Code **1.142.0 Linux x64** distribution, with all six runtime fingerprints in `recipes/element-search/vscode.json`. Use an unmodified extracted runtime; another app/version is refused. The installer creates a fresh application copy through the existing Electron playbook engine. Its menu integration uses no extension.

```sh
npm run build:element-example -- /path/to/new-element-sources /path/to/code /path/to/new-element-demo
node /path/to/new-element-demo/recipient/launch.mjs /path/to/new-element-demo/recipient/workspace
```

Choose **Yoinkr messages → Open Element message search** in the copied application's native menu. Sample messages appear automatically. Search `launch checklist`, select a room, or choose **Open transcript…** for a local JSON array. Each message has string fields `id`, `room`, `sender`, `text`; unknown fields are refused. Limits: 2 MiB, 2,000 messages, 4,000 characters per body; search uses at most 12 terms with a 256-character total. Transcript content is not persisted by this first slice. Reopening starts from the synthetic sample. No text is inserted into the editor.

The retained ready-to-review build is `builds/element-v0.28/recipient`; its launcher is `launch-code.sh`. Profiles belong to the lab copy. The user-controlled launch guard hashes recipient files and added payload before starting, and disables extensions and updates in that lab profile. An ordinary desktop launch retains Chromium sandbox defaults. Headless native acceptance used `--no-sandbox` only for its isolated environment.

```sh
node src/cli.js host-status /path/to/new-element-demo/recipient
node src/cli.js host-rollback /path/to/new-element-demo/recipient
```

Rollback checks drift before restoring the copied package and removing adapter/feature files. The original VS Code installation and existing profiles are not inputs to mutation.

## Prepare the OBS annotation module

```sh
npm run build:source-slice -- gimp-smoothing /path/to/new-gimp-sources /path/to/new-smoothing-package
npm run build:obs-annotation -- /path/to/new-smoothing-package /path/to/new-obs-module-source
```

The output is **experimental native C/C++ module source**, with `CMakeLists.txt`, full donor attribution and `RECIPIENT.json`. It is not installed automatically. For an environment with CMake ≥3.22, C/C++ compilers, the OBS frontend/libobs SDK and Qt 6 Widgets SDK:

```sh
cmake -S /path/to/new-obs-module-source -B /path/to/new-obs-module-source/build
cmake --build /path/to/new-obs-module-source/build
```

An alternative Linux x64 compile check accepts a local SDK prefix with the Ubuntu-style `usr/include` and `usr/lib/x86_64-linux-gnu` layout. It writes the module and a separate `COMPILE.json` receipt; it never installs or launches it:

```sh
npm run compile:obs-example -- /path/to/new-obs-module-source /path/to/extracted-sdk /path/to/new-compile-proof
```

The compiled proof is under `builds/obs-annotation-v0.28/compile`. The module must still be run in an isolated OBS setup before distribution. Planned interaction: open the **Smooth annotations** dock, add a **Yoinkr smooth annotations (experimental)** source to a scene, draw in the dock and adjust quality/weight. The source uses a transparent background; annotations are yellow. **Clear annotation layer** resets the output. Only mouse-driven drawing is implemented so far. Source instances share the current dock drawing; it lasts for the current OBS session.

## Repeat the checks

```sh
npm run test:example-slices -- /path/to/element-feature /path/to/new-smoothing-package /path/to/new-core-proof
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:element-native -- /path/to/new-element-demo/recipient /absolute/path/to/Xvfb /path/to/new-native-proof
```

Native acceptance starts its own virtual display and copied app. It checks main-process reads of a selected JSON file using a supplied dialog-result stub; it does not test clicking a platform-native file dialog. It exercises a foreign renderer in the same Electron session to verify capability rejection. A second disposable runtime is actually rolled back and launched. Neither an original full Element app nor a GTK/Qt application is run by this suite. REA analysis of the new donor application closure is also pending; source-slice discovery and hashing are not represented as REA Evidence.

Retained scope and checks: `evidence/v0.27/VERIFICATION.json`, `core/RESULT.json`, `element-native/RESULT.json`, and `obs-compile/COMPILE.json`. Compiler success and source comparisons are separate from application acceptance.

## Qt and GTK verification gate

Update `FRAMEWORK_SUPPORT.md` and `FRAMEWORK_EXAMPLES.md` after these actual checks, with exact versions, platform and retained evidence:

1. **GTK donor:** run the pinned GIMP build with actual GTK controls, observe smoothing on/off and quality/weight changes, retain input/parameter and output evidence, and identify the correspondence between observed behavior and recovered code. Pin the GIMP build/version separately from its source commit. Reading C source or reproducing the formula does not execute GTK.
2. **Qt recipient:** launch an isolated actual OBS build, load the compiled module, operate its Qt dock and observe the annotation source in a scene and a captured output frame. Exercise multiple strokes, bounds, clear, resizing, repeated dock/source open/close, shutdown and reopening. Verify that the original app remains usable after removing the module. Keep synthetic media; no streaming account is needed.
3. **Cross-application comparison:** compare controlled trace/configuration cases, record differences in pointer velocity and UI semantics, and preserve failures. Verify an actual source frame, not just that a dock appears or the `.so` links.
4. Mark the passed **specific routes** as verified: GTK/GIMP donor observation/source recovery and Qt/OBS recipient adaptation. This example does not transplant a GTK widget, establish arbitrary GTK hosts or prove every Qt version. If those remain untested, keep their limits explicit even when the named transfer passes.

Current matrix status for Qt and GTK is **in progress; native acceptance pending**. The requested verification update is part of completing this example; it has not been prematurely promoted by this first implementation.

The original implementation proof is retained in `evidence/v0.27/`. Rebranding and compatibility checks are recorded separately in `evidence/v0.28/`; historical receipts and builds retain the former project name.
