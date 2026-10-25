# Examples

Start with one donor/recipient pair. These are reproducible source examples, not prebuilt application installers.

| Directory | Example | Status |
| --- | --- | --- |
| [ublock-vscode](ublock-vscode/README.md) | uBlock Origin, Dark Reader and RES → VS Code browser with vertical tabs and sessions | Original Chromium MV2 extension; scoped native Linux acceptance and reproducible checks. |
| [krita-obs](krita-obs/README.md) | Krita Qt color selector → OBS live annotation dock/source | Scoped native Qt widget transfer, GPU rendering, restart and rollback verified. |
| [screenity-firefox](screenity-firefox/README.md) | Screenity drawing tools → separate Firefox recording studio | Experimental partial port; native Firefox verification command included. |
| [mqtt-raw-diff](mqtt-raw-diff/README.md) | MQTT Explorer Raw/Diff UI → VS Code and Joplin | Scoped Linux native transfer; original and recipient checks. |
| [element-search](element-search/README.md) | Element highlighting → VS Code transcript search | Scoped Linux native recipient. |
| [obs-annotations](obs-annotations/README.md) | GIMP stroke smoothing → OBS | Numeric checks and compilation; actual GTK/Qt GUI acceptance pending. |

The existing implementations share `src/`, `recipes/`, `addons/` and `scripts/`; each example links the relevant entry points. Small original synthetic fixtures belong in tests. Acquired donor source, modified app copies, executable browsers, personal profiles and test outputs stay in ignored `.local/` or `builds/` directories.

A browser example uses an isolated profile and a copied or explicitly supplied runtime. It never installs into your everyday browser profile. Unsigned Firefox examples use temporary developer loading; this is different from a Mozilla-signed public add-on.
