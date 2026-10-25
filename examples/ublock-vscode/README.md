# uBlock Origin → VS Code research browser

A copied VS Code application gains a native browser window with **vertical tabs, original uBlock Origin, Dark Reader, RES and named sessions**. Open it from **Yoinkr browser → Open research browser**, or press **Ctrl+Alt+R**. It runs in the same application process as Code, alongside the workbench and any previously prepared Yoinkr features.

This is an application-owned browser window, not a VS Code marketplace extension or the workbench's existing Simple Browser/editor webviews. Filtering applies to this browser's own tabs; it does not intercept the editor's updates, extensions, terminals or other webviews.

## Browser enhancements

| Enhancement | What you get |
| --- | --- |
| **Full uBlock Origin MV2** | Original request-time filtering engine, custom filters, subscriptions, per-site controls, dashboard and request logger. Native acceptance covers network blocking, exceptions, cosmetic hiding, page-world scriptlets and CSP response-header enforcement. |
| **Visible plugin controls** | One-click global enable/disable buttons for uBlock, Dark Reader and RES, with direct settings buttons. |
| **Dark Reader** | Original extension darkens webpages; disabling it removes its injected styles. |
| **Reddit Enhancement Suite** | Original RES code with a small host-context adapter; user tags and its settings console are verified on a controlled old-Reddit fixture. |
| **Vertical tabs and saved sessions** | A tab sidebar, named local tab groups and automatic restoration across restarts. |
| **Protection before restored pages load** | When enabled, uBlock must report readiness before the host restores web tabs. |

### Why full MV2 uBlock Origin matters

This uses the original **Manifest V2 (MV2)** edition. Compared with Lite's compiled declarative rules, it retains uBlock's own request-time engine, custom filtering workflow and independently updated filter lists. The author's [Lite comparison](https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-%28FAQ%29) describes filter options that cannot be translated into declarative rules and why some sites can need the original engine. Lite also supports cosmetic filtering and scriptlets; those features alone do not distinguish it from full uBlock.

The benefit here is broader filtering control. **We have not measured a blocking-rate or performance advantage over Lite across real websites.** The original dashboard includes advanced filtering controls, but acceptance covers only the capabilities explicitly listed below. This is a tested Electron host integration, not a promise that every upstream browser API works.

**DNS/CNAME uncloaking and Firefox response-body filtering are deferred.** They are not included in this example or required to build it. The [future API plan](FIREFOX_UBLOCK_PLAN.md) records the work needed for those capabilities.

## What is original and what is new

- **Original:** uBlock Origin **1.75.0 Chromium MV2**, downloaded directly from its author's release and checked against the release archive SHA-256. Its background code, popup, settings dashboard, filter lists, network engine, cosmetic filtering, scriptlets and assets are unpacked without edits. This is not uBlock Origin Lite.
- **Compatibility:** `electron-chrome-extensions` **4.9.0** supplies missing browser APIs, tab registration and the browser-action UI. Electron's extension `webRequestBlocking` handles request interception. The host does not register competing Electron `webRequest` listeners, which would suppress extension listeners.
- **New Yoinkr code:** the vertical-tab interface, address/navigation controls, isolated browser session, tab save/restore, startup readiness gate, native Code menu, blocked-site tab identity and response-header event adapters, source acquisition, guarded copy/build and acceptance tests.

A narrow appended compatibility preload maps Electron’s missing initial-navigation tab ID to the pending browser tab so uBlock can show its original blocked-site explanation. The host also retains Electron’s native blocking response-header event, allowing uBlock’s CSP filters to take effect before page scripts execute. These adapt the host API and do not edit uBlock.

Firefox does not have to be embedded or copied. The original Chromium uBlock branch works in the tested Electron runtime. Firefox-specific capabilities, including its response-body filtering and DNS/CNAME facilities, are not supplied by this adapter. Unknown permission warnings such as `privacy` do not establish that those optional browser controls work.

## Setup and build

The native binding targets **Linux x86-64**. Install a supported Node version from the root README and npm. Supply a complete extracted VS Code runtime directory containing `code` and `resources/app/package.json`. The development acceptance run used **VS Code 1.142.0 / Electron 43.7.7 / Chromium 150.0.7871.250**. Other versions are recorded by the builder but need their own native verification; macOS and Windows are not verified.

From the repository root:

```sh
npm ci --ignore-scripts
cd examples/ublock-vscode
npm ci --ignore-scripts
npm run acquire
node build.mjs /path/to/code
npm start
```

The builder creates `.local/plugin-browser/` and refuses to overwrite an existing output. You can instead supply a fresh destination:

```sh
node build.mjs /path/to/code /path/to/new-browser-demo
/path/to/new-browser-demo/launch-code.sh
```

Use a reasonably short destination: VS Code's Unix IPC socket paths have a length limit. Root dependencies provide the guarded playbook copy engine; example dependencies provide the compatibility layer, bundler and archive unpacker. All downloads, runtime copies, profiles and raw test output remain ignored.

You can supply the `workspace/runtime` directory of a previously prepared **Element → VS Code** example. The new copy imports its existing entry point, preserving that example's native menu and feature. The original input and its launcher are not changed. The output records exact input hashes, the original extension recipe and generated payload hashes in `BUILD.json`.

## Plugin controls and sessions

The toolbar has always-visible **uBlock / Dark Reader / RES / Sessions · ON/OFF** buttons. Each switch takes one click and persists across restart. Extension switches load/unload the actual package and refresh open web tabs to remove already-injected effects. Finish unsaved webpage work before switching. A gear beside each extension opens its settings directly; the original extension icons also remain visible beside the address bar.

- **Dark Reader 4.9.133:** original Chromium MV2 release, source archive unchanged. Native tests verify real darkening, unload/style removal and re-enable.
- **RES 5.24.11:** original MV3 release code with a derived manifest that prepends a small normal-session context adapter to content scripts. Electron omits `chrome.extension.inIncognitoContext` there; the adapter supplies `false` because this browser uses only a normal persistent session. The original manifest is retained as `yoinkr-upstream-manifest.json`. Original RES JavaScript and styles are unchanged. Native acceptance verifies user-tag controls on a synthetic old-Reddit HTTPS fixture. Live Reddit, every RES module, history integration, optional downloads and cloud/OAuth services are not covered.
- **Sessions:** Yoinkr-owned host functionality. Name a group and click **Save tabs**, then choose it and click **Open session** or **Delete**. Opening a session appends its tabs. Saving the same name updates that group. Up to 20 groups of 32 web tabs are stored locally. Disabling Sessions stops automatic tab save/restore and disables its controls while retaining named groups for later use.

Pinned release URLs, hashes and licenses are in `recipe.json`. All switches are global for this generated browser profile; uBlock's original popup still supplies per-site control.

## Use

- Open **Yoinkr browser → Open research browser** in the copied Code application.
- Enter an HTTP/HTTPS address. Use **New tab** and the left sidebar to manage tabs. **Ctrl+L**, **Ctrl+T** and **Ctrl+W** work inside webpages as well as the browser controls.
- Click the **uBlock shield** for the original popup, blocked counts and per-site power switch.
- Open **uBlock settings & filters** for subscriptions, custom filters, trusted sites and advanced mode. Open **Request logger** to inspect filtering decisions.
- Web tabs and their selected tab are restored when reopening the browser. uBlock settings, custom filters and subscriptions live in the separate generated profile.

When uBlock is enabled, restored browser tabs wait until it reports that filtering is ready. A blocker startup failure holds those tabs and shows an error. Explicitly switching uBlock OFF allows unfiltered browsing and displays “Ad blocking OFF” in the header. Remote pages retain sandboxing, context isolation, web security and disabled Node integration, and cannot call the browser-control IPC bridge. The demo denies permission requests for media/devices and supports up to 32 open tabs. General-purpose browser-extension installation is not supplied; optional extension services are outside the verified scope.

The extension archives are pinned and rechecked at load time. uBlock manages its normal filter-list updates independently; its dashboard controls those downloads. Upgrading Electron, the compatibility layer or the extension requires rebuilding and rerunning acceptance, rather than assuming future MV2 compatibility. Browser use and list updates require network access; no AI model or cloud-model tokens are involved.

## Firefox capabilities

The current blocker is original MV2 uBlock Origin, not Lite. The pinned Firefox and Chromium packages have identical static network, cosmetic, scriptlet and HTML filtering source files. Firefox has additional host APIs that this demo has not implemented. Installing its XPI would not supply those missing APIs.

```sh
npm run acquire -- --firefox-audit
npm run audit:firefox
```

This source-only audit never executes the Firefox package. See the [Firefox host API plan](FIREFOX_UBLOCK_PLAN.md) for how DNS/CNAME resolution and response filtering before Chromium parses a page could be added and tested. Firefox feature parity and comparative real-website effectiveness are not claimed.

## Verify and roll back

For a clean-checkout source build without a real Code runtime, run `npm run acquire`
and `npm run verify:build` after installing root and example dependencies. CI runs
this check on Linux: it bundles the real host and pinned archives using a synthetic
application fixture, verifies unchanged inputs, existing-output refusal, drift
refusal and rollback, and never launches Electron. Native checks below are still
required to verify actual browser and extension behavior.

Install Playwright in your chosen local tooling directory, then set `PLAYWRIGHT_MODULE` to its absolute `playwright/index.mjs` path. No Playwright browser download is needed: the test launches the supplied Code executable. A working Linux display and sandbox support are required. The plugin suite also uses `openssl` to create a short-lived test certificate; only its public-key fingerprint is allowed for that test process. Production TLS verification is unchanged.

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs npm run verify
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs npm run verify:plugins
```

By default this verifies `.local/plugin-browser/`, using a disposable test profile under the repository's ignored `.local/verification/ublock-vscode/`. It never uses your browsing profile. Optional arguments select a build and a new result directory:

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
  node verify.mjs /path/to/browser-demo /path/to/new-verification-output
```

Acceptance exercises a real Code workbench, original extension readiness, default-list request blocking, custom rules, allowed requests, exceptions, cosmetic filtering, page-world scriptlets, the original popup/site switch, response-header/CSP enforcement, vertical-tab selection, original dashboard/logger pages, sandbox settings and restart persistence. The plugin suite tests actual Dark Reader styling, original RES user tags on a synthetic old-Reddit page, extension disable/re-enable, named-session controls and restart persistence. It does not exercise live Reddit accounts or cloud services.

Pre-publication native verification reran all **19 blocker checks and 12 plugin checks** successfully on the pinned Linux Code/Electron lane. These results cover actual native application behavior rather than just source-build fixtures.

Advertising fixture domains are mapped to a loopback HTTP server; blocked requests must never reach it, and disabling protection proves those same requests can reach it. This is a scoped compatibility test, not a claim that every website or Firefox-only feature works.

The launcher checks generated payload drift. The runtime is a separate copy; stop using it to return to your original application. For a guarded restoration of the copy's original entry point and removal of added payloads, use the existing playbook rollback from the repository root:

```sh
node --input-type=module -e \
  'import {rollbackElectronPlaybook} from "./src/electron-playbook.js"; await rollbackElectronPlaybook(process.argv[1]);' \
  /path/to/browser-demo/workspace
```

After rollback, use the restored runtime with explicitly separate profile arguments. The generated feature launcher intentionally refuses the changed hashes. Rollback preserves the generated profile and does not touch the input runtime.

See [third-party notices](THIRD_PARTY_NOTICES.md) and the [pinned recovery recipe](recipe.json). The repository publishes the host source and reproducible recipe; it does not check in third-party application downloads or profiles.
