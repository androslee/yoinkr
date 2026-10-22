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

## Application-specific commands

| Workflow | Commands |
| --- | --- |
| MQTT donor and baseline | `build:feature-donor`, `prepare:feature-baseline`, `capture:feature-baseline` |
| VS Code and Joplin recipients | `build:vscode-adapter`, `build:joplin-adapter`, `test:vscode-adapter`, `test:second-host` |
| Element and OBS source transfers | `build:element-example`, `build:obs-annotation`, `compile:obs-example` |
| Native component demo | `build:native-component`, `test:component-bridge`, `test:component-recipient` |

Both groups remain committed and included in the package for now. `applications/` is a separate boundary for a future smaller distribution; removing it also requires dropping its npm commands and updating affected example guides. General scripts and core tests do not require that directory. Application adapters and recipes in `src/` and `recipes/` are a separate packaging decision.

Generated applications and reports remain local and ignored. Use stable feature-named output directories as described in [the repository policy](../docs/REPOSITORY.md#verification-output-layout).
