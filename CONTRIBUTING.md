# Contributing to Yoinkr

Start with the [README](README.md), [transfer workflow](docs/TRANSFER_WORKFLOW.md)
and [framework support](docs/FRAMEWORK_SUPPORT.md). New examples should demonstrate
one bounded feature with reproducible acquisition, exact versions, attribution,
verification and rollback instructions. Do not claim framework-wide support from
one successful transfer.

## Set up and check changes

Use a supported Node version from the README, then:

```sh
npm ci --ignore-scripts
npm test
npm run format:check
npm run check:repository
```

The repository audit checks tracked files, so stage intended additions before its
final run. Run relevant example checks too; their separate lockfiles are not
covered by the root install or root dependency audit. For the browser example:

```sh
cd examples/ublock-vscode
npm ci --ignore-scripts
npm run acquire
npm run verify:build
```

That command checks source delivery with a synthetic application. It does not
establish native browser compatibility. Native checks need the runtime and display
described in the example guide. Include tested OS/application versions and what
was actually exercised in the pull request.

## Keep public contributions reproducible

- Work on a branch and open a pull request with the problem, behavior change and
  validation results. Separate unrelated changes.
- Follow [repository conventions](AGENTS.md) and [output policy](docs/REPOSITORY.md).
  Commit source, recipes and curated documentation; keep downloads, application
  copies, profiles, credentials and raw reports local under ignored directories.
- Preserve upstream source notices and licenses. Explain any adaptations and
  distinguish copied implementation from new host code.
- Do not use production accounts or credentials in tests. Use loopback services
  and synthetic fixtures, and keep dependency install scripts disabled.
- Add regression coverage for security fixes and behavior changes. Document
  platform limitations instead of bypassing guards.

For vulnerabilities, follow [SECURITY.md](SECURITY.md). Do not include private
reports or exploit details in public issues or pull requests.
