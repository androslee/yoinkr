# Yoinkr v0.2

A local, non-destructive renderer mod loader and early feature-portability workbench for Electron applications. The loader does not edit the target application's files. Mods run through the DevTools protocol and have the renderer's authority; they are not sandboxed plugins.

The longer-term idea is a reusable feature with an adapter for each app and tests proving its behavior. Sharing Electron does not make two apps' internal APIs interchangeable. See [the review and expansion plan](../examples/README.md) for implemented fixes, limitations and ordered milestones.

## Requirements and quick start

Node 22+, no runtime dependencies. The target must accept loopback remote debugging; hardened builds or an already-running single-instance app may refuse it. Prefer a supported app extension API when available.

From this project directory:

```sh
node src/cli.js list
node src/cli.js inspect code --json
node src/cli.js compare /path/to/source-install /path/to/target-install
node src/cli.js validate mods/demo-hello
node src/cli.js plan code --mod ./mods/demo-hello --dry-run
node src/cli.js launch code --mod ./mods/demo-hello
node src/cli.js launch code --safe-mode
```

For an ASAR-packaged target, use `yoinkr pin APP_ID --mod ./mods/demo-hello` before its first tested launch. Unpacked installations (including the local VS Code installation inspected here) do not yet support byte-level pins.

After a normal npm installation, `yoinkr` is the equivalent executable. `inspect` and `compare` read package/archive metadata without executing either app or contacting a model. Their output includes evidence and unknowns; matching declared dependencies do not prove runtime compatibility.

Use `--app-dir /path/to/install` when auto-detection misses an installation and `--executable /path/to/binary` when the launch executable cannot be identified. Mod directories are read from `$YOINKR_HOME/mods` (default `~/.modkit/mods`) plus explicit `--mod` directories. State is stored separately under `$YOINKR_HOME/state/<app-id>`.

## Loader behavior

- Registers new-document hooks and executes guarded code in already-loaded pages. Reloads use a new document guard. A polling controller attaches additional/replacement windows; it is not guaranteed to run before app startup code.
- Synchronous throws appear in `window.__modkitErrors`; registered does not mean accepted or fully functional. Async exceptions and renderer hangs still require separate diagnostics.
- Pins cover ASAR bytes; changed archives refuse modded launch by default. `--on-drift warn|continue` permits an explicit override; `pin` explicitly records a replacement baseline. Unpacked apps and mod entry contents do not yet have equivalent drift fingerprints.
- Disabled mods do not participate in conflicts. Hard conflicts refuse launch unless `--force` is supplied. Safe mode launches with no mods or debugging flags.
- Two consecutive early abnormal process exits disable the latest enabled mod in recorded installation order. This is heuristic attribution, not proof of causation. Fresh state directories are created automatically and state writes replace atomically. Late crashes reset the early-crash streak.
- Protocol requests time out, closed sockets reject pending calls, and setup failure closes the connection and terminates only the process spawned by this launch.

## Portable feature example

[`mods/focus-mode`](../mods/focus-mode/entry.js) implements one focus mode with two explicit fixture adapters. **Alt+Shift+F** toggles it; the API also supports `toggle()` and `dispose()`. It restores original inline styles and handles dynamically inserted panels. Its manifest targets only the two test apps; it is not represented as a working adapter for an arbitrary real app.

[`mods/demo-hello`](../mods/demo-hello/) is the smallest generic injection example. [Manifest specification](manifest-spec.md).

## Tests

```sh
npm test
# Optional integration, requires a separately available Playwright/Chromium:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

The default suite has 46 named unit regressions (Node also reports the helper module as a file test). The optional browser suite checks actual native WebSocket/CDP execution across current documents, reloads, independent/replacement windows and both focus-mode adapters. It launches only its own temporary Chromium profile. Runtime operation needs no Playwright, internet or AI tokens.

No real application's live profile was modified during this review. See the historical verification record (see [local output policy](REPOSITORY.md#verification-output-layout)) and [scope/next steps](../examples/README.md). Main-process behavior, automatic extraction, full donor/recipient differential testing, native ABI translation and non-Electron adapters remain future work.
