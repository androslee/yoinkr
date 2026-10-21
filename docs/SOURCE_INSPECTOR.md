# Recovered source inspector (v0.6)

Open `reports/mqtt-sources-v0.6.html` in a browser for the ready-made MQTT Explorer source investigation. The original graph report remains available. Everything runs locally without model tokens or page network requests.

## Read recovered files in the report

Select an exported file to see its decoded text, line numbers, byte count, SHA-256 and provenance. Use a line/column jump or case-sensitive text search. Graph nodes with a matching donor source range offer an **Open recovered source** button. Recipient nodes do not borrow donor files merely because their paths match.

The source inspector reads an explicitly selected private export. It does not read arbitrary paths from a graph or consult the current live donor installation. Binary/non-UTF-8 files show metadata. Text is inert: scripts, HTML, SVG and source comments are never executed or rendered as active document markup.

```sh
node src/cli.js case-report ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID \
  --out ./reports/my-feature-with-source.html

node src/cli.js case-source ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID \
  --file path/to/module.js --line 42 --column 0
```

`case-source` returns JSON with an excerpt, exact source hash, line count and provenance; it does not print the entire file. Lines are 1-based and columns are 0-based. There is no source execution, installation, extension API or live-app attachment.

## Source maps

Export the map explicitly, in addition to the generated source. A flat version-3 source map can supply an embedded original through `sourcesContent`:

```sh
node src/cli.js export-feature ./cases/my-feature \
  --traced --file dist/bundle.js.map

node src/cli.js case-source ./cases/my-feature \
  --export ./cases/my-feature/private/export-ID \
  --file dist/bundle.js --line 12 --column 8 --map dist/bundle.js.map
```

The decoder is pinned `@jridgewell/trace-mapping@0.3.31`, also used to prepare the report's mapping data. A map is associated with generated code by its declared `file`, or, when that is absent, an exact local trailing `sourceMappingURL` reference in the exported generated text. Remote/data references are not fetched. Conflicting or absent associations do not imply a match.

In the browser, select the map and enter a generated line/column to inspect its original location. Mapping uses the nearest preceding segment on the **same generated line**. An unmapped segment stays unmapped rather than carrying forward another source's location. You can also open an exported `.map` file directly and browse its embedded originals.

Original names and `sourceRoot` are labels, including URL-like and traversal-like names: they are not used to read a filesystem path or fetch a URL. Missing `sourcesContent` stays unavailable. Each embedded original gets a hash of its UTF-8 text and a separate provenance label. This verifies what the exported map contains, not that the map's claims or original artifact identity are independently correct.

Indexed/sectioned maps, inline data-URL maps and fetching missing originals are not implemented. Malformed/oversized maps appear as unsupported records in a report; an explicit CLI mapping request fails clearly. Source maps do not establish behavioral equivalence.

## Integrity and limits

The case's retained donor/recipient/trace Evidence hashes and IDs are checked first. The export must be inside that case and match its case ID and donor artifact identity. Every exported file is hash-checked against its manifest. Where retained REA file bytes exist, their hash must also match, even if a manifest tries to downgrade the file to extraction-only. Unsupported analysis-bound claims, duplicate paths, traversal and escaping symlinks are refused.

Files not represented in the REA file identity graph retain extraction-only provenance. Embedded map originals remain separately attributed even when they resemble an exported source. Original files, case Evidence, exports and live applications are unchanged.

- Export: at most 256 files, 16 MiB each and 64 MiB total; manifest up to 4 MiB.
- Report source previews: 262,144 characters per text and 2,097,152 characters total, shared by file previews and embedded originals. Omitted characters are reported; hashes cover the complete bytes/text.
- Code windows: up to 81 lines, 4,000 characters per displayed line. A location beyond the preview shows a boundary message.
- CLI excerpts: up to 21 generated-source lines and 11 original-source lines, 4,000 characters per line. Requested lines/columns cap at 10,000,000.
- Maps: UTF-8 JSON up to 4 MiB, flat v3, up to 256 sources, 262,144 mapping characters and 50,000 decoded segments. Normal and unmapped segments are retained.
- Total embedded report data still caps at 24 MiB. Smaller source selections/exports are needed beyond that limit.

Reports contain recovered source and local paths. They belong with the corresponding private case, subject to the donor's original licenses. No source is published automatically.

## Verification

`npm test` covers original and manifest tampering, retained-REA binding, case ownership, escaping paths/symlinks, binary display, mapped/unmapped positions, missing originals, unsupported maps and preview limits.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:sources
```

The opt-in acceptance test checks the actual recovered MQTT Explorer files and separately builds a TypeScript fixture with esbuild, analyzes it with actual REA and exports its generated code/map. Browser checks cover line jumps, find, graph links, mapped originals, inert hostile source text, themes and no page HTTP requests. `YOINKR_CASE` and `YOINKR_EXPORT` select the donor case/export; `YOINKR_SOURCE_EVIDENCE` can select a new evidence directory. The fixture is explicitly labelled and is not presented as another real-app transplant.
