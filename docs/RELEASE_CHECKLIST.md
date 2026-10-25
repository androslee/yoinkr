# Release readiness

## Completion status

- [x] Core tests, formatting, repository hygiene and Linux/macOS/Windows core CI.
- [x] Full-history secret scan, scoped security review and dependency monitoring.
- [x] Browser and Screenity clean-install/native checks, with generated output ignored.
- [x] Fresh Krita/OBS and Element source builds/native checks using documented SDK/tool prerequisites.
- [x] License/attribution inventory; generated-output notice fixes and verification.
- [x] MQTT distribution decision: source tooling/case study kept; generated apps and bundles excluded.
- [x] Known Screenity tooling advisory documented with its CI exception and scope.
- [x] Public security/branch settings and experimental source release notes prepared for review.
- [x] Owner authorization to make the repository public (2026-10-25).
- [x] Apply public security/reporting/protection settings and verify actual public CodeQL results.
- [x] Publish the reviewed source-only experimental tag/release after those checks.

The repository became public on 2026-10-25. Secret-scanning push protection,
private vulnerability reporting, Dependabot updates and the prepared main-branch
protections are enabled. Public CodeQL found two items; the follow-up hardens CDP
identifier encoding and clarifies a literal-markup test assertion. Both findings
are fixed. All 15 required checks passed on release commit `3ccecc6`, including
both public CodeQL lanes with zero findings. The
[v0.30.0 experimental source release](https://github.com/androslee/yoinkr/releases/tag/v0.30.0)
is published with no attached application/bundle assets. Its actual source archive
was checked: 414 files, no excluded generated paths or runtime binaries.
See [publication handoff](PUBLISHING.md). Unsupported platforms and the GIMP
prototype are documented exclusions, not passed native acceptance.

## Reproduce from a clean checkout

Run `npm ci --ignore-scripts`, `node src/cli.js doctor`, `npm test`,
`npm run format:check`, `npm run check:repository`, `npm run test:research`,
`npm run test:agent`, and `npm audit --audit-level=high`.

For Screenity, run `node src/cli.js doctor --example screenity-firefox --firefox
/path/to/Firefox` from the root. The doctor reports missing dependencies and build
artifacts without changing them. Follow its instructions, then rerun it.
For the native Qt example, use `--example krita-obs --sdk /path/to/sdk-prefix`;
required OBS/Qt headers, libraries and the moc tool are checked as files. A build
and native run must still confirm their versions and ABI.

The Example source build workflow builds and lints the recovered extension from
hash-pinned source on Linux and macOS. It does not test native Firefox startup,
screen sharing permissions, or actual capture. The core suite separately tests
full macOS bundle copying, preserved symlinks, and unbuilt-launch refusal.
The separate example lockfile currently reports an unpatched high node-forge
advisory through web-ext's Android tooling. Its CI audit gates critical findings
and logs the known high findings. See [upstream status](UPSTREAMS.md); do not describe
the entire repository's dependencies as clean based on the root audit alone.

## Browser example source and native checks

The always-running **browser example source build** CI job installs and audits the
separate browser lockfile, checks its source formatting, acquires pinned archives,
and exercises bundling, existing-output refusal, unchanged inputs, drift refusal
and rollback using a synthetic runtime. Reproduce it locally:

```sh
cd examples/ublock-vscode
npm ci --ignore-scripts
npm run acquire
npm run verify:build
```

It does not start Code or establish extension behavior. Before a browser release,
follow the [example guide](../examples/ublock-vscode/README.md) to build from a clean,
reviewed native runtime and run both `verify` and `verify:plugins` on Linux. Check
sandboxing, startup protection, original uBlock controls, plugin toggles and restart.
Other native platforms and general extension compatibility remain unverified.

## Native Linux verification baseline

The pre-publication rerun on the named Linux lanes passed:

- VS Code browser: 19 native uBlock checks and 12 extension/session checks.
- Screenity / Firefox 158.0 / Fabric 7.4.0: 16 checks including the real sharing
  chooser, isolated Xvfb capture, playable recording, cancellation and cleanup.
- Krita / OBS 30.0.2 / Qt 6.4.2: rebuilt original widget, feature/restart/launcher/
  rollback sessions, integrity refusal and zero OBS-tracked leaks in every session.

Reproduce the commands in each example guide against release inputs. These runs
used existing isolated runtime copies and hash-verified acquired sources; they
are not a new end-to-end acquisition/install run for every example. They do not
verify native Windows/macOS, live Reddit accounts, production streaming, all donor
features or the separate GIMP/GTK prototype. Keep raw results and profiles ignored.
The Screenity tooling dependency advisory remains documented in UPSTREAMS.md.

## History and security checks

Read the [focused review](SECURITY_REVIEW.md), rerun the public-file audit and
review all fetched branch/tag history before changing visibility. With a trusted
Gitleaks CLI (CI pins version 8.30.1 and its Linux archive SHA-256):

```sh
git fetch origin --prune --tags
gitleaks git . --log-opts="--all --full-history" --redact --ignore-gitleaks-allow --no-banner
```

Inspect historical filenames for private material too; deleting a file from main
does not delete its history. Do not paste scanner findings into public logs. If a
credential is found, revoke/rotate it before deciding whether history cleanup is
needed. No automated history rewriting is part of the release workflow.

The **Security** workflow repeats full-history secret scanning, audits all three
lockfiles and the optional ELF provider Python requirements on a schedule, and prepares CodeQL
for JavaScript/TypeScript and GitHub Actions. CodeQL runs on the public repository for JavaScript/TypeScript and Actions.
Inspect actual findings; a skipped job is not a successful scan. Do not
enable competing CodeQL default setup when this advanced workflow is in use.

## Fresh-user example acceptance

**Screenity → Firefox: passed on Linux x86-64.** A new GitHub clone at `9913595`
installed the example's dependencies from its lockfile, freshly acquired original
Screenity sources, and built against a new Mozilla Firefox 158.0 download checked
against the publisher's SHA-512. No workspace-generated extension or browser copy
was reused. Lint, all 16 native capture checks and the ordinary temporary-add-on
launcher passed; tracked source files stayed unchanged. GeckoDriver, Xvfb and OS
libraries were supplied as documented. See the [example guide](../examples/screenity-firefox/README.md).

**uBlock Origin → VS Code browser: passed on Linux x86-64.** A new clone at
`8505f49` installed root/example lockfiles and freshly acquired all three original
extensions. A new stock VS Code 1.142.0 download matched Microsoft's published
SHA-256. Build, 19 blocker checks, 12 plugin checks, the actual generated launcher,
and guarded rollback passed. The restored Code workbench launched without the
injected browser; original input hashes and tracked files remained unchanged.
Playwright, OpenSSL and OS/display prerequisites were supplied separately. See the
[browser example guide](../examples/ublock-vscode/README.md).

**Krita → OBS: passed on Linux x86-64.** A new checkout at `7864e77`, plus
reviewed release fixes, freshly acquired pinned Krita sources and compiled the
original widgets/new host against the explicitly supplied OBS 30.0.2 / Qt 6.4.2
SDK. A new isolated runtime passed feature (13), restart (13), rollback (2),
ordinary launcher (15) and integrity (4) checks, with zero OBS-tracked leaks in
every session. Generated corresponding sources retain original per-file notices
and the full host GPL text; the actual files match the build receipt.

**Element → VS Code: passed on Linux x86-64.** The same new checkout freshly
acquired pinned sources and a new Microsoft-checksum-verified Code 1.142.0 runtime.
All 12 native checks passed, including search highlighting and rollback. After
preserving the full original copyright header and acquiring both offered
open-source license texts, a second new build passed the same native suite. The
example explicitly selects upstream's offered GPL-3.0-only alternative.

These complete the first-run gates for those named examples/platforms, using the
documented external tools and runtime libraries. They do not establish native
Windows/macOS support. MQTT remains retained research tooling: successful private
tests do not permit distribution of generated apps/bundles. The MQTT research build now reproduces the original frozen bundle hashes. Its
full private replay passed 76 observations, all three donor comparisons and guarded
rollback of both recipients, with no remaining owned app/browser processes. These
are source-tooling checks, not a distributed integration. Public settings and
actual public CodeQL results were verified separately for the published release.

## Windows handoff

The **Windows core portability** Actions workflow, run automatically on pushes and
pull requests and available for manual dispatch, runs recipe integrity,
export/import and delivery regressions on a clean Windows runner. Its JSON and
test output remain in the Actions job logs. It is not native application acceptance.

On the Windows test machine, from a fresh checkout:

```powershell
npm ci --ignore-scripts
node src/cli.js doctor --json
powershell -ExecutionPolicy Bypass -File scripts/general/verify-windows.ps1
```

The wrapper prints its output directory. Keep its METHOD.json, RESULT.json and
DELIVERY-TESTS.log locally. Never check machine-specific reports into this repository.

Native Windows delivery remains open: the current VS Code/Joplin bindings refuse
platforms outside their accepted Linux lane. A Windows result requires a new
explicit Windows binding and pinned clean application inputs, then original versus
recipient behavior, startup/restart, drift refusal and rollback checks. Record
Windows, Node, donor and recipient versions, exact hashes, and process cleanup.
Do not bypass the Linux guard or label the core workflow as native verification.
See [portable delivery](PORTABLE_DELIVERY.md).

## GitHub settings before public release

The owner explicitly authorized public visibility on 2026-10-25. Private
vulnerability reporting is enabled and the form linked by SECURITY.md opens.
The prepared main rule requires 15 actual checks and one contributor review,
blocks force pushes and branch deletion, and retains the documented owner/admin
bypass. The release was held until every check passed on its exact commit.

Enable secret-scanning push protection, Dependabot alerts/security updates, and
private vulnerability reporting. Public secret scanning is automatic, but review
the Security tab and confirm the reporting form linked by SECURITY.md works.
CodeQL uses hosted GitHub analysis; Gitleaks runs on the Actions runner. Neither
requires an AI-model API key. Local Gitleaks scans do not send source to a service.

Configure a main-branch rule requiring the CI matrix, repository hygiene,
self-contained smoke checks, dependency audit, browser example source build and
full-history secret scan before merge; prevent force pushes
and branch deletion. GitHub currently requires a paid plan for these rules on a
private repository, while public repositories can use them on Free. Keep conditional
example-build checks out of globally required checks unless their workflow always
runs, otherwise unrelated PRs can wait indefinitely for a missing status.

Review the proposed compatibility timeline in [RENAMING.md](RENAMING.md) before
implementing removals. No removal date is enacted by merging that proposal.

References: [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).

## Release candidate

- Try installation/build instructions from a fresh checkout; do not rely on local
  ignored downloads, dependencies, profiles or previous generated outputs.
- Review licenses/notices for each showcased transfer and keep unsupported features
  explicit. In particular, do not redistribute prepared donor applications merely
  because the build recipe is public.
- Resolve or explicitly document remaining dependency findings and platform gaps.
- After hosted checks pass, create an experimental release tag and notes describing
  capabilities, supported platforms, known issues and reproduction instructions.
  Publication/tag creation is a separate deliberate step, not done by these checks.
