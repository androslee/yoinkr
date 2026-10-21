# Managed component process bridge — Yoinkr v0.24

Milestone 22 is delivered. An actual VS Code 1.142.0 native menu action calculates the CRC32 of the active saved file through the original compiled zlib library in a managed Python/ctypes process. This is a separate route from the recovered MQTT renderer feature. It uses no extension API, cloud service, model tokens or DSH integration.

## Try the retained recipient

```sh
node src/cli.js host-status builds/vscode-zlib-bridge-v0.24-release
node src/cli.js host-launch builds/vscode-zlib-bridge-v0.24-release
```

Open a saved local file, then choose **Yoinkr native → Checksum saved file** (`Ctrl+Alt+K`). The application-owned window shows the saved path, byte count, CRC32 and SHA-256. Its Calculate and Cancel controls invoke bounded operations. **Open file checksum** opens the window without starting Python. Closing the window removes its worker. A later action starts a newly verified worker.

The operation reads at most 1 MiB from the saved file on disk. Unsaved editor edits are intentionally excluded and the UI states this. The main process checks an ordinary file, opens without following a final symlink, reads bounded bytes, detects concurrent changes, closes the descriptor and passes bytes to the worker. It does not write the source file. CRC32 detects accidental changes; it is not a security signature.

## Identity and provenance

The process package digest is `1818f8eb83cbd61ec636cfff670fd5c4e2c3693414c04bb718ddb33041e72089`.

It retains the existing native component's exact library, original snapshot, headers, license, REA ELF evidence, recipe and native adapter. Library SHA-256 is `86200da370f20476a2507e9097a789b5ef97269b4ca8d5e164ad82dab9d99892`, zlib 1.3, little-endian Linux x86-64. The new framed worker is labelled newly written. The complete package reproduces with identical digest in a second output directory. Every retained original artifact is cross-checked against its original native-workspace hash; the new worker and package manifest have their own hashes.

The reviewed native ABI remains `uLong crc32(uLong, const Bytef *, uInt)` with 8-byte unsigned long and 4-byte unsigned int. This package preserves the whole compiled library rather than extracting a function body. libc and Python remain host dependencies. The selected interpreter is resolved and fingerprinted during adapter preparation and checked again before every child startup. The accepted interpreter here reports Python 3.12.3.

## Supervisor and protocol

`src/component-bridge.cjs` owns a child process with isolated Python mode, minimal environment and private stdio pipes. Four-byte big-endian lengths frame UTF-8 JSON. Version 1 messages have correlation IDs and a startup nonce. The initial handshake binds the package digest, library hash, zlib version and ABI before any operation can execute. Unknown operations and mismatched protocol versions fail. Only the registered CRC32 profile is exposed; there is no remote shell, arbitrary function/export selection or user-supplied worker path in the recipient UI.

Limits: 1,400,000 bytes per frame, 1 MiB decoded input per request, at most eight pending requests, 4 MiB queued input, one active request, startup deadline 2 seconds by default and request deadline 5 seconds by default. The library API accepts bounded deadlines from 20 ms to 30 seconds. Output parsing rejects malformed JSON/UTF-8, oversized/truncated frames, unsolicited or mismatched replies and invalid result values. Stderr retains a bounded diagnostic tail. Serialized writes prevent unbounded pipe buffering.

Errors distinguish integrity/startup, protocol, operation, crash, cancellation, timeout, queue and disposed states. Canceling queued work removes its timer/listener and bytes. Canceling active work terminates the owned child and fails pending calls. Forced termination follows a short grace period. A crash explicitly fails pending calls without replay. A subsequent user request verifies bytes/interpreter and completes a fresh handshake; no failed request is silently repeated. Shutdown and feature-window disposal await owned child exit, including already retiring workers.

Separate-process execution is a lifecycle/isolation boundary, **not a hostile-code sandbox**. The reviewed Python code and native library run with ordinary user permissions. Constructors and dependencies can execute. This proof does not establish arbitrary native-code portability or whole-application equivalence.

## Acceptance

- 16 original checksum vectors agree with the independent bitwise JavaScript reference; explicit known vectors and a Python-standard-library check also agree.
- 15 real bridge checks pass: malformed JSON, oversized frame/request, wrong protocol, invalid payload, unknown operation, active cancellation, forced crash, fresh restart, changed-package refusal and cleanup.
- 100 repeated checksum requests reuse one child and leave the queue empty.
- 30 actual recipient checks pass: real menu/action, sandbox/sender validation, saved-file policy, visible crash/cancel behavior, restart, size bounds, source preservation, ten feature-close cycles and app shutdown.
- Four separate-copy rollback checks pass: changed-worker refusal, dry run, complete original-file restoration/removal and real original-app launch without the bridge menu.
- 237 unit tests and 13 standalone MCP checks pass.

Warm process request p50/p95 in milliseconds, with two warmups and ten samples at each size:

| Bytes | p50 | p95 |
| --- | --- | --- |
| 0 | 0.03 | 0.03 |
| 1,024 | 0.04 | 0.04 |
| 65,536 | 0.82 | 0.90 |
| 1,048,576 | 6.90 | 9.38 |

These timings include serialization, pipes, native computation and response. They are not pure transport overhead or a speedup claim. The raw report retains separate JavaScript-reference timings. Worker RSS was 30,720 kB, peak virtual memory 44,364 kB, one thread and three file descriptors after the measured workload. Node heap snapshots are diagnostic, not forced-GC retained-heap gates. Queue/count/byte bounds are enforced. Results describe this machine and pinned runtime.

## Reproduce

Prepare a native workspace using [the native component guide](NATIVE_COMPONENTS.md), or select the retained verified workspace. Building and inspecting the process package do not execute native code:

```sh
node src/cli.js component-build /path/to/native-workspace --out /path/to/new-component
node src/cli.js component-status /path/to/new-component

node src/cli.js host-plan recipes/vscode-zlib-bridge/adapter.json \
  --input-root /path/to/original-vscode --feature-package /path/to/component \
  --python /absolute/path/to/python3

node src/cli.js host-apply recipes/vscode-zlib-bridge/adapter.json \
  --input-root /path/to/original-vscode --feature-package /path/to/component \
  --python /absolute/path/to/python3 --out /path/to/new-recipient
```

The reference recipe pins the retained complete package digest and six exact VS Code fingerprints. A newly prepared native workspace may have different provenance metadata and therefore a different full digest; inspect it and explicitly bind a new recipe instead of editing an old package or claiming an identical artifact. This release is a pinned local proof. Portable fresh-checkout distribution remains milestone 24.

Set `PLAYWRIGHT_MODULE` to an installed Playwright module; recipient tests require Xvfb. Explicitly selected reviewed application/component code is executed during these tests.

```sh
npm run test:component-bridge -- --package /path/to/component \
  --python /absolute/path/to/python3 --out /path/to/new-bridge-proof
npm run test:component-recipient -- --adapter /path/to/recipient \
  --xvfb /path/to/Xvfb --out /path/to/new-recipient-proof
npm run test:component-rollback -- --runtime /path/to/original-vscode \
  --package /path/to/component --recipe recipes/vscode-zlib-bridge/adapter.json \
  --python /absolute/path/to/python3 --xvfb /path/to/Xvfb --out /path/to/new-rollback-copy
```

After completed checks, `npm run seal:component-proof -- <proof-root>` appends an integrity index. Seal the rollback copy's `rollback-proof` subdirectory too. Profiles/session data and deliberate modified-package fixtures are excluded; source snapshots and raw results remain indexed. `npm run report:component-bridge --` takes `--bridge-proof`, `--recipient-proof`, `--rollback`, `--adapter`, `--package`, `--repeat` and `--out`, verifies results and hashes, and writes new standalone dark HTML with embedded screenshots. `--repeat` selects a second identical component-package build.

Close the lab application before applying rollback. `host-rollback` uses the existing hash-checked playbook engine. Normal installed apps/profiles remain outside the prepared copies. Private binaries, profiles, evidence and reports are excluded from the npm package.

Release outputs: `builds/zlib-process-package-v0.24`, `builds/zlib-process-package-v0.24-repeat`, `builds/vscode-zlib-bridge-v0.24-release`, `builds/component-bridge-proof-v0.24-release`, `builds/component-recipient-proof-v0.24-release`, `builds/component-rollback-v0.24/rollback-proof`, `reports/component-bridge-v0.24.html` and `evidence/v0.24/VERIFICATION.json`.
