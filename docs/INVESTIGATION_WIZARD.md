# Investigation creation and explicit recovery (v0.9)

The local workbench now covers the first investigation/recovery loop in the browser:

1. Choose **New investigation**, donor and recipient applications.
2. Describe the feature, supply a concrete trace seed and choose a proposed transfer route.
3. Optionally scope analysis to exact donor/recipient source paths (one relative file per line). Dependencies outside this scope are not automatically included.
4. Create the investigation. Actual local REA analyzes both inputs and traces the donor feature. Status remains visible while the operation runs; partial failed Evidence remains in its generated case directory.
5. The resulting case appears immediately and opens **Export**. Check individual traced files, use **Select traced**, or add exact relative paths for original donor assets/files. Nothing is selected for extraction automatically.
6. Export the selected bytes to the case's private export folder. The new export becomes available immediately in **Report**; build a report to browse graphs, sources, provenance and history.

Successful static analysis or recovery does not mean a working feature transplant. Integration and donor/recipient behavioral acceptance still use the existing CLI recipes and native showcase builders. A case with no matching seed remains a valid static record, with no traced working set; refine the investigation/trace or explicitly select known assets.

## Register applications at startup

The default workbench registers the original donor/recipient paths of its existing MQTT case when they are available. To start with two other applications and no existing cases:

```sh
node src/cli.js workbench \
  --app /path/to/donor --app /path/to/recipient \
  --case-root ./cases --report-root ./reports
```

Repeated `--case` registers existing cases; repeated `--app` adds applications. With only `--app`, the default MQTT case is omitted. JS directories, supported Electron installation layouts and `.asar` archives use the existing REA workflow. No app is executed or modified by this wizard. Missing original applications produce startup warnings for old cases, whose retained query/report operations still work; explicitly supplied missing `--app` paths fail startup.

The browser chooses registered application IDs rather than arbitrary filesystem, output or executable paths. File/asset selection accepts only bounded relative paths within the chosen donor; existing recovery checks validate source hashes, containment, file sizes and extraction provenance. Unanalyzed assets are explicitly marked `analysisBound=false`, rather than presented as analysis-bound source.

New cases use generated `case-UUID` directories under a session's `case-root/workbench-UUID`. Reports likewise use generated directories. Both output roots must be outside registered case/application trees. Changing a registered application path or redirecting the output root is refused. Limits: 16 cases, 32 registered applications, 32 offered exports per case, 256 selected files / 64 MiB per export, existing 32 KiB API request limit, one operation at a time. Each REA call retains its existing deadlines and output limits; a three-call investigation can take several minutes.

## Persistence

Cases, original upstream Evidence, reports and recovered bytes stay on disk after shutdown. A page reload retains newly created case/export choices for the current server session. After restarting the server, register saved cases with `--case /printed/case/path` to continue; the workbench does not scan arbitrary disk locations or load case directories automatically. Job activity remains session-scoped. Original `case.json`, route and acceptance records are not rewritten by export/report operations.

## Validation

```sh
npm test
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:wizard
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:workbench
```

The wizard acceptance test uses the original local MQTT Explorer source and real REA, scoped to three donor files and one recipient file. It creates a case from an empty workbench, validates retained hashes, explicitly recovers one analyzed module and one extraction-only file, renders a source report, reloads the page, checks invalid selections and missing files, and verifies narrow layout/local-only traffic. This demonstrates investigation and recovery, not a new host integration or equivalence claim. `YOINKR_CASE` can select a compatible source case JSON; `YOINKR_WIZARD_EVIDENCE` chooses a new evidence directory.
