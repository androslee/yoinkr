# Windows verification and the remaining milestone 24 work

Milestones 1–23 and milestone 24's Linux delivery are implemented. **Milestone 24 remains open for native Windows recipient bindings and acceptance.** No Windows runtime, VM, or Windows runner was available in the development workspace. Wine, static executable inspection and a Linux test receipt would not establish native Windows application behavior.

## Run the core portability check

The new runner exercises published-bundle integrity, a fresh recipe export/import round trip and the delivery regression suite, including localhost workbench/MCP registration, permission gates, drift/input refusal and failure cleanup. It records the actual OS/architecture/Node version and method hashes. It never labels these checks as native recipient acceptance and does not accept a command-line platform override.

On a Windows x64 machine, obtain a source checkout and a Node version supported by `package.json`. Run `npm ci` once while networking is available to acquire that platform's dependencies. Then, from the checkout:

```powershell
.\scripts\verify-windows.ps1 -InstallCachedDependencies
```

This repeats installation with `npm ci --offline --ignore-scripts` and runs the check, saving a new evidence directory in the system temporary directory. An incomplete cache is a failure; there is no automatic online retry. Dependencies must be cached on Windows: Linux-specific optional packages do not establish a Windows cache.

To choose the evidence location, pass `-Out C:\yoinkr-proof\core-001`, using a new directory with an existing parent. Without the install switch, the wrapper uses the existing dependency installation. If local PowerShell policy disallows running the wrapper, the equivalent Node entry point is:

```powershell
node .\scripts\verify-portability.mjs --out C:\yoinkr-proof\core-001
```

No policy changes are required by Yoinkr. The Node entry point also runs on Linux for regression verification; its receipt then says `platform: linux`. `.gitattributes` keeps hash-pinned JSON/source files as LF in future Windows and Linux Git checkouts.

Retain `RESULT.json`, `METHOD.json`, `SUMMARY.txt` and `DELIVERY-TESTS.log`. Inspect `RESULT.json`: `nativeRecipientAcceptance` must still be `not-run` and `milestone24Complete` must still be `false`, even when core portability passes. Receipts provide integrity/provenance, not a signature or proof against manual alteration.

This wrapper has been exercised through its Node entry point on Linux. Its PowerShell execution and Windows result remain unverified until run on Windows. Do not publish Windows support based on the presence of this script.

## Native implementation and acceptance still required

A Windows engineer/agent needs the following actual inputs and checks. The existing Linux recipe pins and platform checks must stay intact; do not relabel their executable as Windows or remove the checks.

| Work | Existing implementation to adapt | Required result |
| --- | --- | --- |
| Original donor | `scripts/build-mqtt-donor.mjs`, `src/feature-electron.js`, `src/feature-drivers/donor.js` | Attested matching original MQTT Explorer source/dependency build with Electron 39.2.7 Windows x64; original app replay, owned broker and private profile. The builder currently rejects non-Linux systems. |
| VS Code binding | `src/host-adapters/vscode.js`, `recipes/vscode-raw-diff/adapter.json` | Obtain the official Windows x64 distribution; verify publisher acquisition integrity, PE executable identity, all source pins and unique real hook sites. Use a separate Windows adapter ID and exact recipe, not Linux fingerprints. |
| Joplin binding | `scripts/prepare-joplin-runtime.mjs`, `src/host-adapters/joplin.js` | Obtain and safely prepare the official Windows distribution; retain ASAR/native dependencies, exact pins and separate adapter ID. Verify safe-mode native textarea selection, IPC/profile isolation and sender checks. |
| Launch and UI replay | `src/host-adapters/*/launch.mjs`, `src/feature-drivers/{vscode,joplin}.js`, `src/delivery-acceptance.js` | Correct `.exe` selection, path/file URLs, native menu commands, Windows clipboard, controlled profiles and desktop session. Windows does not use Xvfb. |
| Process ownership | `src/feature-ownership.js` | Replace Linux `/proc` birth-time checks with a Windows implementation that identifies only owned processes and handles PID reuse; retain closure/leak evidence. Checking only the parent process is insufficient. |
| Delivery platform binding | `src/delivery.js`, `src/host-adapters/index.js` | Select a separately verified platform binding and package requirements. Keep unsupported platforms and combinations fail-closed. The current doctor deliberately rejects Windows. |
| Native acceptance | Frozen shared suite and original-vs-recipient comparator | Fresh original donor, minimal host and both actual recipients pass all 19 checkpoints each, plus the same declared-difference comparisons. Record exact versions and method hashes. |
| Lifecycle and rollback | Existing host/shared acceptance and guarded rollback | Verify installation, repeated open/use/close, persistence, drift refusal before either rollback mutation, restored original app editing and no owned app/browser processes left behind. |
| Public reproduction | Portable bundle and delivery runner | Fresh Windows source tree and empty build directories; explicit local inputs; repeat with cached dependencies and externally blocked networking while retaining loopback as needed. Preserve Linux regression results. |

Archive a native Windows result only after executing it on Windows. Review the retained receipt and source/hook bindings before adding a verified platform to the support matrix. Keep ambiguous or missing observations visible. The final milestone can be marked delivered only after this planned lane is fulfilled, or after the project owner explicitly revises its platform scope. GitHub publication remains a separate action; no workflow here publishes a repository or uploads evidence automatically.
