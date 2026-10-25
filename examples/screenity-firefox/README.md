# Screenity drawing tools → Firefox portable lab

Use Screenity's original drawing tools in a separate Firefox recording studio. Draw with the pen/highlighter, arrows, rectangles or editable text; undo/redo; record and pause/resume; export a local WebM video or PNG. No account or AI model is required.

**This is an experimental partial port, not the official Screenity extension.** Screenity's full editor, webcam, microphone, system audio, region selection, cloud services and original interface are not ported. Annotations are drawn on the studio preview and composited into exports; this does not inject a toolbar into every website.

## Build

Requires the root project's supported Node version and an **extracted Firefox desktop application directory**. Linux x86-64 is the verified development platform. Firefox 142 or newer is required. Windows/macOS are unverified. Download a browser only from a trusted Mozilla distribution, or supply a local installation directory. Yoinkr does not download, patch or disable security controls in Firefox.

From this directory:

```sh
npm ci --ignore-scripts
npm run acquire
# Linux example: copy the installed browser into this lab.
npm run build -- /usr/lib/firefox
# macOS example: supply the .app bundle (copied to .local/firefox/Firefox.app).
# npm run build -- /Applications/Firefox.app
npm start
```

`acquire` downloads only the source files and notices listed in `recipe.json`, at an exact upstream commit, and verifies SHA-256 hashes. `build` is offline once dependencies/inputs exist. It checks hashes again before bundling and copies the supplied Firefox application into `.local/firefox/`. It does not modify the original browser. If a browser copy already exists, it is kept; supplying a new directory does not silently overwrite it.

Use `launch-firefox.sh` after building, or run `npm start` from this directory. Root shortcut: `npm run example:screenity`. You may instead set `YOINKR_FIREFOX` to an explicit Firefox executable and build without a browser argument; that uses your supplied executable with the lab profile.

The copied application still depends on the operating system's libraries; this is a portable **lab directory**, not a fully self-contained OS image or signed installer. Node and the example's npm dependencies are needed to launch it.

## Try it

1. The launcher opens a separate Firefox instance with the temporary example add-on. Its studio opens automatically on installation. You can also use its toolbar action.
2. Choose **Use animated demo** to try it without granting screen access, or **Choose screen or window** and accept Firefox's native sharing prompt.
3. Draw on the preview. Choose **Text**, click the preview and type; choose **Select** to move or edit objects.
4. Press **Record**, optionally pause/resume, then **Stop**. Play the result and choose **Save recording**. **Save PNG** captures the current frame and annotations.
5. **Release screen** stops source capture. Closing Firefox ends the temporary add-on session. Launch again to load it again.

Use a window other than the studio as the capture source to avoid a recursive mirror. Capture uses a fixed 960×540 canvas at up to 30 fps, preserving the source aspect ratio with letterboxing. Recording is video-only, limited to five minutes or approximately 128 MiB of buffered data. Save recordings before closing the studio; unsaved recordings and drawings are discarded. The browser's normal save/download controls determine where exported files go.

## Directory layout

```text
screenity-firefox/
  recipe.json          # exact upstream source hashes
  acquire.mjs          # explicit network acquisition
  build.mjs            # verified recovery + new host bundle
  launch.mjs           # isolated-profile temporary add-on launcher
  verify.mjs           # actual Firefox WebDriver checks
  extension/           # new Yoinkr host source
  .local/              # GENERATED, ignored by Git and npm
    upstream/          # pinned originals + licenses
    demo/
      extension/       # runnable add-on, bundled original modules
      source/          # corresponding donor + host sources
      PROVENANCE.json
    firefox/           # copied Firefox application (Firefox.app inside it on macOS)
    profile/           # lab-only profile; never your daily browser profile
    verification/      # generated test receipt/video/screenshot
```

**Do not commit `.local/`, `node_modules/`, personal recordings or downloaded browser executables.** The repository shares reproducible instructions, small recipes and new adapter source. To share a generated derivative separately, include its exact corresponding sources and license notices.

## What was reused

Screenity **4.7.0**, commit `c5b344fbb3d9a126c4b3a39f0979c7976392fa96`, from [alyssaxuu/screenity](https://github.com/alyssaxuu/screenity):

- `PenTool.jsx`, including highlighter behavior;
- `ArrowTool.jsx`, `ShapeTool.jsx`, `TextTool.jsx`, `SelectTool.jsx`;
- `History.jsx` and `fabricCompat.js`.

These files are retained **byte-for-byte** and bundled with Fabric **7.4.0**. A new host adapter maps the donor's removed `getPointer` call to Fabric's scene-coordinate API. No algorithm is reimplemented under Screenity's name. New Yoinkr code supplies the studio, toolbar/state binding, screen-source selection, frame composition, MediaRecorder export, lifecycle cleanup and portable launcher.

The original Chrome background/offscreen/tab-capture architecture is replaced for this bounded feature rather than emulated. This route is source recovery/adaptation, not a claim of complete CRX conversion or whole-app REA reconstruction.

Screenity's GPLv3 and third-party notices are retained in the generated extension and corresponding source. The new host is GPLv3 under Yoinkr's [license](../../LICENSE). Firefox and npm dependencies retain their own licenses.

## Verification

The generated extension can be checked with Mozilla's tooling:

```sh
npx --no-install web-ext lint --source-dir .local/demo/extension
```

For repeatable native tests, supply a separately installed [Mozilla GeckoDriver](https://github.com/mozilla/geckodriver). The test never downloads it or modifies a normal profile:

```sh
GECKODRIVER=/absolute/path/to/geckodriver npm run verify
```

The suite installs the actual add-on into an ephemeral Firefox profile, drives real pointer/keyboard input through the original modules, exercises undo/redo and creates a playable WebM from an explicitly synthetic animated canvas. It retains `RESULT.json`, the test video and a screenshot under `.local/verification/`. The automation uses GeckoDriver's explicit system-access option only for the isolated test; the ordinary launcher does not enable it.

To include real screen sharing, provide an Xvfb executable. The suite creates and captures its **own private virtual display**, never your normal desktop:

```sh
YOINKR_XVFB=/absolute/path/to/Xvfb GECKODRIVER=/absolute/path/to/geckodriver npm run verify -- --screen
```

The earlier Fabric 6 build passed **16 native checks on Firefox 158.0 / Linux x86-64**, including actual temporary add-on installation, original drawing tools/history, native screen chooser and refusal, real private-display capture, playable WebM, source-track shutdown, source-drift refusal, and launch-integrity refusal.

The current Fabric 7.4.0 build passed **16 native Firefox checks** on the same Linux/browser lane: installation, original source integrity, drift/launch refusal, pen/arrow/rectangle/highlighter/text tools, undo/redo, composited MediaRecorder output, and cleanup, plus the native sharing chooser, real capture of a private Xvfb screen, playable recording, cancellation and source-track shutdown. This includes a fresh rebuild and real screen-sharing rerun during pre-publication verification. Mozilla `web-ext lint` passed with no errors or warnings. These are scoped results for this partial port; the original full Screenity app was not used as a complete behavior oracle. Camera, audio, full upstream UI/editor, Windows/macOS, other display backends and signed add-on distribution remain outside acceptance scope.

## Temporary developer installation

The launcher uses pinned `web-ext` tooling and Firefox's supported temporary add-on mechanism. It does **not** turn off signature enforcement or install into your everyday profile. The add-on lasts only for that browser session. A permanent public add-on would require Mozilla review/signing and separate packaging work. [Mozilla's temporary-installation documentation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
