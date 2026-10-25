# Release readiness

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

## Windows handoff

The manual **Windows core portability** Actions workflow runs recipe integrity,
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

The repository owner must explicitly choose when to make the private repository
public. Once public, enable private vulnerability reporting under Settings →
Advanced Security and confirm the form linked by SECURITY.md opens. While private,
that public reporting channel is unavailable; agree on a private maintainer contact
with collaborators instead of posting vulnerability details in issues.

Configure a main-branch rule requiring the CI matrix, repository hygiene,
self-contained smoke checks and dependency audit before merge; prevent force pushes
and branch deletion. GitHub currently requires a paid plan for these rules on a
private repository, while public repositories can use them on Free. Keep conditional
example-build checks out of globally required checks unless their workflow always
runs, otherwise unrelated PRs can wait indefinitely for a missing status.

Review the proposed compatibility timeline in [RENAMING.md](RENAMING.md) before
implementing removals. No removal date is enacted by merging that proposal.

References: [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).
