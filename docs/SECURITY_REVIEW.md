# Pre-publication security review

Reviewed 2026-10-24, starting from commit `26ee3d4`, with the release-preparation
changes described here. This is a focused maintainer review, not an independent
penetration test or a guarantee that no vulnerabilities exist. Raw scan reports,
profiles and downloaded tools stay local and are not publication artifacts.

## History and publication contents

Gitleaks 8.30.1, verified against the official release archive checksum, scanned all
18 commits reachable from fetched branches and tags with `--all --full-history`,
full redaction and inline allow comments disabled. It reported no leaks. An
additional historical filename review found 476 unique paths and no matches for
the generated/private directory names excluded by repository policy. These counts
are a baseline, not a permanent certification; rerun scans before publication.
Unreachable Git objects, untracked files, GitHub issue/PR text and third-party
services are outside this local history scan. Pattern-based scanning can miss
unknown credential formats and non-secret personal information.

The public repository audit separately checks current tracked files for generated
outputs, credential patterns, binaries, large files and broken example links.
A full-history Gitleaks job now repeats on pushes, pull requests, weekly schedules
and manual dispatch. It does not upload reports containing potential secrets.

## Boundaries reviewed

| Area | Review and remaining limits |
| --- | --- |
| Recipe/workspace writes (`src/workspace.js`, `src/electron-playbook.js`) | Relative-path checks, canonical containment, ordinary-file checks, new destination creation, payload hashes and separate runtime copies. Existing regression suites exercise traversal, symlinks, drift and rollback. Local files must not be concurrently modified by an adversarial process; this is not an OS isolation boundary. |
| Recovered code execution (`src/verify.js`) | Uses subprocesses with time/output bounds. Recovered modules still run with the user's normal permissions. Only run trusted code; use a disposable VM/container for unfamiliar inputs. Hashes detect drift relative to trusted metadata, not malicious metadata authored together with its payload. |
| Browser acquisition/extraction | Pinned HTTPS archives are SHA-256 checked before use. Extraction rejects unsafe paths, wrong roots and oversized expanded entries. The decompressor materializes the pinned archive before expanded-size checks, so this is not a general untrusted ZIP service. |
| Browser renderer/IPC | Web tabs use sandboxing, context isolation, no Node integration and enabled web security. Control IPC checks the exact control window, main frame and local URL; blocked-tab IPC checks the owned extension background and destination. Webpages are not granted the host control bridge. Permission requests are denied. Original pinned extensions remain trusted code with browser access. |
| Browser build destination | Found and fixed: the builder could populate an existing output directory. It now creates the output exclusively before writing. New source-build acceptance verifies caller files stay untouched, protected-input refusal, drift refusal, unchanged inputs and rollback. |
| CI supply chain | Actions use commit SHAs, installs disable lifecycle scripts, tokens default to read-only, credentials are not persisted and workflows use `pull_request`, not privileged `pull_request_target`. CodeQL receives only the additional security-events permission it needs. |

The prior native Linux acceptance run exercised 19 blocker checks and 12 plugin
checks. The new source-build check bundles the actual host and pinned archives
using a synthetic runtime, without starting Electron. It is not a fresh native
acceptance run or proof of compatibility with other Electron versions.

## Dependency findings

Root and browser-example npm audits report zero advisories at this review.
Screenity's separate tooling reports three high findings from one node-forge RSA
verification advisory through `web-ext`'s Android/ADB dependency chain. It remains
open and documented in [UPSTREAMS.md](UPSTREAMS.md). No forced downgrade or untested
override was applied. This prevents calling the entire repository dependency-clean;
recheck the advisory and document the release decision before publishing.

## Release-preparation validation

An isolated fresh checkout with the proposed changes passed `npm ci --ignore-scripts`,
the root regression suite (275 passed, two skipped), formatting, the public-file
audit, and both self-contained research/agent smoke checks. The browser dependencies
installed from their lockfile, all three extension archives downloaded and passed
hash checks, and source-build acceptance passed without an existing generated build.
Actionlint 1.7.12 validated all workflow definitions. These local results do not
establish that the new workflows have run on GitHub.

## Remaining release gates

- Run the committed workflows on GitHub and inspect actual results. Local checks
  do not establish that hosted Actions passed.
- CodeQL is prepared for JavaScript/TypeScript and Actions but is skipped while
  this personal repository remains private without a configured entitlement.
  After publication, run the Security workflow manually and triage all findings.
- Complete fresh-user native acceptance for showcased examples. Keep platform
  claims limited to the explicitly verified bindings.
- Review donor licenses, source/notice delivery and product branding. Recipes do
  not grant permission to redistribute upstream software.
- Configure repository settings and private reporting using the
  [release checklist](RELEASE_CHECKLIST.md). Visibility has not been changed.
