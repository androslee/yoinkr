# Public repository contents

The repository contains code and reproducible instructions useful to another developer. A clone should not depend on the original author's installed applications or private build history.

| Path | Purpose |
| --- | --- |
| `src/` | CLI, workbench, analysis integration, transfer engines and host adapters |
| `examples/` | Discoverable donor/recipient examples with setup, attribution, curated synthetic previews and verification boundaries |
| `recipes/` | Input fingerprints, adaptation rules, acceptance suites and portable recipe bundles |
| `addons/` | Supporting host implementations and original fixture UI |
| `scripts/general/` | Reusable build, analysis, packaging, portability and core verification tools |
| `scripts/applications/` | Application-specific example builders, launchers, benchmarks and acceptance checks |
| `test/` | Regression tests and small synthetic fixtures |
| `mods/` | Small original loader examples |
| `docs/` | User/developer guides, support matrix and provenance |

See [script layout and commands](../scripts/README.md) for the boundary between reusable tools and application demonstrations.

## What stays local

`.local/`, `.local-notes/`, `node_modules/`, `.tools/`, `builds/`, `backups/`, `cases/`, `evidence/`, `reports/` and `findings/` are ignored. These may hold downloaded or modified applications, recovered third-party code, browser profiles, screenshots, source archives and investigation details. Machine-specific agent registrations, delivery configurations and environment files are also excluded.

Development milestone checklists and the original workstation-only showcase have been removed from the tracked tree. Their useful setup instructions are represented by the example guides and product documentation. Local originals remain in `.local-notes/` for development reference; that archive is not published or packaged.

### Verification output layout

Use stable feature names, never release-number directories. Root smoke scripts write their latest results to `.local/verification/<suite>/` (for example `browser/`, `mqtt/` and `agent/`). A rerun replaces only that suite's marked, generated default directory. An unmarked directory or symlink is refused; explicit environment-variable output overrides are never cleared by the helper. Do not run the same suite concurrently against its default destination; give concurrent runs explicit separate destinations. A failed run can leave partial results, so check the command's exit status and report contents.

Maintained examples keep their own stable `examples/<example>/.local/verification/` directory. Keep package versions and timestamps inside reports; Git records source history. Do not create `evidence/vX.Y/`, `builds/<feature>-vX.Y/` or a release-named folder each time a feature changes. New build scripts should use `examples/<example>/.local/build/` or a stable `.local/builds/<feature>/` destination. Legacy scripts that consume older prepared builds require their documented inputs; those historical build paths are not a convention for new work.

The original workstation's accumulated verification history has been consolidated into one ignored `.local/archives/verification-history.tar.gz` archive. It is private development material and is excluded from Git and npm. Historical paths mentioned in older technical guides describe archive members, not files supplied with a checkout or instructions to recreate release-number folders. Sealed historical receipts are preserved unchanged; their absolute workstation paths may no longer resolve. Use each example's current reproduction commands for fresh verification.

## Before sharing changes

Run `npm test`, inspect `git diff --cached`, and confirm that no generated applications, private configuration, tokens or personal recordings are staged. Build/download scripts must pin upstream source versions and check hashes. Preserve original licenses and distinguish unmodified donor code from new adapters. Never mark a platform verified solely because a module compiles.

Large downloadable example bundles should be built separately and distributed only after reviewing licensing and including corresponding source/notices. They do not belong in ordinary source commits.
