# Yoinkr naming and compatibility

The project was renamed from Modkit to **Yoinkr** in version **0.28.0**.

> Your favorite features. In your favorite apps.

## Names to use now

* npm package and installed command: `yoinkr`.
* Product, workbench, generated reports and new native menus: **Yoinkr**.
* Environment settings: `YOINKR_HOME`, `YOINKR_PROFILE_SUFFIX` and other `YOINKR_*` names shown in the guides.
* MCP client fragment: `mcpServers.yoinkr`; discover tools with the `yoinkr_` prefix.
* Local project directory: your `yoinkr/` checkout.

Run from a source checkout with the existing `node src/cli.js ...` and `npm run ...` commands. Installing the package through npm provides the `yoinkr` executable. This rename does not install a global npm command, publish a package/repository or edit any AI host configuration.

When renaming an existing local checkout, an optional `modkit` → `yoinkr` directory symlink can preserve open IDE tabs and recorded input paths. Fresh clones do not need this alias. Generated client fragments use your current checkout path.

## Workspace metadata is still `.modkit/`

The 0.28.0 rename covered the product name, the npm package and command, the
`YOINKR_*` settings, the home directory and the MCP fragment. It did **not** cover the
workspace metadata directory. Integration still creates `.modkit/` inside every new
workspace -- `workspace.json`, `recipe.json` and the `oracle/` snapshot live there --
and `validateRecipe` refuses a feature mount that would collide with it.

This is current behavior, not a fallback: there is no `.yoinkr/` workspace equivalent
to migrate to. It is recorded here because a reader who finds a tool called Yoinkr
writing `.modkit/` directories has no other way to tell whether that is deliberate.

Renaming it would invalidate existing workspaces, every recorded workspace path and the
`.modkit` entries that recipient copying and library scanning skip by name. If it is
ever renamed it should be a single breaking release that reads both names and writes
only the new one.

## Proposed deprecation horizon

The compatibility shims below have no end date, which makes them permanent by default.
These are proposals for the maintainer to confirm or change, not decisions:

| Shim | Where | Proposed |
| --- | --- | --- |
| `MODKIT_HOME` environment variable | `src/branding.js` | Warn on use in the next minor; remove in 1.0.0 |
| `~/.modkit` home directory fallback | `src/branding.js` | Keep through 1.0.0 -- it protects real user state and costs one `existsSync` |
| `MODKIT_VERSION` export | `src/version.js` | Remove in 1.0.0; `YOINKR_VERSION` has been the documented name since 0.28.0 |
| `MODKIT_*` names in launchers and native profile adapters | launcher and adapter paths | Follow `MODKIT_HOME` |
| `.modkit/` workspace metadata directory | `src/workspace.js`, `src/library.js` | Not a shim; see the section above |
| `modkit` -> `yoinkr` checkout symlink | local only, never created automatically | No action; it is a user convenience |

Whatever is chosen, recording it here turns an open-ended compatibility surface into a
scheduled one.

## Settings and agent clients

`YOINKR_HOME` takes precedence over `MODKIT_HOME`; an explicit `--home` takes precedence over either. New users default to `~/.yoinkr`. If only `~/.modkit` already exists, Yoinkr uses it so existing mods, pins and disabled-state records remain available. If both directories exist, `~/.yoinkr` wins. No automatic copy or overwrite of settings is performed.

Launchers and scripts prefer `YOINKR_*` settings and accept the old `MODKIT_*` environment names. Native profile adapters provide both names when starting an older recipient copy. Existing named profiles can still be selected.

Generate a current MCP fragment from your own checkout and registrations:

```sh
node src/cli.js mcp-config --config ./agent.json --out ./yoinkr-client.json
```

Refresh the client's discovered tools after using the new server. Tool names are now `yoinkr_catalog`, `yoinkr_job`, `yoinkr_result` and the other documented `yoinkr_*` names. The direct JavaScript agent API accepts the old `modkit_` prefix as an alias, while the MCP catalog advertises current names. Existing client fragments are not rewritten automatically. The source compatibility export `MODKIT_VERSION` remains an alias for `YOINKR_VERSION`.

## Stable formats and recorded evidence

Some internal identifiers deliberately retain their original spelling:

* `.modkit` and `.modkit-playbook` workspace metadata directories;
* v1 artifact kinds such as `modkit-source-slice` and `modkit-portable-recipes`, plus the existing `modkitVersion` data field;
* `MODKIT-NPM-LOCKS` and `MODKIT-DONOR-BUILD.json` names in hash-pinned original donor builds;
* existing native bridge channels, menu IDs, JavaScript bridge objects and reserved adapter directory names.

These are compatibility contracts, not displayed product names. Changing them in place would invalidate saved data or disconnect an older recipient. New workbench requests use `X-Yoinkr-Token`; the server still accepts `X-Modkit-Token` for compatible local callers.

Historical builds, screenshots, recovered donor files, licenses, reports and acceptance receipts keep their original bytes and names. They establish what actually ran at that time. The rename does not rewrite their hashes or present them as new Yoinkr runtime proof. The pre-rename public source and reference recipe bundle are archived under `backups/`.

The rebuilt MQTT package has digest:

```text
175458a5e1277738fea13466c274b316cc7d1c97ca60bb10dafb6437a07e1187
```

Current VS Code and Joplin recipes bind that rebranded package; an existing recipient keeps its original embedded binding and continues to verify against its original package. The public reference recipe bundle is exported again with the updated guide, pins and file digests.

## Current demos and proof

Use `builds/element-v0.28/recipient/launch-code.sh` for the new Yoinkr-branded Element example and `builds/vscode-raw-diff-v0.28/launch-code.sh` for the rebranded MQTT comparison. The old `element-v0.27` launcher remains a historical working demo. OBS source and compiler output are under `builds/obs-annotation-v0.28/`.

New name, compatibility, package integrity, MCP and native-window checks are recorded in `evidence/v0.28/VERIFICATION.json`. The OBS module remains a compiled experimental prototype; original GIMP/GTK and actual OBS/Qt runtime verification remain pending. Windows native acceptance also remains open. A name change does not promote framework or platform coverage.
