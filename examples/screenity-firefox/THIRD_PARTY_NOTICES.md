# Screenity → Firefox notices

- **Screenity 4.7.0**, Alyssa X and contributors: GPL-3.0. The recipe pins the
  original drawing/history modules and full upstream LICENSE and
  THIRD_PARTY_NOTICES.md. They are acquired from the specified upstream revision;
  corresponding acquired files are preserved under `source/screenity/`.
- **Fabric 7.4.0**, Printio, Andrea Bogazzi, Shachar Nen and Fabric.js contributors:
  MIT. This build uses the separately pinned npm browser implementation, which
  differs from the upstream full application's dependency tree. Its complete
  copyright/permission notice is copied as `extension/FABRIC-LICENSE.txt` and
  `source/yoinkr/FABRIC-LICENSE.txt`. Source: https://github.com/fabricjs/fabric.js .
- **Yoinkr host code**: GPL-3.0-only; complete project license and host/build sources
  are under `source/yoinkr/`. Original Screenity files are not relicensed.
- **Firefox** is a caller-supplied runtime, with its own licenses and notices. This
  source repository does not distribute a Firefox installer or grant branding rights.
- **esbuild and web-ext** are development/launch tooling, installed separately by
  npm with their upstream notices. The generated studio does not include Android
  tooling or the full original Screenity application's MediaPipe/cloud components.

The unmodified upstream THIRD_PARTY_NOTICES.md describes the original full
Screenity product; it is retained for provenance, not a claim that all listed
components are present in this bounded port. Keep these Yoinkr-specific notices,
Fabric's MIT text, original notices and corresponding sources with any separately
redistributed derivative, and review applicable runtime distribution terms.
