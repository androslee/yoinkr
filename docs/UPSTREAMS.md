# Upstream foundations

## REA — actual runtime dependency

- Official project: https://github.com/morluto/rea
- Package: `rea-agents@6.7.0`, pinned with transitive integrity hashes in package-lock.json.
- License: MIT; upstream license/notices remain in the installed package.
- Used directly: `analyze-javascript-application` and `trace-application-feature`, with full JSON Evidence output.
- Invocation: local Node subprocess, no shell interpolation, bounded runtime/output, retained output and stderr logs. It does not run `rea setup` or change any agent registration.
- This wrapper currently implements the JS/Electron/ASAR analysis slice. REA offers more providers; Yoinkr has not integrated all of them yet.

## Universal Modder — workflow and route reference

- Official project: https://github.com/rehan-remade/universal-modder
- Consulted: project README, mashup workflow and route-selection guidance, plus previously saved local reference notes.
- Applied concepts: donor/host recon, multiple transfer routes, dependency/format boundaries, a first working slice, donor oracles, exact-version field notes and distinct evidence levels.
- Yoinkr does not bundle Universal Modder or claim its game-specific integrations work for desktop apps. No upstream implementation was copied into this integration.

## Development fixture archive support

`@electron/asar@4.2.0` is an explicit development dependency used to build a real ASAR fixture for end-to-end tests. It is also a dependency of the pinned REA package. Its upstream license remains in node_modules.

The included donor/recipient test code and SVG asset are original fixtures. Their transfer test copies actual donor bytes; it does not replace the donor implementation with a second handwritten equivalent.

## v0.4 real donor and recipient

MQTT Explorer official revision `35f31973c456a024a37450f5961e4610dc9a9ce0`: https://github.com/thomasnordquist/MQTT-Explorer . Actual REA-traced source and selected supporting files are retained unchanged in private case exports. Package metadata says CC-BY-SA-4.0 while LICENSE.md says CC-BY-ND-4.0; both facts and the original license are retained. The native host is a local working-copy demonstration; it is not published to a marketplace. Generated bundle metadata lists the explicit TypeScript barrel-import adaptation and new host glue.

Installed VS Code 1.142.0 supplies the recipient application and MIT-labeled Markdown preview CSS. Original application license/notices stay in its copy; the CSS source headers and hashes are retained. The native recipient Evidence is explicitly a startup source slice.

New host/transport/UI code is Yoinkr code. mqtt@5.14.1 and other build dependencies retain their licenses in node_modules. Aedes is used only for local test/demo traffic. Markdown-it and DOMPurify are used by the new browser viewer; they are separate from the extracted VS Code CSS.

## v0.6 source-map decoder

`@jridgewell/trace-mapping@0.3.31` is pinned as a direct runtime dependency for flat source-map decoding and generated-position lookup. Its original package LICENSE remains in node_modules. The report embeds derived mapping data and Yoinkr UI code; donor source and map-embedded originals remain attributed to their respective original files/cases.

## Screenity → Firefox example

Screenity 4.7.0, revision `c5b344fbb3d9a126c4b3a39f0979c7976392fa96`: https://github.com/alyssaxuu/screenity . The example acquires hash-pinned original drawing modules and licenses, bundles them with Fabric 6.9.1, and supplies a new Firefox host and capture backend. Original source files are retained unchanged in generated output. Screenity is GPLv3; full notices and corresponding recovered source accompany the local build. The public repository contains recovery/build instructions and original adapter code rather than downloaded donor code or Firefox binaries. This is a partial feature port, not the official Screenity extension. See [the example](../examples/screenity-firefox/README.md) for capabilities and test scope.
