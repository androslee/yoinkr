# MQTT Explorer Raw/Diff original-app baseline

Reference donor revision: `35f31973c456a024a37450f5961e4610dc9a9ce0` from the official MQTT Explorer repository.

`recipe.json` describes the original comparison UI, required/optional/excluded behavior, source entry candidates, dependency hypotheses and 83 declared actions with 38 assertions. The corpus is authored test data, including a bounded 16,394-character stress message. Paths are donor-relative; application paths and profiles are supplied at execution time.

Use the [feature baseline guide](../../docs/FEATURE_BASELINES.md) to build the original app, prepare REA Evidence, capture it on a private display, and generate an offline report. A completed baseline is not a completed feature package or recipient integration.

The actual visible entry is `DetailsTab.tsx`, using the original `ValueRenderer`/`CodeDiff` components. Explicit topic re-selection accounts for an observed stale-view defect. The recipe also records original empty-payload topic removal. These are documented findings, not silent modifications to the donor.
