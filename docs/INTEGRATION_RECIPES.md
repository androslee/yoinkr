# Repeatable working-copy integration and verification

v0.4 adds `integrate`, `verify` and `workspace`. These turn an exported working set into an explicit, reproducible recipient change and acceptance report.

## Recipe

A recipe identifies the recovered entry, a fresh mount path, the module context, exact recipient patches, donor/recipient callable exports, and JSON test cases:

```json
{
  "schema": 1,
  "moduleType": "module",
  "entry": "format.js",
  "mount": "recovered-feature",
  "patches": [{
    "file": "host.js",
    "beforeSha256": "THE_ACTUAL_64_CHARACTER_SHA256_OF_HOST_JS",
    "find": "export const recipient=true;",
    "replace": "export {formatProgress as displayProgress} from './recovered-feature/format.js';"
  }],
  "oracle": {"module": "format.js", "export": "formatProgress"},
  "recipient": {"module": "host.js", "export": "displayProgress"},
  "cases": [{"name": "Half", "args": [0.5], "expected": "50% complete"}]
}
```

Use the real source hash, not the example placeholder. Patches must match once and their base hashes must agree. Export contents, source evidence and oracle snapshots are checked before use. A feature cannot overwrite an existing mount.

```sh
node src/cli.js integrate cases/formatter --export cases/formatter/private/export-ID \
  --recipe recipe.json --out workspaces/formatter
node src/cli.js verify workspaces/formatter
node src/cli.js workspace workspaces/formatter
```

The original recipient stays unchanged. `app/` contains its working copy and mounted donor files. `.modkit/oracle/` retains the donor implementation snapshot; `.modkit/recipe.json` and `workspace.json` record integration inputs. Verification reports go into unique `.modkit/runs/ID/verification.json` files, including failures and worker diagnostics. `verify` exits nonzero when acceptance fails. Fixing the recipient and verifying again creates a new report.

The deterministic verifier supports named, JSON-callable Node exports. It uses separate bounded processes for the recovered donor and recipient, with a 128 MiB heap, default 5-second deadline and output limits. It checks matching values against any declared expected result. Exceptions pass only when an expected error name/message is declared. Imports failing on both sides never count as equivalence. Unserializable outputs fail. This is normal-user code execution, not a sandbox for hostile code, and it does not prove UI, network or side-effect equivalence.

Recipient copy limits are 10,000 regular files, 16 MiB/file, 256 MiB total. `node_modules`, `.git` and `.modkit` are excluded; dependencies are not installed automatically. Symlinks and special files are refused. Small ASAR recipients can be unpacked, but links/unpacked companions require a prepared directory. No in-place live-app patching or automatic overwrites occur.

The larger native VS Code showcase has a dedicated, version-guarded builder, described in SHOWCASE.md, because cloning a desktop application runtime exceeds this small module-workspace limit.
