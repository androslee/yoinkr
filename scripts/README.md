# Script layout

Run commands from the repository root. Existing `npm run` command names are unchanged; direct script paths now include their group.

| Directory | Purpose | Examples |
| --- | --- | --- |
| [general/](general/) | Reusable analysis, feature packaging, core smoke checks, delivery checks, portability and development setup | `build-feature-package.mjs`, `analyze-feature-bundles.mjs`, `verify-portability.mjs`, `check-repository.mjs` |
| [applications/](applications/) | Builders, launchers, acceptance checks, benchmarks and reports tied to particular donor/recipient applications or prepared demos | MQTT Explorer → VS Code/Joplin, Element → VS Code, GIMP → OBS, Chromium document viewing, zlib → VS Code |

`general/fixtures/` contains synthetic test data used by the core tests. General scripts must not import application scripts. They can use a reference recipe by default; use their explicit recipe/input arguments for another supported transfer. Recipe-driven tools still depend on the capabilities and host adapters implemented by Yoinkr.

Some broadly named checks in `applications/` (including `workbench-smoke.mjs`, `sources-smoke.mjs`, `replay-smoke.mjs` and `library-smoke.mjs`) require historical MQTT/VS Code or native demo inputs. Their names do not make them generic core tests. New self-contained checks using synthetic fixtures belong in `general/` or `test/`.

Self-contained example projects such as Krita → OBS and Screenity → Firefox keep their build/launch scripts beside their source under `examples/`.

## Common commands

```sh
npm test
npm run check:repository
npm run test:agent
```

For a runnable application example, start with the [example index](../examples/README.md).

## Playwright is supplied externally

Fifteen scripts under `applications/`, `general/browser-smoke.mjs`, and
`src/feature-electron.js` / `src/ui-checks.js` drive a browser or Electron host
through Playwright. It is deliberately **not** installed by `npm ci`: it is declared
in `package.json` as an optional peer dependency, so the relationship is recorded
without imposing a browser download on everyone who only wants the CLI.

Point `PLAYWRIGHT_MODULE` at an installed copy, or install `playwright` yourself:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:wizard
```

Without either, these scripts fail with `ERR_MODULE_NOT_FOUND: Cannot find package
'playwright'`. That is expected, not a broken checkout.

## Checks that run in CI

Only the self-contained checks are gated, because everything else needs third-party
application inputs that are not in this repository:

| Command | What it covers |
| --- | --- |
| `npm test` | The `test/` suite, on {ubuntu, macOS} x Node {22, 24, 26} |
| `npm run check:repository` | Repository content and link audit |
| `npm run test:agent` | Agent and MCP client, synthetic fixtures |
| `npm run test:research` | Investigation and research flow, synthetic fixtures |
| `npm run format:check` | Prettier |

## Not wired to an npm command

`general/verification-output.mjs` and `general/fixtures/library.mjs` are shared
modules imported by other scripts, not entry points.

These three are entry points with no `npm run` alias and no guide reference, and
are run by hand if at all -- `build-examples.mjs`, `build-native-host.mjs` and
`native-ui-smoke.mjs` under `applications/`. They should either get an alias or be
removed; they are recorded here so they are not mistaken for dead files.

## Application-specific commands

| Workflow | Commands |
| --- | --- |
| MQTT donor and baseline | `build:feature-donor`, `prepare:feature-baseline`, `capture:feature-baseline` |
| VS Code and Joplin recipients | `build:vscode-adapter`, `build:joplin-adapter`, `test:vscode-adapter`, `test:second-host` |
| Element and OBS source transfers | `build:element-example`, `build:obs-annotation`, `compile:obs-example` |
| Native component demo | `build:native-component`, `test:component-bridge`, `test:component-recipient` |

Both groups remain committed and included in the package for now. `applications/` is a separate boundary for a future smaller distribution; removing it also requires dropping its npm commands and updating affected example guides. General scripts and core tests do not require that directory. Application adapters and recipes in `src/` and `recipes/` are a separate packaging decision.

Generated applications and reports remain local and ignored. Use stable feature-named output directories as described in [the repository policy](../docs/REPOSITORY.md#verification-output-layout).
