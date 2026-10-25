# Source and generated-output license review

Scope: pre-publication review of Yoinkr's source-only repository and the named
example outputs. This records observable declarations and retention checks; it
does not resolve conflicting upstream grants or certify legal compliance for
arbitrary redistributed application bundles. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## MQTT Explorer: generated integration excluded from release

At pinned revision `35f31973c456a024a37450f5961e4610dc9a9ce0`,
[package.json](https://github.com/thomasnordquist/MQTT-Explorer/blob/35f31973c456a024a37450f5961e4610dc9a9ce0/package.json)
declares CC-BY-SA-4.0, while
[LICENSE.md](https://github.com/thomasnordquist/MQTT-Explorer/blob/35f31973c456a024a37450f5961e4610dc9a9ce0/LICENSE.md)
is Attribution-NoDerivatives 4.0 and includes an attribution/donation-page condition.
Neither declaration is silently chosen over the other. Original source/license
bytes remain pinned and are retained in locally recovered packages.

The owner chose to retain source tooling and document the historical result, while
excluding generated MQTT apps and bundles from release. This does not block the
source-only Yoinkr release. No upstream contact will be made. No permission to
redistribute a generated MQTT derivative is inferred; a future derivative release
would require its own resolved license basis. Technical reproducibility does not
resolve licensing.

## Element: select an offered alternative and retain attribution

The pinned `HtmlUtils.tsx` header explicitly offers
`AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial`, with named copyright
holders. This example selects the offered GPL-3.0-only alternative; it does not
claim that Element as a whole is GPL-only. Both acquired open-source license texts
are hash-pinned. The full original copyright/license header is preserved in the
extracted TypeScript and compiled highlighting module, and the complete original
file remains under `originals/` in the feature package. The generated notice records
which branch is selected. Original algorithms are sliced unchanged; host code is new.

## Screenity / Fabric: generated notice delivery

Original Screenity files, GPL text and full upstream notices remain byte-identical.
The port uses Fabric 7.4.0 rather than assuming the full upstream application's
notice inventory covers the new build. Its full MIT text is copied from the pinned
installed package to both the extension and corresponding-source tree. A separate
Yoinkr notice explains original versus new code and the actual bounded dependency
set. The host's full GPL text is included with its corresponding source.

`node verify-notices.mjs` in the example checks these actual output files and launch
integrity coverage. CI runs it after a clean source build. Upstream notices that
mention omitted full-product components are retained for provenance, not presented
as proof those components ship in this port.

## Krita / OBS: preserve per-file licenses

The triangle-selector files declare LGPL-2.1-or-later; the base-interface header
declares LGPL-2.0-or-later. Do not collapse these into a claim that every Krita file
has one license. Acquired source and applicable texts remain in `source/donor/`.
The generated source now explicitly includes the new host's full GPL text under
`source/rebuild/LICENSE`, alongside its build scripts and attribution notice.
OBS, Qt and copied libraries retain separate distribution obligations.

## Browser extension host and other routes

The [browser example notices](../examples/ublock-vscode/THIRD_PARTY_NOTICES.md)
identify original packages, exact versions, selected GPL compatibility-layer option,
MIT texts and corresponding-source locations. All package archives remain unchanged;
RES's manifest adaptation is disclosed and its original manifest retained.

GIMP smoothing remains a source/numerical prototype with original COPYING retained;
its compilation does not clear GTK/OBS native acceptance. Generated MQTT integrations remain
excluded as above. Installed REA and other dependencies keep their own package
notices. Runtime/SDK downloads and branding are not included in the public repository.

## Distribution boundary

Review root source/recipes separately from each generated derivative. Do not attach
prepared applications, browser profiles or recovered donor packages to a release
merely because a recipe exists. Preserve originals, modifications, notices and exact
corresponding build sources; keep unsupported platform/feature claims explicit.
No commercial-license entitlement, maintainer approval or trademark permission is
inferred from a successful build or a package metadata field.
