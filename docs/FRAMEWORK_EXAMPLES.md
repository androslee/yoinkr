# Examples and runtime boundaries

The [framework support matrix and application catalog](FRAMEWORK_SUPPORT.md) records verified configurations, limited demonstrations, frameworks not started, and five recognizable application examples for each of 16 families. Listed application examples are not compatibility promises.

| Pair / family | Delivered transfer | Status |
| --- | --- | --- |
| MQTT Explorer → VS Code | Recovered topic/payload core, numeric conversion, and the original Raw/Diff UI package | Verified in named Linux VS Code lab copies; [host proof](FEATURE_HOSTS.md) and [version repair](ADAPTER_REPAIR.md) |
| MQTT Explorer → Joplin | Same complete recovered Raw/Diff package, with Joplin selection/theme/persistence bindings | Verified in Joplin 3.7.21 **safe mode**, using native-textarea selections; normal/rich-editor capture is not verified; [second-host proof](SECOND_HOST.md) |
| VS Code preview assets → Chromium | Markdown styling plus newly written local notebook/table/text viewing | Verified browser-host demonstration; not Chromium C++ integration or built-in MIME support; [showcase](../examples/README.md) |
| Screenity → Firefox | Original drawing tools and history; new local capture/recording backend | Scoped Firefox 158.0 Linux native source-port acceptance; [example and limits](../examples/screenity-firefox/README.md) |
| Krita → OBS | Original Qt triangle selector/interface, RGB adapter and new transparent ink source | Actual scoped Qt Widgets/OBS Linux acceptance including GPU frames, restart, launcher and rollback; [example](../examples/krita-obs/README.md) |
| Element highlighting → VS Code | Original highlighting classes in a newly written local transcript search panel | Twelve scoped native Linux recipient checks; original full Element app/Matrix service acceptance pending; [setup](CREATOR_EXAMPLES.md) |
| GIMP smoothing → OBS | Original C smoothing function, compatibility layer, experimental Qt dock and transparent annotation source | Core numerical checks and OBS/Qt SDK compilation pass; actual GIMP GTK and OBS GUI/rendering acceptance pending; [verification gate](CREATOR_EXAMPLES.md) |
| Native zlib → VS Code | Original compiled library behind a bounded saved-file checksum action | Verified component/process route; not a native desktop GUI toolkit transfer; [bridge proof](COMPONENT_BRIDGE.md) |

MQTT Explorer, VS Code and Joplin share Electron/Node/Chromium, but each recipient needs its own versioned adapter. [Joplin's architecture](https://joplinapp.org/help/dev/spec/architecture/) describes its Electron/React desktop application. Runtime similarity does not establish compatible host APIs or automatic portability.

Chromium itself has a [native multi-process browser architecture](https://www.chromium.org/developers/design-documents/multi-process-architecture/). Sharing the rendering engine does not make its application startup compatible with Electron's Node main process. A native Chromium feature needs a dedicated integration/build route. Firefox likewise needs a separate runtime playbook; no Firefox transfer has been verified.

The showcase demonstrates source/application integration without installing an existing marketplace extension. Extension-based delivery remains an available route when useful. The current acceptance evidence is scoped to particular features and configurations, not whole-application equivalence.
