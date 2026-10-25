# Source-only publication handoff

The owner authorized public visibility and source-only publication on 2026-10-25.
The repository is now public, and the [v0.30.0 experimental source preview](https://github.com/androslee/yoinkr/releases/tag/v0.30.0) is published.
All 15 required checks passed on its tagged commit, with both CodeQL lanes reporting
zero findings. The commands below document the reviewed settings
and release procedure; they are not an automatic publication script. No generated apps, donor bundles, runtimes, profiles or raw
verification reports are release assets. In particular, the owner excluded all
generated MQTT Explorer integrations while retaining source tooling and a case study.

## After the owner chooses public visibility

Confirm the source-only scope and [release checklist](RELEASE_CHECKLIST.md), then
change visibility deliberately in GitHub. No committed workflow changes visibility.
These public settings are now enabled. Before publication they were unavailable
on the private/free configuration; no plan upgrade was purchased.

Enable security/reporting and run CodeQL:

```sh
gh api --method PATCH repos/androslee/yoinkr --input .github/public-security.json
gh api --method PUT repos/androslee/yoinkr/private-vulnerability-reporting
gh workflow run security.yml --ref main
```

Inspect the Security workflow's actual JavaScript/TypeScript and Actions CodeQL
results, triage findings and apply fixes before release. A skipped private-repo job
is not a completed scan. Confirm the private reporting link in SECURITY.md opens
and push protection is enabled. Dependency alerts and automated security PRs are
already enabled; verify they remain on.

## Protect main after checks are available

Review the proposed `.github/main-protection.json`. It requires current always-run
CI, Windows core and security checks, prevents force pushes/deletion, dismisses stale
reviews and requires one approving review for contributors. `enforce_admins` is
false so the sole owner retains an explicit emergency bypass; it does not make an
unreviewed change tested or approved. Change that policy if a different maintainer
workflow is desired.

```sh
gh api --method PUT repos/androslee/yoinkr/branches/main/protection --input .github/main-protection.json
```

The template includes the actual public `CodeQL (javascript-typescript)` and
`CodeQL (actions)` check names; both are required alongside the core checks. Do not globally require the path-filtered Example source build workflow:
unrelated pull requests would wait for a missing status. Recheck rule behavior on
a normal pull request. These JSON templates do not apply themselves.

## Tag and publish the experimental source release

The prepared release notes are kept in the ignored local release area until reviewed.
Use a tag matching the package version, mark the release as experimental/prerelease,
and target the final reviewed commit after hosted checks pass. Verify that there
are **no binary/generated assets**. GitHub's automatic source archives contain only
tracked source, documentation, recipes and frozen build metadata.

Do not publish the release before the owner authorizes that final step. Generated
MQTT apps/bundles remain excluded regardless of successful private tests. The
Screenity tooling advisory is a documented known issue, not a claim of a clean
repository-wide audit. Other native platforms and the GIMP GTK prototype remain
outside verified release claims.
