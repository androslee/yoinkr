# Changelog

Notable changes to Yoinkr. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) while pre-1.0, where minor
versions may still carry breaking changes.

Development before the public repository happened under the earlier **Modkit** name and
is not reconstructed here; `docs/RENAMING.md` covers the compatibility surface that
history left behind. Entries start at the first public release.

## [Unreleased]

### Fixed

- Upgraded Aedes to 1.2.0 and adopted its asynchronous broker initialization,
  resolving the remaining moderate UUID dependency findings.
- Added regression checks for full macOS Firefox bundle copies and fresh unbuilt
  example startup. Incomplete existing portable copies are refused before overwriting.
- Updated the Firefox example to Fabric 7.4.0, with a host-only scene-coordinate
  adapter for unchanged Screenity tools. A fresh build passed real headless Firefox
  drawing/history/recording checks. Its remaining web-ext tooling advisory is documented.
- `yoinkr --version` and `yoinkr -v` now print the package version.
- Updated `dompurify` and `markdown-it` to patched releases for reported high-severity
  advisories, and refreshed the vulnerable `fast-uri` lockfile entry. Remaining npm audit
  findings are documented in `docs/UPSTREAMS.md`.
- Pinned a same-major Zod override for REA to resolve its high-severity advisory while
  upstream retains an exact vulnerable pin.
- Path-containment guards compared a canonicalized path against a non-canonicalized
  root, so on macOS -- where the system temp directory is reached through a symlink --
  they silently passed. Affected `newDestination`, `containedFile` and the primary
  guard in `investigate` that keeps an analysis case out of the donor and recipient.
  All three now canonicalize both sides through a shared `canonicalTarget` helper.
- `npm test` failed 18 of 260 tests on macOS. Adapter and native-host tests now skip
  off their verified Linux x86-64 lane instead of failing, and two new tests assert
  the lane gate itself refuses off-lane. A package-escape test no longer depends on
  `/etc/hostname`, which does not exist on macOS.

### Added

- A source-built VS Code research-browser example with original MV2 uBlock Origin,
  Dark Reader, adapted RES, vertical tabs, visible plugin enable/disable switches
  and local named sessions. Native Linux checks cover filtering, scriptlets,
  response-header/CSP enforcement, RES user tags, plugin lifecycle and restart.
- A reproducible source audit and staged host-API plan for Firefox-only uBlock
  DNS/CNAME and response-body filtering. Those Firefox APIs are not implemented.

- `yoinkr doctor` / `npm run doctor` provide read-only prerequisite diagnostics,
  including optional Playwright, Firefox paths and example dependencies. Diagnostics
  and version output work before npm dependencies have been installed.
- Linux/macOS Screenity source-build and extension-lint CI, plus a manual Windows
  core-portability workflow. These do not claim native browser capture or Windows
  application integration acceptance. See `docs/RELEASE_CHECKLIST.md`.
- GitHub Actions CI: the suite and a CLI smoke check across {ubuntu, macOS} x Node
  {22, 24, 26}, the repository content audit, the self-contained `test:agent` and
  `test:research` smoke checks, a Prettier check and a dependency audit. Least-privilege
  tokens, SHA-pinned actions and `npm ci --ignore-scripts`.
- Dependabot for GitHub Actions, and security-only updates for npm.
- `SECURITY.md` with a private disclosure path and an explicit scope, covering the
  read-only, containment, identity-refusal and verification-integrity guarantees.
- This changelog.
- Prettier, `.editorconfig`, and `npm run format` / `format:check`. Payload trees whose
  bytes are hashed into packages and adapters are excluded via `.prettierignore`.
- Playwright declared as an optional peer dependency. It is still supplied externally
  and is not installed by `npm ci`; `scripts/README.md` documents the contract.

### Changed

- JavaScript under `src/`, `test/` and `scripts/` reformatted with Prettier. Mechanical;
  no behavior change, and excluded payload trees are byte-identical.
- `scripts/README.md` records which checks CI gates and which scripts have no npm alias.
- `docs/UPSTREAMS.md` tracks known upstream dependency issues.

## [0.30.0]

First public release. Investigation workbench, CLI, recipe-driven host adapters and
optional MCP tools, with verified transfers on the Linux x86-64 lane for Electron
(MQTT Explorer to VS Code and Joplin), Qt Widgets (Krita to OBS), Firefox
WebExtensions (Screenity) and a native C ABI component bridge. See
`docs/FRAMEWORK_SUPPORT.md` for the full scope and its limits.
