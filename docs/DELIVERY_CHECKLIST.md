# Yoinkr phase 1 delivery checklist

The phase 1 delivery plan has **16 milestones: 16 delivered and 0 remaining** after v0.18. These are release-sized milestones, not individual implementation tasks or a promise to support every application/runtime. The earlier v0.2 renderer-loader repair is historical groundwork outside this count.

Five broad workstreams remain the organizing structure: investigation/prior work, real feature transfers, host/converter playbooks, differential verification, and agent integration. Earlier roadmap headings described ongoing areas rather than a finite list. This checklist gives that scope explicit delivery points; new requested features should be added openly rather than silently changing the total.

| # | Release | Milestone | Status |
|---|---|---|---|
| 1 | v0.3 | REA investigation, original-byte recovery, provenance | Delivered |
| 2 | v0.4 | Recipe integration and extension-free native showcase | Delivered |
| 3 | v0.5 | Offline investigation graphs and prior field-note search | Delivered |
| 4 | v0.6 | Recovered source and source-map inspector | Delivered |
| 5 | v0.7 | Typed Evidence queries and investigation history | Delivered |
| 6 | v0.8 | Interactive local workbench | Delivered |
| 7 | v0.9 | New investigation wizard and explicit export selection | Delivered |
| 8 | v0.10 | Observable examples and screenshot records | Delivered |
| 9 | v0.11 | Saved JSON module replay and retained differences | Delivered |
| 10 | v0.12 | Declarative recipient browser UI replay and screenshot/report evidence | Delivered |
| 11 | v0.13 | MQTT numeric plotting → native VS Code, with dependency classification and actual host acceptance | Delivered |
| 12 | v0.14 | Reusable Electron renderer/preload/main-process playbooks, version checks and rollback | Delivered |
| 13 | v0.15 | Reusable asset/data converters with input/output provenance and recipient previews | Delivered |
| 14 | v0.16 | One bounded managed/native component workflow through existing REA provider evidence/runtime tooling | Delivered |
| 15 | v0.17 | Workbench-wide prior-case/field-note search and reusable findings | Delivered |
| 16 | v0.18 | Standalone Yoinkr case/transfer agent tools around REA MCP, with optional standard client setup | Delivered |

## Phase 2

The [detailed phase 2 plan](PHASE_2_PLAN.md) adds **8 milestones, numbered 17–24**, with milestone 17 delivered in v0.19 and seven remaining. Phase 1 remains complete; the combined roadmap has 24 scoped milestones: 17 delivered and 7 planned. Phase 2 focuses on original UI/behavior recovery, the same package in two real hosts, reusable recipient adapters, stronger acceptance, process bridging, version repair and public reproducibility. Its status is tracked separately in that plan.

## Delivered scope and further work

All 16 numbered milestones are delivered. Milestone 16 exposes Yoinkr operations through the official stdio MCP SDK, reuses existing REA analysis, retains paged job results and generates reviewable standard client configuration. Per the project direction, DSH is not a dependency and no client configuration is installed automatically. See [Standalone agent tools](AGENT_TOOLS.md).

The finite plan being complete does not mean every app feature or runtime can be transferred. Additional host/runtime workflows, broader acceptance and new donor/recipient integrations should be scoped as new work. Milestone 15 remains available through the [Prior work library](PRIOR_WORK_LIBRARY.md).

Milestone 10 is specifically browser-interface acceptance against declared outcomes. It does not claim native Electron/desktop event recording, pixel-equivalent donor/recipient comparison, arbitrary side-effect replay or whole-application equivalence. Those remain broader work that must be scoped explicitly rather than folded into a passing UI recipe.
