# A transfer case

The lifecycle is: **investigate → trace → choose route → recover/convert/bridge/reconstruct → integrate → compare → field note**. This follows the intended REA/Universal Modder model.

## Investigation

`yoinkr investigate DONOR RECIPIENT --feature DESCRIPTION --seed SEED --out NEW_CASE`

Inputs may be extracted JS application directories, Electron install directories or `.asar` files. No donor/recipient code executes during static investigation. The output must be outside both apps and must not already exist.

The REA child writes complete stdout to a case file, with backpressure, and stderr to a bounded progress log. Full results remain on disk, so a chat UI need not consume the entire application graph. Each operation has a two-minute overall timeout and a 64 MiB output cap. The analyzer receives a 512 MiB heap budget and a 30-second per-source timeout. Large apps should use explicit source selection or a smaller feature slice. Scoped source selection does not implicitly include omitted dependencies.

The donor graph and recipient graph are preserved verbatim. Feature tracing uses an actual REA request bound to donor Evidence. The case records provider version, both artifact identities, graph IDs, matched seeds, candidate paths, coverage, native handoffs and limitations. `investigated` means static research completed. `no-matching-seed` means another seed is needed; it never means the feature was transferred.

## Recovering code and assets

`yoinkr export-feature CASE --traced --file assets/icon.svg`

`--traced` selects concrete file paths from the retained reachable feature graph. `--file` can be repeated to select additional assets or supporting files. Original bytes and relative paths are preserved in a fresh `private/export-<id>/files` folder. Nothing is copied into the live recipient automatically.

The export manifest records the case ID, donor, route, each file hash and whether its hash was present in the analysis. An additional asset absent from REA's file graph remains explicitly extraction-time-only evidence. Changed analysis-bound files, path escapes, escaping symlinks and oversized working sets fail. Limits: 256 files, 16 MiB per file, 64 MiB total. ASAR unpacked companion entries are not yet supported by this exporter; select an extracted application directory instead.

Recovered virtual modules inside a bundled file are not standalone archive entries; exporting them needs a reconstruction/converter step, which this exporter does not yet automate. Select physical donor paths for the current export command.

An exported working set may still need package metadata, dependency resolution, source-map recovery, native analysis, conversion or host glue. Complete-within-source graph coverage does not establish complete runtime behavior.

## Integration and acceptance

Record the selected transfer route before changing the host. For direct transfer, account for all required imports, browser/Node assumptions, state and side effects. For conversion, retain the converter and source/output hashes. For bridging, define the protocol and process owner. For reconstruction, retain the supporting source/behavior evidence and distinguish newly authored implementation from recovered code.

Use an explicit test fixture or a backed-up host working copy for the first slice. Define inputs/actions and expected outputs from the donor. Compare the recipient result against them, including errors, timing and side effects relevant to the feature. A local file extraction or matching dependency name is not real-host acceptance.

`npm run test:research` demonstrates this with original fixture code: REA finds `format.js` → `math.js`, Yoinkr extracts both plus an SVG, the copied implementation runs in a recipient fixture, eight outputs match the donor, a real ASAR input also works, and changed donor bytes are refused. It does not run any analyzed third-party code.

## Knowledge that compounds

Every case gets `FIELD-NOTE.md` containing artifact identities, provider version, route and sections for integration steps, verification and symptom/cause/fix notes. Record the real result rather than leaving a successful-sounding template. Planned local search will make these cases discoverable for later investigations.
