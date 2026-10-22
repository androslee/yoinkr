# Version assessment and repair — Yoinkr v0.25

Naming update: Yoinkr 0.28 uses rebranded current recipes. The milestone results and digests below describe the earlier recorded builds; those records are retained unchanged. See [rename and compatibility](RENAMING.md).

Milestone 23 is delivered for a real pair of official Linux x86-64 VS Code builds: supported **1.142.0** and distinct **1.141.0**. A read-only assessment detects an unchanged case, proposes a fresh-copy repair for the changed version, and refuses an intentionally ambiguous workbench. Actual native/shared/rollback acceptance precedes publication of the second recipe. Previous recipes, runtime copies and reports are retained.

This is a scoped repair workflow for the registered Raw/Diff host binding, not automatic compatibility with arbitrary future apps/versions. This demonstration runs toward an earlier release to exercise a real changed-version pair. Both recipients report Electron 43.7.7. The recovered feature package remains unchanged at digest `ae4147da86e3bce2e2e5744d6b0bb71edf6998f250f0949719cc99e287f27f48`; Joplin requires no package revision or new integration.

## Delivered change

The original bundle uses broker `Vc`; the official 1.141.0 bundle uses `Dc`. Merely finding a moved string or changing a version number would leave injected replies pointing at the wrong broker. The repair resolves the broker's declaration back to `globalThis.vscode.ipcRenderer`, checks the surrounding syntax and constructor bindings, then generates both selection and theme replies with that exact identifier. Exact recipient fingerprints and patch-output hashes still gate application.

The original `recipes/vscode-raw-diff/adapter.json` remains unchanged. The new `recipes/vscode-raw-diff-1.141/adapter.json` declares the second version's six hashes and explicit hook binding. The underlying adapter accepts only the two reviewed versions and registered broker forms. Unknown identities, capabilities, ambiguous matches or altered contracts are blocked for further investigation. A proposal is marked `validated:false`; creating it does not promote support or execute an app.

## Read-only assessment

```sh
node src/cli.js adapter-assess recipes/vscode-raw-diff/adapter.json \
  --reference /path/to/original-1.142.0 \
  --candidate /path/to/original-1.141.0 --out /path/to/new-proposal
```

The assessment first checks the existing reference binding. It hashes the candidate's six fingerprint files, parses its full workbench with pinned Babel parser 8.0.4, and requires:

- One `vscode:runAction` registration, async callback with the reviewed rest-argument contract and exact initial argument setup.
- A unique immutable IPC identifier and namespace declaration leading to `globalThis.vscode.ipcRenderer`.
- One constructor sequence assigning title/theme/notification services from the expected parameters.
- Presence of the required editor/theme member names in the bundle.
- Exact source matching and deterministic injected-output hashes.

The output contains `PROPOSAL.json`, candidate recipe, original/new source hashes, source ranges, broker mapping, capability constraints and limits. Ranges use **UTF-16 string indices in decoded UTF-8 text**, as Babel does; excerpt SHA-256 values bind their actual UTF-8 bytes. Inputs are read only and output must use a new directory outside them. Parse failures, duplicate handlers, missing bindings or unsupported targets produce a retained blocked proposal and CLI failure status.

These syntax constraints are a candidate screen, not a proof that a method behaves correctly. Real host input, sandbox/sender boundaries, services, persistence, shared donor scenarios and rollback remain required before the binding is called verified.

## REA evidence boundary

The first full-workbench attempt exceeded its 16 MiB output admission budget. It is retained as explicitly failed under `builds/version-repair-v0.25/full-analysis-attempt/`; its truncated bytes are not a successful Evidence envelope.

The successful bounded analysis extracts exact hook ranges and immutable namespace/broker declarations from each full-bundle AST result. Small `const` and class wrappers are newly written for **static analysis only**. Extraction records retain complete original-source hashes, ranges, exact text, excerpt hashes and wrapper hashes. REA analyzes those harnesses and compares their authenticated Application Graph evidence. It does not execute either app or compare a complete application graph.

`EVIDENCE.json`, both original REA envelopes and `comparison-rea.json` retain identities and limitations. The comparison reports three changed items and **ten unknown frontiers**. Those unknowns remain visible; they are not treated as compatible. Full-bundle structural checks and actual native tests establish the accepted named integration separately.

## Apply and verify a candidate

Review the concrete proposal, then prepare another fresh copy with the same frozen feature package:

```sh
node src/cli.js host-apply /path/to/proposal/candidate-adapter.json \
  --input-root /path/to/original-1.141.0 \
  --feature-package /path/to/verified-package --out /path/to/new-recipient

node src/cli.js host-status /path/to/new-recipient
node src/cli.js host-launch /path/to/new-recipient
```

No normal application installation/profile is selected. The exact-version playbook, launcher hashes, saved session, native editor input and removal rules remain in force. Close the lab app before `host-rollback`; drift refuses rollback rather than overwriting unknown changes.

Set `PLAYWRIGHT_MODULE` to an installed Playwright module and supply Xvfb for Linux native checks:

```sh
npm run test:vscode-adapter -- --adapter /path/to/new-recipient \
  --out /path/to/new-native-proof --xvfb /path/to/Xvfb

npm run test:repaired-host -- --original /path/to/old-recipient \
  --repaired /path/to/new-recipient --donor-run /path/to/passed-donor-run \
  --out /path/to/new-shared-proof --xvfb /path/to/Xvfb
```

Acceptance delivered:

| Case | Result |
| --- | --- |
| Exact original version | `unchanged-compatible`, no application execution |
| Real changed version | `candidate`, unique reviewed broker repair |
| Deliberately duplicated real handler | `blocked`, two selection handlers |
| Missing capabilities/changed bindings | Refused by structural unit cases |
| Actual 1.141.0 recipient | 23 native checks pass, including unsaved selections, services, restart, drift and real rollback |
| Shared donor suite | 19 checkpoints on 1.142.0 and 19 on 1.141.0; zero unapproved differences |
| Owned resources | Both runs close their app processes |
| Regression verification | 241 unit tests and 13 standalone MCP checks pass |

The original donor Ctrl+A defect remains an explicitly approved difference, as in milestone 20. The donor run is retained rather than recaptured or relabelled. Rollback restores the changed version's original files and removes feature assets; the original app was launched afterward without the adapter menu. Earlier version bindings/reports remain preserved.

## Acquisition and release evidence

The second runtime came from Microsoft's official [pinned 1.141.0 archive endpoint](https://update.code.visualstudio.com/1.141.0/linux-x64/stable). The 360,484,982-byte archive SHA-256 was `d77d588f0454cbaaa71e723497de4160d15b95fba4988abe177b1432e6bd570a`, matching the official response's `X-SHA256` before extraction. Acquisition metadata and the archive remain cached locally; native replay does not require network access. The original `/usr/share/code` runtime is only read and fingerprinted.

Local outputs:

- `builds/version-repair-v0.25/assessment/`: proposal, exact excerpt receipts and bounded REA evidence.
- `builds/version-repair-v0.25/unchanged/` and `ambiguous/`: distinct retained acceptance cases.
- `builds/version-repair-v0.25/shared/`: both real version replays, raw/normalized observations and cleanup.
- `builds/vscode-repaired-v0.25/acceptance/`: native tests and restored-app screenshots.
- `builds/vscode-repaired-v0.25/rollback-workspace/`: restored original version.
- `reports/adapter-repair-v0.25.html`: offline dark report.
- `evidence/v0.25/VERIFICATION.json`: release checks, hashes and promotion record.

Use `scripts/applications/seal-second-host.mjs <completed-proof>` to append indexes to assessment/shared/native proof directories. `npm run report:adapter-repair --` accepts `--root`, `--adapter`, `--original`, `--donor-run`, `--out`; it verifies indexes, source preconditions, exact candidate patch, both donor comparisons and native outcomes before creating new HTML. Reports embed screenshots and preserve unresolved evidence. Hashes detect later changes; they are not signatures.

The project remains standalone. No DSH, model tokens or agent-host configuration is required. Original binaries, application profiles and private build outputs remain excluded from the npm package. Portable fresh-checkout delivery and the guided UI/MCP journey remain milestone 24; GitHub publication is a separate explicit action.
