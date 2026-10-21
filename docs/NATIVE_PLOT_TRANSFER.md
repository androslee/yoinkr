# MQTT Explorer numeric plotting inside native VS Code (v0.13)

This is the next named feature transfer: the native VS Code lab's MQTT window now plots raw numeric topic payloads. It reuses the original MQTT Explorer numeric-conversion implementation and adds an explicitly separate native host store, renderer and IPC integration. No VS Code extension is installed.

## Try it

```sh
./builds/native-plot-v0.13/launch-code.sh
```

From Yoinkr, optionally run `npm run demo:broker` in another terminal. In the lab window connect to `mqtt://127.0.0.1:18883` and select **demo/plot/temperature**. The demo also publishes ON/OFF light state, which is plottable as 1/0. The broker is local and optional; the application does not start it automatically.

Choose any raw numeric topic to see the chart. **Pause plot** freezes presentation while sampling continues; **Resume plot** displays the collected samples. **Reset this plot** clears only the selected topic's samples. **Clear history** clears all topic and plotting data. Changing topics exits a paused view so the chart cannot retain another topic's label/data. Closing the lab disposes the client and in-memory samples.

## Recovered versus new

| Component | Origin and treatment |
|---|---|
| `app/src/components/Sidebar/CodeDiff/util.tsx` | Original source recovered byte-for-byte through real REA case/export, compiled without source edits. Its `toPlottableValue` handles original numeric/ON/OFF/comma-decimal conversion. |
| Original `TopicPlot.tsx` / `Chart.tsx` | Analyzed/retained as dependency and behavior evidence. Their React/Material UI/D3 UI is not installed into the recipient. |
| `donor-plot.cjs` | esbuild compilation of unchanged donor utility source; compiler/version/source/output hashes retained. |
| `plot-history.cjs`, `plot-explorer.cjs` | Newly written bounded ring storage and adapter around the existing native MQTT controller. |
| `plot.js`, `plot.css`, panel markup | Newly written SVG chart, finite coordinate normalization, controls and styling. |
| Existing broker transport / topic tree / payload formatter | Prior native host functionality remains available. |
| Native main/preload integration | Existing scoped native-window sender/frame validation; one new `clear-plot` operation, with controller-side type/size validation. |

The new SVG presentation is not represented as recovered donor chart code. Dependency classification records portable code, host-provided APIs, replaced donor UI dependencies, unresolved static findings and omitted feature scope.

## Scope and bounds

Plots accept finite raw numeric payloads, ON/OFF strings and comma decimals following donor conversion. The new host omits non-finite results so chart coordinates stay valid. Raw JSON objects, JSON property paths, the original curve/time-range controls, image export and persisted charts are outside this slice. Numeric text is not evaluated as code.

Each topic retains at most 240 points; the store is capped at 1,000 topics, matching the existing host topic bound. Invalid/non-finite samples do not allocate plot history. UI receives only the selected topic's series. Extreme finite values are normalized before computing SVG coordinates. Payload/topic limits are still enforced by the existing MQTT controller. Samples are in memory and survive Pause/Resume, not application restart.

## Evidence and isolation

`builds/native-plot-v0.13/TRANSFER.json` identifies original/recovered files, compiled output, every new host file, application version and installed hashes. `DEPENDENCIES.json` classifies the feature boundary. The active case identified by TRANSFER.json retains bounded real REA Evidence and a private original-byte export including the original license.

Recipient static analysis uses three byte-identical native-host source files copied into an explicit bounded source slice. Semantic-node/unknown budgets are 2,000 per analysis/per source, with provider coverage/truncation retained. The full preparation case is preserved separately in this build. The full VS Code/dependency implementation is outside that graph; the original paths and source hashes are retained. Native acceptance separately launches the actual copied application with extensions disabled. Neither a static graph nor the numeric-module oracle alone is treated as actual-host acceptance.

The recipient is a fresh copy of the earlier extension-free native VS Code lab, with its own portable profile and extension directory. Neither `/usr/share/code` nor the earlier native build is patched. Rollback is deleting this separate build. The original MQTT source/license remain unchanged; this is a private local demonstration rather than a marketplace publication.

## Rebuild and verify

From Yoinkr, with the existing v0.4 source/native showcase available:

```sh
npm run build:plot-transfer -- /path/to/new-native-plot-build
npm test
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  YOINKR_PLOT_BUILD=/path/to/new-native-plot-build \
  YOINKR_PLOT_EVIDENCE=/path/to/new-evidence-directory \
  npm run test:plot-native
```

The native test needs an available Xvfb executable (`YOINKR_XVFB` can select it). It uses a new private virtual display and an owned broker on an ephemeral loopback port, rather than the user's desktop or broker. It closes its application, publisher, broker and display after completion. The native launch path must fit Linux's IPC socket path limit; the launcher checks this.

Acceptance includes 12 explicit original/recovered conversion inputs and actual native UI checks of broker ingestion, finite filtering, plot rendering, Pause/Resume, per-topic reset, switching while paused, the 240-point bound, extreme values, Clear history and disconnect. `acceptance/VERIFICATION.json`, screenshots and process logs retain the results after installation. Unit tests separately check ring order/copy isolation, size/topic bounds and reset behavior. This proves the listed native feature subset, not full donor chart/UI equivalence.
