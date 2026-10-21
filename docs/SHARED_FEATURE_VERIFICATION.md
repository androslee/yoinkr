# Shared donor / recipient verification — Yoinkr v0.22

Naming update: Yoinkr 0.28 uses rebranded current recipes. The milestone results and digests below describe the earlier recorded builds; those records are retained unchanged. See [rename and compatibility](RENAMING.md).

Milestone 20 is delivered. A single bounded semantic suite now runs against the unchanged MQTT Explorer donor, the recovered minimal host and a fresh actual Microsoft VS Code 1.142.0 recipient copy. This verifies the named Raw/Diff feature; it does not establish whole-application equivalence or compatibility with other recipient versions.

The suite is `recipes/mqtt-shared-acceptance/suite.json`. Nine scenarios cover all seven frozen baseline scenarios with 19 checkpoints per environment. Drivers implement topic/editor input, mode, history, selection, clipboard, theme and resize actions. Every checkpoint retains supplied input, raw observations and normalized observations; five screenshots per environment retain structure and controls. Each run records hashes of its driver implementation; the complete acceptance method is archived before replay. Owned apps, temporary profiles, broker and display are closed afterward. Only this run's PIDs are inspected, using process birth times to avoid PID reuse.

## Delivered proof

| Level | Actual result |
| --- | --- |
| Original formatter module | 5 vectors executed in the original webpack module |
| Recovered component | 20 browser checks per recovery route, 40 total; root lifecycle exercised separately |
| Frozen original app | Unchanged baseline: 83 actions, 38 assertions |
| Shared semantic suite | 19 checkpoints × 3 environments, all pass |
| Real recipient | 23 native checks, including editor input, services, disposal and rollback |
| Deliberate faults | Broken output, missing CSS, stale selection and leaked IPC subscription all fail their actual checks |
| Actual host lifecycle | 50 open / use / close cycles; forced-GC heap and subscription gates pass |

The original frozen recipe remains SHA-256 `c6c80e0726fa75a7b4bc74e5bb1f417a5482490d7b7f292703d40c5dd5e62a86`. Common replay complements the original capture; it does not silently replace or weaken it. Failed assertions keep the driver run and comparison failed even when every action executes successfully. Comparison verifies all registered artifact hashes, scenario identity, observation completeness and raw-to-normalized derivation.

## A defect caught and fixed

The previous package displayed history oldest-first. Original MQTT Explorer displays newest-first. Common replay detected this; package 1.1.0 reverses only the history adapter's presentation and maps clicked rows back to chronological API indices. Original recovered sources remain unchanged. Package schema still accepts old 1.0.0 proofs.

The repaired source package digest is:

`ae4147da86e3bce2e2e5744d6b0bb71edf6998f250f0949719cc99e287f27f48`

The repaired bundle-route package digest is:

`84953fda1d86d92f00756dc45bda45d95517a60fe7d1a0f9dce8f0bdf3c4caed`

Both routes reproduce twice at different directory depths and emit byte-identical renderer payloads: `678eb709db05873e34e5ab78f81eadf34b89dc3411f55343e47524465d468397`. Per-route package digests differ because provenance differs. The reference VS Code adapter now pins the repaired source digest. The v0.20 package and v0.21 recipient copy remain historical artifacts. Milestone 21 should reuse this repaired source digest unchanged.

## Explicit differences

Normalization excludes outer application chrome, topic URI labels, history timestamps and excluded chart affordances. It retains payload values, history order, token text/colors, line backgrounds, fonts, line heights, hunk counts and clipboard bytes. Empty MQTT messages remove the topic in the original app; an empty component container is the recorded host variant. Nonempty broken output cannot be normalized to empty.

The original Ctrl+A handler searches for `pre ~ pre`, which no longer matches wrapped gutters. Our precise keyboard check observes that original defect. The package's previously declared `:scope > pre` patch works. Only this measured false-to-true selection difference is approved, with its raw evidence; no generic keyboard difference is ignored. Original mutable-topic stale rendering is handled by explicit parent/leaf reselection recorded in the driver trace.

Optional donor Save and ordinary recipient editor Save produced the same 23 bytes and SHA-256. These are separate file-service outcomes. The copied donor Save control remains excluded by the frozen feature scope.

## Performance scope and results

Final measurements use policy version 2, written to `POLICY-BEFORE-RUN.json` before execution. The initial larger-donor run failed: the unchanged original backend (`backend/src/index.ts`) slices incoming MQTT buffers at 20,000 bytes. Therefore identical, untruncated combined corpora of approximately 1 KiB and 10 KiB are compared; 100 KiB is explicitly recipient-only stress. The source hash and applicability decision are in the policy. Timing and heap thresholds were not relaxed. The failed earlier run remains available.

Ten measured startup samples per pristine/adapted runtime alternate their order. Shared update measurements have two warmups and ten samples per corpus and environment; the 100 KiB recipient case also has ten samples. Feature opening has five warmups before 50 measured real windows.

| Measurement | Result | Gate |
| --- | --- | --- |
| Host startup p95 | Pristine 1933.0 ms; adapted 1966.3 ms; +33.3 ms | Larger of 200 ms or 10% |
| Warm open p95 | 151.1 ms | 1000 ms |
| Main retained heap | 14,954,952 → 14,919,484 bytes after forced GC | Growth ≤ larger of 16 MiB or 10% |
| IPC / app listeners | 16 → 16 / 33 → 33 | No growth |
| Timers / processes | 3 → 1 / 8 → 8 | No timer growth; at most 2 spare processes |
| Feature windows after cycles | 0 | 0 |

Renderer CPU uses DevTools `TaskDuration` deltas around committed comparisons and includes each application's respective window/container work. Its p95 overhead passes the larger-of-50-ms-or-25% budget at both shared sizes. MQTT transport and native editor input have different costs, so their wall times are retained separately. These numbers are not a pure-component or end-to-end speedup claim. Results describe this machine and pinned software, not a universal performance guarantee.

The measurement method snapshot was captured after the completed run and is labelled accordingly; the policy was written before measurement. An append-only integrity index binds the raw measurements, module results, negative checks, policy and method snapshot. Hashes detect subsequent changes; they are not signed attestations.

## Reproduce

No DSH or model tokens are required. Use the cached/pinned original donor, recovered package, actual recipient copy and native dependencies documented in the baseline/package/host guides. Original app and test runtime acquisition/building may need network access. Set `PLAYWRIGHT_MODULE` to an installed Playwright module. Xvfb is required for isolated Linux native-app tests. These commands execute the explicitly selected donor/recipient applications in owned test profiles.

```sh
node src/cli.js feature-shared recipes/mqtt-shared-acceptance/suite.json \
  --input-root /path/to/original-donor \
  --feature-package /path/to/verified-package \
  --recipient /path/to/verified-vscode-adapter \
  --xvfb /path/to/Xvfb --out /path/to/new-shared-proof

node src/cli.js feature-compare /path/to/shared-proof/donor \
  /path/to/shared-proof/recipient --out /path/to/new-comparison.json

npm run benchmark:shared-feature -- \
  --donor /path/to/original-donor \
  --recipient /path/to/verified-vscode-adapter \
  --xvfb /path/to/Xvfb --out /path/to/new-measurement-proof
```

After measurements, run `npm run seal:shared-measurements -- /path/to/new-measurement-proof` before changing any driver or benchmark sources. This adds the labelled post-run method snapshot and integrity index without replacing proof files.

The report script takes explicit `--shared`, `--measurements`, `--baseline`, `--packages`, `--recipient` evidence roots and `--out` new HTML path. It rechecks indexed artifacts, comparisons and numeric gates, keeping the four expected failures separate from positive acceptance. The measurement root needs an `INTEGRITY.json` index of `{files:[{path,sha256,bytes}]}`; the retained release index includes the policy, results, raw observations, faults and method snapshot. Report output is standalone, dark, offline HTML with embedded screenshots and an explicit content policy.

Retained release artifacts are local outputs, excluded from the npm package:

- `builds/shared-acceptance-v0.22-release/`: successful three-environment replay, archived sources, comparisons and owned-process cleanup.
- `builds/shared-acceptance-v0.22-baseline/`: unchanged frozen original-app capture.
- `builds/shared-acceptance-v0.22-measurements-final/`: passing performance, lifecycle, module, file-service and fault proofs.
- `builds/mqtt-raw-diff-v0.22/`: twice-built source/bundle packages and both component proofs.
- `builds/vscode-raw-diff-v0.22/`: actual recipient integration and rollback proof.
- `reports/shared-acceptance-v0.22.html`: readable report.
- `evidence/v0.22/VERIFICATION.json`: release checks and installed source hashes.

Earlier failed attempts remain under their original build directories. They are excluded from the passing release result, rather than overwritten or relabelled.
