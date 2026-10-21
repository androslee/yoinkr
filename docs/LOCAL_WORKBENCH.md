# Interactive local workbench (v0.12)

Start from the Yoinkr project directory:

```sh
npm run workbench
```

Open the printed `http://127.0.0.1:4195` address. The default registers the installed MQTT Explorer investigation. If the port is occupied, the command fails without stopping another service; choose another port or `0` for an available port:

```sh
node src/cli.js workbench --port 0 \
  --case ./cases/first-feature --case ./cases/second-feature
```

Cases and application paths are explicitly registered at startup; the browser cannot browse arbitrary server files or add arbitrary executable/output paths. The investigation wizard can create a new case from registered donor/recipient applications. Up to 16 case paths are accepted. Each case's original donor/recipient/trace Evidence is validated, and up to 32 regular export directories under its private folder are offered. New wizard cases and browser exports register immediately; manually added cases/exports require registration on restart. The recorded application data stays local; no model tokens or external service are needed.

## Use it

1. Choose a registered case and donor/recipient side.
2. **Query:** choose summary, module references, exact module or observation properties. Paths/properties take one exact value per line; exact module accepts one path or canonical node ID. Facts can discover available keys. Module/fact pagination is explicit.
3. **Trace:** supply a concrete module/string/API/IPC/route/node/native-export seed and traversal direction. This reuses retained parent Evidence rather than re-analyzing the live installation.
4. **Examples:** record ordered actions, expectations, manual outcomes and an optional PNG screenshot. See [observable examples](OBSERVABLE_EXAMPLES.md). These remain distinct from automated verification.
5. **Verify:** run selected examples with explicit JSON inputs against a startup-registered working copy. See [replay checks](REPLAY_CHECKS.md).
6. **UI checks:** run an explicitly registered local browser recipe against application/fixture snapshots; see [UI replay](UI_REPLAY.md).
7. **Report:** optionally select an existing recovered-source export and a history limit. Build a fresh standalone report with graphs, sources and saved query/trace history. The preview is isolated from the workbench controls; result metadata is available under Result details.

One operation runs at a time. Ordinary API request bodies cap at 32 KiB; the dedicated example endpoint accepts up to 6 MiB for a bounded PNG attachment. Activity shows completion/failure, and View revisits the session's results. Job descriptions cap at 64 KiB, with an explicit display truncation marker. Complete query/trace Evidence remains in the case. Validation/backend errors appear clearly and release the controls. Changing the selected case does not redirect an operation already submitted.

New reports are saved under `reports/workbench-UUID/` by default. `--report-root /path/to/reports` chooses another trusted startup output directory; outputs must stay outside the cases and original applications. Earlier reports, original Evidence, case acceptance and live applications are preserved. The UI also creates new donor/recipient investigations and explicitly recovers selected source/assets: see [the wizard](INVESTIGATION_WIZARD.md). Source editing, integration recipes and installing features into live applications remain the CLI/builder workflow.

## Session and shutdown

The server binds only `127.0.0.1`. Open the exact printed address, rather than changing it to another hostname. API requests require the current session token and correct Host/Origin; report serving requires the workbench's HttpOnly SameSite cookie. Reports are previewed in a sandbox without access to the parent controls. No generic filesystem or shell execution endpoint is exposed.

The latest 32 jobs stay in memory for this session; retained case artifacts and reports remain on disk after shutdown. Reloading the page restores the current server's job list. Restarting creates a new session, case/export selectors and report URL registry; pass --case with each saved case path to register wizard-created cases again. Earlier report files can still be opened directly as standalone HTML.

Ctrl+C in its terminal closes only this workbench. Shutdown finishes an active operation so its Evidence can be retained (subject to existing REA deadlines). It does not stop DSH or the original donor/recipient applications. This is a foreground local utility, not a new managed system service.

## Verification

`npm test` includes loopback registration, boot-data escaping, missing token, foreign Host/Origin, unknown cases/options/exports, payload size, one-active-job behavior, failure recovery and session-scoped report serving.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:workbench
```

The browser test uses private copies of the actual MQTT case and recovered export. It selects cases, runs real REA queries/traces, generates an actual source/history report, checks iframe isolation, theme controls, invalid-input recovery, original-case preservation and local-only browser traffic. `YOINKR_CASE` selects a different existing donor case; `YOINKR_WORKBENCH_EVIDENCE` selects a new evidence directory.

## Portable feature delivery

Start with `node src/cli.js workbench --delivery-config /path/to/delivery.local.json`, then choose **Delivery**. No existing case or DSH host is needed. The registered configuration supplies local inputs for prerequisites, recipe export/import, fresh two-recipient installation, original-donor comparisons, current integrity and guarded restoration. [Input acquisition, steps, reports and platform limits](PORTABLE_DELIVERY.md).
