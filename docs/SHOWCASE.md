# Extension-free transfer showcase

## 1. MQTT Explorer functionality inside a native VS Code working copy

Run from the project directory:

```sh
./builds/native-code-v0.4/launch-code.sh
```

This starts a separate copy of the actual installed VS Code application. Its Yoinkr menu opens MQTT Explorer (Ctrl+Alt+M) and Document Viewer. The MQTT window also opens automatically for the showcase. It uses its own portable profile and extension directory. It is not an installed VS Code extension, webview extension or renderer CDP injection. The startup manifest is patched to a local bootstrap, which loads the host integration and then VS Code's original main module.

To try it without configuring another broker, start this optional, localhost-only demo in a separate terminal:

```sh
npm run demo:broker
```

In the MQTT window connect to `mqtt://127.0.0.1:18883`, subscribe to `#`, expand the demo topic tree, inspect JSON/text/hex, and publish a message. Ctrl+C stops the demo broker. The broker is not started automatically by the app.

### What was actually reused

The official MQTT Explorer revision `35f31973c456a024a37450f5961e4610dc9a9ce0` was analyzed with real REA and its topic model, message history and payload formatter were recovered into a private case. Those TypeScript files remain byte-identical in the export. The builder compiles them with an explicit barrel-import adaptation to break circular initialization. Original host glue supplies MQTT transport, an isolated Electron preload and the new UI. The wrapper normalizes donor topic-edge maps to handle prototype-like topic names without changing recovered files.

The UI supports connecting over mqtt/mqtts/ws/wss, subscription filters, topic hierarchy and text filtering, last payload and message counts, JSON/text/hex display, publishing with retain/QoS, reconnecting, clearing and disconnecting. Credentials are in memory for the current connection and are not saved. Bounds cap topic count, topic depth and payload size.

This is a real functionality transfer, not the entire MQTT Explorer application. Original plotting, comparisons, connection profiles, custom certificate management and its full UI are not ported. The official source's package and license-file labels differ; both are recorded and the original license retained in the private build. Nothing is published to a marketplace.

`PATCH.json` records the original package hash and new entry. Native recipient analysis uses a byte-identical snapshot of the installed VS Code package/product metadata and startup source. The scope/partial coverage is explicit; this is not a claim that the entire VS Code implementation was reverse engineered. Native UI acceptance ran against the actual modified VS Code with extensions disabled and an owned MQTT broker.

Rollback is deleting the separate build. The original application installation is unchanged. Its installer/updater should not be used to overwrite the lab copy; updates are disabled in the lab's default settings.

## 2. VS Code document-preview assets in an extension-free Chromium viewer

```sh
./builds/feature-examples-v0.4/chromium-documents/launch-documents.sh
```

This opens a standalone local page in Chromium app mode with browser extensions disabled and its own browser profile. Use the file picker for Markdown, Jupyter notebooks, CSV, TSV, JSON, text and logs; light/dark display is available. Files stay in the viewer. Scripts/HTML notebook output are not executed and remote images/active document links are suppressed.

It reuses actual installed VS Code Markdown/highlight CSS with source hashes. Markdown-it, DOMPurify, notebook/table handling and the browser host are separate components, rather than a claim that VS Code's full document engine was copied.

This does not add native Chromium MIME handlers or Word/Excel support. App-mode delivery is extension-free, but it is still a local viewer page rather than a Chromium C++ source fork. The generated extension manifest remains only as a fallback prototype; the tested showcase does not load it.

If Chromium is not on PATH, set `YOINKR_CHROMIUM` to its executable. The local build also records the existing test Chromium path as a fallback. Its profile is isolated from your regular browser. No file-URL permission or browser extension installation is required.

## Evidence

- `evidence/native-ui.json`: actual application, native menu, isolated preload, broker, formatting, publish, document window and disconnect.
- `evidence/mqtt-example.json`: retained traffic, donor tree/formatter, QoS publishing, bounded inputs, rapid-connect race handling and cleanup.
- `evidence/documents-example.json`: formats, untrusted content, limits and no page network requests.
- `evidence/chromium-app-mode.json`: actual browser app-mode GUI without extension identity.
- `evidence/integration-workspace`: REA investigation → original-file recovery → recipe wiring → retained differential acceptance.

Screenshots: native-mqtt.png, native-workbench.png, native-documents.png, chromium-documents.png, chromium-app-mode.png under evidence/.

## Rebuild

Get the official donor at the pinned revision, then, from Yoinkr:

```sh
node scripts/build-examples.mjs --mqtt-donor /path/to/MQTT-Explorer --out /tmp/new-yoinkr-examples
node scripts/build-native-host.mjs --examples /tmp/new-yoinkr-examples --out /tmp/new-native-code
```

The native builder expects the tested Linux VS Code layout (`/usr/share/code` by default, override with `--code`). It refuses an unexpected bootstrap shape. No upstream install scripts are run. Local original source licenses/provenance and complete REA Evidence stay in the case. Native menu tests need a normal desktop or an isolated virtual X display; Electron's headless ozone mode did not support this menu/titlebar test reliably.

## New v0.13 numeric plotting transfer

The original native lab remains available. A fresh build at `builds/native-plot-v0.13` adds numeric MQTT topic charts, using original donor conversion code and new host presentation/storage. See [the transfer and native acceptance](NATIVE_PLOT_TRANSFER.md).
