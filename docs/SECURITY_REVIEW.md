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

## Hosted verification follow-up

The release-preparation workflows passed on GitHub: Linux/macOS core CI across
Node 22/24/26, secret scanning, dependency audits, browser source build, and Linux/
macOS Screenity source builds. The Windows core run exposed a stale `GUIDE.md`
hash in the published reference bundle after the script-directory reorganization.
Commit `08ecaa3` repairs that reviewed manifest and adds a regression test against
the actual published bundle. Its Windows core rerun passed. This remains core
portability, not native Windows recipient acceptance.

Enabling repository dependency alerts also exposed GHSA-6q48-6c7w-9gw2 in the
optional ELF provider's certifi pin. It is updated to 2026.10.23, the complete
pinned Python requirements pass pip-audit, and the patched bundle loads as a TLS
CA store. The existing project-local ELF environment was upgraded as well.
Scheduled security CI and Dependabot now include this Python requirements file.
Dependency alerts and automated security-update PRs are enabled. GitHub refused
branch rules for the current private repository without a plan upgrade; reporting,
push protection and public CodeQL acceptance remain publication-time checks.

## Native Linux follow-up

Pre-publication verification reran the original MV2 uBlock browser (19 checks)
and plugin/session suite (12 checks). Screenity was rebuilt and passed 16 native
Firefox checks with Fabric 7.4.0, including actual screen sharing on a private Xvfb
display, playable recording and source-track cleanup. Krita's original widget was
rebuilt against the accepted Qt/OBS SDK, and feature, restart, ordinary launcher,
rollback and integrity checks passed with zero OBS-tracked leaks in all sessions.
Raw results remain ignored; commands and limits are in the example guides. These
runs do not certify general browser security or unsupported platforms.

Upstream registry review still finds no patched node-forge/web-ext release for the
known Screenity tooling advisory. No untested replacement, downgrade or advisory
suppression was added. Removing this dependency would require separately verifying
a replacement desktop Firefox launcher and extension-lint tooling.

## Fresh-user Screenity follow-up

The Screenity Linux setup was independently exercised from a new clone at
`9913595`, with fresh npm dependencies, freshly downloaded hash-pinned donor sources
and a new Mozilla-checksum-verified Firefox 158.0 archive. Build, zero-error/warning
lint, all 16 native screen-capture checks and ordinary launcher installation passed.
The checkout remained unchanged. Runtime/test tools and OS libraries are explicit
external prerequisites. Other examples' end-to-end first-run checks and unsupported
platforms remain outside this result; raw receipts and applications are not tracked.

## Fresh-user VS Code browser follow-up

The browser example was verified from a new clone at `8505f49`, fresh lockfile
installs and new extension downloads. A newly acquired stock VS Code 1.142.0 archive
matched Microsoft's published SHA-256. Build, all 31 native checks and the generated
launcher passed. Guarded rollback removed the added host and restored the original
fingerprints; the restored stock workbench launched without the injected menu.
Original input hashes and tracked files stayed unchanged. This used the documented
external Playwright, OpenSSL and OS/display prerequisites. The result covers the
named Linux route, not live Reddit, other platforms or general browser security.

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
