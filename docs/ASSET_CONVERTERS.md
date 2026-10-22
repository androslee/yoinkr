# Asset/data converters (v0.15)

Yoinkr now converts two explicitly supported donor formats into portable recipient assets. Every run retains the original files, recipe, exact input/output hashes, converter version and implementation hashes, dependencies and conversion limitations. Converters are fixed local functions: recipes cannot run commands, load plugins, install dependencies or fetch URLs.

## Delivered example

Open `builds/converters-v0.15/run/preview.html` in a browser, or run:

```sh
./builds/converters-v0.15/open-preview.sh
```

The standalone recipient scratchpad uses **Dark Modern and Light Modern colors from the locally installed VS Code** and **28 original JavaScript snippet templates**. Switch themes, search templates, select one and click **Use template**. The scratchpad inserts the original literal text, including placeholders, so it is editable without running VS Code or installing an extension. It works offline as a local HTML file. Reloading resets unsaved scratchpad edits.

The recipient is new demonstration code; the donor assets are original bytes from the installed application. This proves format conversion and use of the outputs, not transplantation of VS Code's editor, full theme engine or snippet expansion behavior. No new REA investigation or recovered executable-code claim is made for these known asset formats. Use an investigation/export to establish provenance when locating unfamiliar assets; these converters complement that workflow.

`SHOWCASE.json` identifies the installed donor/version and paths. `run/inputs/package.json` and `run/inputs/LICENSE.rtf` retain the package metadata and supplied license. Automated acceptance compares converted results to an independent oracle over the original JSON, tests actual rendered colors and literal template insertion, and checks inert hostile content and zero network requests. Evidence and screenshots are under `acceptance/`.

## Commands

From the Yoinkr project directory:

```sh
node src/cli.js conversion-plan ./conversion.json --input-root /path/to/donor-assets
node src/cli.js convert ./conversion.json --input-root /path/to/donor-assets --out /path/to/new-run
node src/cli.js conversion-status /path/to/new-run
```

Planning performs validation and conversion in memory without creating output or running donor code. Applying checks all pinned inputs before creating an absent output directory, outside the input and recipe roots. It writes a fresh output only; originals and existing runs are never patched. An ordinary failure removes only its incomplete new run. Status checks retained files against their recorded hashes and returns a nonzero CLI exit status on drift. It does not silently overwrite changed assets. To undo an integration, retain the old recipient working copy or use a separate Electron playbook; deleting a converter output does not undo changes you manually made elsewhere.

To reproduce the delivered example in a new directory:

```sh
node scripts/applications/build-converter-showcase.mjs --out ./builds/my-asset-conversion
# Optional: --source /path/to/extracted/Code/resources/app
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node scripts/applications/converter-smoke.mjs ./builds/my-asset-conversion
```

## Recipe

```json
{
  "schema": 1,
  "kind": "asset-conversion",
  "id": "example-assets",
  "inputs": [
    {"file": "theme.json", "sha256": "<exact SHA-256>", "role": "source"},
    {"file": "base.json", "sha256": "<exact SHA-256>", "role": "source"},
    {"file": "snippets.json", "sha256": "<exact SHA-256>", "role": "source"},
    {"file": "LICENSE.txt", "sha256": "<exact SHA-256>", "role": "license"}
  ],
  "transforms": [
    {"id": "theme", "kind": "vscode-theme-css", "input": "theme.json", "output": "theme.css"},
    {"id": "templates", "kind": "vscode-snippets-json", "input": "snippets.json", "output": "templates.json"}
  ]
}
```

Replace illustrative hashes with exact 64-character lowercase SHA-256 values. The delivered recipe under `builds/converters-v0.15/recipe/` contains real pinned values. Input paths are relative to `--input-root`; output paths are relative to the run's `outputs/` directory. All files must be ordinary files, with no symlink path components or traversal. Duplicate/overlapping paths, unknown fields, unknown converter names, missing source pins and mismatched extensions are refused. Input roles are `source`, `license` or `metadata`; only source-role files may be consumed by a converter. Every theme include must be separately listed and pinned. No automatic network download or dependency discovery occurs.

## Supported conversions

| Converter | Output | Preserved and limited behavior |
|---|---|---|
| `vscode-theme-css` | CSS `:root` variables | Resolves relative, pinned includes; child values override parent values; maps seven workbench colors into the recipient palette. Only hex color syntax is accepted for mapped values. Records each mapped value's source, fallback keys and unmapped keys. |
| `vscode-snippets-json` | Schema 1 `modkit-snippets` JSON | Converts named entries into a stable, name-sorted list with prefixes, body, description, scope and file-template flag. Joins multiline bodies with LF, deduplicates prefixes, and preserves placeholders/variables literally. Reports unrecognized entry fields. |

JSONC inputs support BOM, line/block comments and trailing commas without rewriting comment-like text inside strings. Invalid JSON syntax is rejected. Standard JSON duplicate-key behavior applies; do not rely on duplicate keys in authored recipes or assets.

The theme palette maps `editor.background`, `editor.foreground`, `sideBar.background`, `button.background`, `button.foreground`, `focusBorder` and `input.background` to `--mk-background`, `--mk-foreground`, `--mk-panel`, `--mk-accent`, `--mk-accent-text`, `--mk-border` and `--mk-input`. Missing keys use explicitly reported recipient defaults. TextMate/semantic token rules and other workbench tokens are not implemented. Unsupported mapped color expressions are refused, rather than copied into executable CSS. These outputs are small recipient palettes, not complete VS Code themes.

Snippets are inert data. Neither conversion nor the scratchpad evaluates JavaScript, expands variables, interprets tab stops or executes snippet bodies. The preview renders donor text through text nodes and form values, with a script-hash CSP and no network connections. The converted CSS is loaded from the actual output file. Preview template data is embedded from the generated JSON output at conversion time; it is not reread after arbitrary manual edits. Run status checks before using modified output directories.

## Provenance layout

- `recipe.json`: exact original recipe bytes.
- `inputs/`: exact source, license and metadata bytes.
- `outputs/`: converted CSS/JSON, suitable for copying into a reviewed recipient working copy.
- `preview.html`: a self-contained interactive recipient demonstration with local CSS references.
- `CONVERSION.json`: recipe hash, source root, converter version and source hashes, per-output dependency hashes, detailed mapping/omissions, and artifact hashes.

Unreferenced source inputs are listed rather than silently treated as used. Converter code hashes identify the implementation that created the run. Later status checks verify artifacts, not donor-to-recipient semantic equivalence; native/behavioral acceptance remains a separate step. Hashes detect drift and corruption, not malicious rewriting of the entire report and its assets. The generated preview is a convenience for reviewed local outputs, not a signature or a substitute for input provenance.

## Bounds

A recipe has 1–32 pinned inputs and 1–16 transforms. Each input/output is at most 4 MiB; input and output totals are separately capped at 16 MiB. Metadata is capped at 4 MiB and previews at 8 MiB. Theme includes have depth at most eight; each file has at most 4096 color tokens. Snippet files contain at most 512 entries with bounded names, prefixes and bodies. The preview embeds at most 512 converted templates across outputs and displays at most 50 matching choices at once. Full converted templates remain in their JSON outputs. No general image, archive, binary or arbitrary asset conversion is claimed.
