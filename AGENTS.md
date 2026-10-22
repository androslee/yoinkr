# Repository output conventions

- Publish source, recipes, tests, curated previews and reproducible instructions. Keep downloaded applications, build outputs, profiles and raw verification results ignored.
- Use stable feature-named directories for generated work: `.local/verification/<suite>/`, `.local/builds/<feature>/`, or `examples/<example>/.local/`.
- Do not create a new output directory for each package version or milestone. Record versions in JSON metadata and rely on Git for source history.
- Root smoke scripts should use `scripts/verification-output.mjs` for default output locations. It replaces only marked generated directories; explicit caller destinations must never be silently deleted.
- Historical paths in older guides are records of prior development, not templates for new directory names. See `docs/REPOSITORY.md` for the output policy.
