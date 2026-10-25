> **Historical case study and retained source tooling.** Generated MQTT apps and bundles are excluded from Yoinkr releases because upstream licensing declarations conflict. See the [license review](../../docs/LICENSING.md).

# MQTT Explorer → VS Code and Joplin

Yoinkr demonstrated transfer of the original Raw/Diff controls, comparison renderer, history and styling into separate VS Code and Joplin lab copies, without a marketplace extension. Those generated integrations are not shipped. The source tooling remains available as a research reference; successful private reproduction does not grant redistribution rights.

This example uses shared Yoinkr engines rather than duplicating its implementation here:

- [Acquire/build the donor baseline](../../docs/FEATURE_BASELINES.md).
- [Recover and preview the original UI package](../../docs/FEATURE_PACKAGES.md).
- [Build the VS Code recipient](../../docs/FEATURE_HOSTS.md).
- [Build the Joplin recipient](../../docs/SECOND_HOST.md).
- [Portable recipe workflow](../../docs/PORTABLE_DELIVERY.md) and [recipe bundle](../../recipes/reference-raw-diff/GUIDE.md).

Install root development dependencies with `npm ci --ignore-scripts`. The donor builder now uses the published frozen dependency metadata and normalizes only path-dependent source-map identifiers; all original recipe hashes remain enforced. Supply exact donor/source/runtime versions described by the recipes. Build into a new `builds/` directory and launch only the generated lab copy. The original installation is not modified. Re-run shared acceptance and rollback tests for your generated copy.

Native support is scoped to the documented Linux x86-64 application versions. Windows/macOS are not verified. Historical evidence/screenshots mentioned in older guides are local artifacts, not included downloads.

MQTT Explorer's package metadata and license-file labels differ; [provenance](../../docs/UPSTREAMS.md) records this. Acquisition/recovery recipes do not grant redistribution rights to generated donor-derived packages.
