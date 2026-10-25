# Third-party inputs and attribution

Yoinkr's original source is GPL-3.0-only under [LICENSE](LICENSE). Third-party
software keeps its own copyright, license and distribution conditions. This
repository publishes host code, recipes and metadata; downloaded applications,
recovered donor payloads, generated modules and profiles are not release assets.

The [license review](docs/LICENSING.md) lists exact donor boundaries, licenses and
unresolved issues. The [upstream inventory](docs/UPSTREAMS.md) records dependency
versions and acquisition provenance. This is an attribution inventory, not a grant
of rights to third-party code or a legal clearance certificate.

| Input | Role and license | Where notices/source are retained |
| --- | --- | --- |
| REA, Babel parser, trace-mapping, Zod | Installed core dependencies; MIT | Original npm package licenses, root lockfile and UPSTREAMS.md. |
| Model Context Protocol SDK | Installed core dependency; Apache-2.0 | Original npm package license/notices and root lockfile. |
| uBlock Origin / RES | Original downloaded browser packages; GPLv3 | Original archives/files plus corresponding-source links and host source in generated output; [example notices](examples/ublock-vscode/THIRD_PARTY_NOTICES.md). |
| Dark Reader / fflate / debug / ms | Downloaded browser extension or bundled adapter dependencies; MIT | Original packages and copied license texts in generated browser output. |
| electron-chrome-extensions | Browser compatibility host; upstream dual license, GPL option selected | Full upstream GPL/license-selection files and original compatibility preload in generated output. |
| Screenity | Original drawing/history source; GPLv3 | Complete acquired source, LICENSE and original notices in generated studio. |
| Fabric | Browser canvas implementation; MIT | Full MIT text and copyright copied into generated extension and corresponding source; [example notices](examples/screenity-firefox/THIRD_PARTY_NOTICES.md). |
| Krita | Original Qt widget/interface files; LGPL-2.0-or-later / LGPL-2.1-or-later as declared per file | Unmodified source headers and acquired license texts; host GPL text and source accompany the generated module. |
| Element | Original highlighting classes; source offers AGPL-3.0-only OR GPL-3.0-only OR commercial | GPL-3.0-only alternative selected for this example; original copyright header, complete acquired file and both pinned open-source texts retained. |
| GIMP | Original C smoothing function; GPL terms retained with acquired source | Original source/COPYING in generated source slice; prototype is not native-acceptance verified. |
| MQTT Explorer | Original Raw/Diff code; conflicting CC-BY-SA metadata / CC-BY-ND license file | Original notices retained in private generated packages. Generated MQTT apps/bundles are excluded from release; source tooling and a historical case study are retained. |
| VS Code, Joplin, Firefox, OBS, Qt, Electron, Chromium | Caller-supplied runtime/SDK inputs | Their original distribution notices; runtime downloads/copies are excluded from Git and release assets. |

Other npm/Python development tools and dependencies retain the notices distributed
with their installed packages. A derivative binary release needs its own complete
runtime dependency/source/notice review; the source-only repository inventory does
not clear redistribution of prepared applications or grant product branding rights.
