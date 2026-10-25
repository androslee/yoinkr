# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub private vulnerability reporting](https://github.com/androslee/yoinkr/security/advisories/new)
rather than opening a public issue.

Include the Yoinkr version (`yoinkr --version` or the `version` field in `package.json`), your operating
system and Node version, the command or API involved, and the smallest input that
reproduces the problem. If a proof of concept writes outside its workspace or
reaches a real application install, say so explicitly so it is not run casually.

Expect an acknowledgement within a week. Yoinkr is an experimental single-maintainer
project, so please allow reasonable time for a fix before public disclosure.

## Trust and execution model

Recovered code and verification modules run with your normal user permissions;
subprocess time/output limits are not a hostile-code sandbox. Review recipes and
payloads before running them, and use a disposable VM/container for unfamiliar
inputs. Hashes bind files to reviewed metadata; they do not authenticate a malicious
recipe and payload supplied together. Browser tabs have a separate sandbox/IPC
boundary, while pinned browser extensions are trusted code with access to pages.

See the scoped [pre-publication review](docs/SECURITY_REVIEW.md) and its verification
limits. Automated scans supplement review and do not certify the project
as vulnerability-free.

## What is in scope

Yoinkr reads other applications, patches copies of them, and runs recovered code,
so a few guarantees are load-bearing. Reports against these are in scope:

- **Existing installations are never modified.** Investigation and probing are
  read-only; integration writes into a new working copy. A path that mutates a
  donor or recipient install in place is a vulnerability.
- **Workspace containment.** A case, workspace or package must not be created
  inside a protected input, and no recipe, archive entry or symlink may write
  outside its destination root. Path traversal and symlink escapes are in scope.
- **Identity and drift refusal.** Host adapters refuse unexpected application
  versions and changed bytes before applying anything. A way to make a changed or
  rehashed input pass an identity check is in scope.
- **Verification integrity.** A way to make a failing transfer report as verified,
  or to tamper with a donor snapshot, export or recipe so a comparison still
  passes, is in scope.
- **Execution boundaries.** The CDP loader, the native component bridge and the
  Playwright-driven checks must stay bounded. Arbitrary code execution reachable
  from untrusted recipe or package input is in scope.
- **Dependency installation.** `npm ci --ignore-scripts` is the documented install
  for a reason. Anything that requires install scripts to run is in scope.

## What is not in scope

- Third-party vulnerabilities in donor or recipient applications. Report those to
  their maintainers.
- Known upstream advisories in pinned dependencies, which are tracked in
  [docs/UPSTREAMS.md](docs/UPSTREAMS.md).
- Transfers failing on unverified platforms or frameworks. Windows and macOS native
  adapters are explicitly unverified; see
  [docs/FRAMEWORK_SUPPORT.md](docs/FRAMEWORK_SUPPORT.md).
- Using Yoinkr to copy code you have no licence to copy. That is a licensing matter,
  not a vulnerability, and is the operator's responsibility.

## Supported versions

Only the latest release is supported. Yoinkr is pre-1.0 and fixes land on `main`.
