# Reusable Electron playbooks (v0.14)

A playbook applies a reviewed set of main-process, preload, renderer and asset files to a **new copy of an extracted Electron runtime**. It never patches the installed app. The engine plans, copies, checks and restores files; it does not run the payload or application, install packages, or execute hooks. Launching the copied app is a separate explicit action.

## Try the delivered example

From the Yoinkr project directory:

```sh
./builds/playbook-v0.14/launch-code.sh
```

In the native MQTT window click **Check native integration**. The renderer calls one fixed preload method; a main-process IPC handler validates the sending window, main frame and exact local page before returning bounded information. No VS Code extension is involved. The new button reports the Electron version and the main → preload → renderer round trip.

This example builds on the existing v0.13 recovered MQTT plotting showcase. The new information button and its IPC code are integration glue, not another recovered donor feature. The example retains the existing context isolation, sandbox, disabled renderer Node integration, navigation checks and original MQTT behavior.

- `builds/playbook-v0.14/playbook/playbook.json`: reusable, pinned manifest and adjacent payload files.
- `builds/playbook-v0.14/PLAN.json`: read-only preparation result, roles, hashes and runtime size.
- `builds/playbook-v0.14/workspace/runtime`: reviewable patched application.
- `builds/playbook-v0.14/rollback-check`: separate copy that was rolled back and actually relaunched.
- `builds/playbook-v0.14/acceptance/VERIFICATION.json`: native acceptance and two screenshots.

The example launcher uses a private portable profile beneath the workspace and disables updates and telemetry. It does not read the normal VS Code profile. Automated acceptance uses its own virtual display, extensions disabled, software rendering and a test profile. The application is closed before rollback.

## Generic commands

```sh
node src/cli.js electron-plan /path/to/runtime --recipe /path/to/book/playbook.json
node src/cli.js electron-apply /path/to/runtime --recipe /path/to/book/playbook.json --out /path/to/new-workspace
node src/cli.js electron-status /path/to/new-workspace
# Close the copied application before either rollback step:
node src/cli.js electron-rollback /path/to/new-workspace --dry-run
node src/cli.js electron-rollback /path/to/new-workspace
```

`electron-plan` reads and checks only. `electron-apply` requires an absent output directory outside the source and playbook directories, checks again after copying, and removes its own incomplete new workspace on failure. Existing output directories are refused, including nonempty directories. CLI status returns a failing exit code on tracked drift.

To build another copy of the delivered demonstration:

```sh
node scripts/applications/build-electron-playbook.mjs \
  --source ./builds/native-plot-v0.13/code --out ./builds/my-playbook-lab
```

The demo builder constructs the three role-specific payloads from the known host source and generates its exact hashes. It does not infer compatibility with unknown apps. The generic engine accepts the resulting manifest independently of that builder.

## Manifest format

Schema 1 has `kind: "electron-playbook"`, a stable `id`, a `target` and `files`:

```json
{
  "schema": 1,
  "kind": "electron-playbook",
  "id": "native-host-info",
  "target": {
    "app": "resources/app",
    "name": "Code",
    "version": "1.142.0",
    "main": "./modkit-bootstrap.mjs",
    "type": "module"
  },
  "files": [
    {
      "role": "preload",
      "file": "modkit-native/preload.cjs",
      "payload": "preload.js",
      "beforeSha256": "<exact SHA-256 of recipient file>",
      "afterSha256": "<exact SHA-256 of payload>"
    }
  ]
}
```

The angle-bracket values illustrate fields; use real 64-character lowercase hashes as in the shipped manifest. Paths are forward-slash relative paths without traversal, backslashes or symlink parents. `target.app` is relative to the runtime directory containing the Electron binary. `file` is relative to that application directory. `payload` is relative to the manifest directory. `role` is `main`, `preload`, `renderer` or `asset`; it describes the reviewed responsibility and is not an automatic security guarantee. `beforeSha256: null` explicitly creates an absent file. Existing files require their exact original hash. Payloads are complete resulting files, avoiding ambiguous text replacements.

All four package fields must match exactly. An omitted package `type` means `commonjs`. A changed version, entry point, module format, recipient file or payload is a refusal requiring renewed review. There are no permissive version ranges or force bypass. To change the package entry point, include `package.json` as an explicitly hashed main-role operation. Do not remove unrelated package fields.

When preparing other features, retain the investigation case, original export and donor provenance separately. These playbooks deliver approved bytes; they do not replace REA analysis, dependency classification, donor behavior comparisons or recipient acceptance.

## Rollback and retained evidence

The workspace stores its own manifest, original file bytes, original modes, original package hash, before/after hashes and created-directory list in `.modkit-playbook`. Metadata is private to the current user. Rollback preflights **all** tracked files and backup hashes before touching any file. A changed package or tracked file causes refusal rather than overwriting edits. Dry-run performs the same checks without writes. Successful rollback restores originals and modes, removes only explicitly created files and empty directories, and preserves unrelated files and profile directories. Do not delete the metadata until rollback is no longer needed. Hash checks detect drift/corruption; they are not signatures against an attacker who can rewrite the workspace metadata.

Tracked status covers the declared files and package, not every byte of the entire application. Keep the copied application closed and avoid concurrent writers during apply/rollback. No generic tool can undo unrelated modifications or recover a deleted original backup. An interrupted rollback may need manual recovery from retained bytes; this release does not claim crash-proof multi-file transactions.

## Scope and bounds

This release is verified on a Linux extracted VS Code runtime. It refuses packed ASAR input, external/absolute runtime symlinks, special files and symlink patch/payload paths. Internal relative runtime symlinks are preserved as relative links in the new copy. It does not bypass signed applications, repack ASAR, repair native ABI mismatches or discover unknown app bootstraps. An extracted application's original dependencies must already be present.

Playbooks contain 1–256 operations; each payload/original is at most 32 MiB, all changed bytes at most 96 MiB. Runtime copies are bounded to 50,000 entries and 3 GiB. Metadata is capped at 4 MiB. No runtime code is evaluated to establish compatibility. The separate launcher is deliberately specific to this showcase, not an arbitrary executable endpoint in the web workbench.
