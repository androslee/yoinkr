# Public repository contents

The repository contains code and reproducible instructions useful to another developer. A clone should not depend on the original author's installed applications or private build history.

| Path | Purpose |
| --- | --- |
| `src/` | CLI, workbench, analysis integration, transfer engines and host adapters |
| `examples/` | Discoverable donor/recipient examples with setup, attribution, curated synthetic previews and verification boundaries |
| `recipes/` | Input fingerprints, adaptation rules, acceptance suites and portable recipe bundles |
| `addons/` | Supporting host implementations and original fixture UI |
| `scripts/` | Repeatable build, inspection, benchmark and verification tools |
| `test/` | Regression tests and small synthetic fixtures |
| `mods/` | Small original loader examples |
| `docs/` | User/developer guides, support matrix and provenance |

## What stays local

`.local/`, `.local-notes/`, `node_modules/`, `.tools/`, `builds/`, `backups/`, `cases/`, `evidence/`, `reports/` and `findings/` are ignored. These may hold downloaded or modified applications, recovered third-party code, browser profiles, screenshots, source archives and investigation details. Machine-specific agent registrations, delivery configurations and environment files are also excluded.

Development milestone checklists and the original workstation-only showcase have been removed from the tracked tree. Their useful setup instructions are represented by the example guides and product documentation. Local originals remain in `.local-notes/` for development reference; that archive is not published or packaged.

Some technical guides refer to historical evidence filenames to explain earlier testing scope. Those are references to local development results, not files promised in the checkout. Each maintained example must provide repeatable commands and clearly state its verification limits.

## Before sharing changes

Run `npm test`, inspect `git diff --cached`, and confirm that no generated applications, private configuration, tokens or personal recordings are staged. Build/download scripts must pin upstream source versions and check hashes. Preserve original licenses and distinguish unmodified donor code from new adapters. Never mark a platform verified solely because a module compiles.

Large downloadable example bundles should be built separately and distributed only after reviewing licensing and including corresponding source/notices. They do not belong in ordinary source commits.
