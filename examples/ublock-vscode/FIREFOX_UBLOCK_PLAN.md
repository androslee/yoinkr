# Firefox uBlock capabilities in the Chromium host

The goal is to retain the original uBlock filtering engine while giving it browser capabilities from a host we control. Installing a Firefox XPI or changing its manifest does not implement those capabilities.

## What we have established

The current demo loads the original **uBlock Origin 1.75.0 Chromium MV2** package from Raymond Hill's GitHub release. It does not load uBlock Origin Lite or an unrelated extension branded “classic.” Current regular Chrome cannot restore MV2 support just by installing an archive from GitHub. Electron is a separate host with its own extension implementation.

`node acquire.mjs --firefox-audit` downloads both original packages with pinned SHA-256 checks. `node audit-firefox.mjs` compares them without executing the Firefox package. For the pinned release, these files are byte-for-byte identical:

- `js/static-net-filtering.js`
- `js/cosmetic-filtering.js`
- `js/scriptlet-filtering.js`
- `js/html-filtering.js`

That establishes shared source, not complete browser parity. A copy of the HTML filtering code can exist in a package whose host cannot run its response-stream hooks. Raw audit results stay in the repository's ignored `.local/verification/firefox-ublock-audit/` directory.

References: [upstream packages and supported hosts](https://github.com/gorhill/uBlock#readme), [Firefox advantages documented by the author](https://github.com/gorhill/uBlock/wiki/uBlock-Origin-works-best-on-Firefox), [Chrome MV2 removal](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline).

## Capability boundary

| Capability | Current demo | Work needed for the Firefox route |
| --- | --- | --- |
| Cancel network requests using uBlock decisions | Native scoped tests pass | Preserve behavior and request identity through the new API adapter |
| Response-header/CSP filtering | Native test prevents inline script execution through an original uBlock rule | Preserve actual blocking headers through the response transport |
| Cosmetic filtering and page-world scriptlets | Native scoped tests pass | Preserve frame coverage and execution timing |
| Delay restored browser tabs until uBlock is ready | Implemented and verified | Keep the same gate for the Firefox engine |
| Original popup, custom rules, lists, site exceptions and logger | Available; scoped controls tested | Adapt Firefox-specific environment and resource conventions |
| DNS/CNAME and IP-aware filtering | Not supplied | Implement a real resolver-backed `dns.resolve` API and request integration |
| Filter HTML before Chromium parses it | Not supplied | Implement response interception and the `filterResponseData`/StreamFilter lifecycle |
| Response-body `replace=` filtering | Not supplied | Handle encodings, streaming and replacement semantics correctly |
| Complete Firefox browser behavior | Not claimed | A conformance target, not a consequence of sharing a framework |

The Firefox XPI is an audit input only. It is not silently loaded as a supported plugin. No unsupported Firefox API is replaced with a success-returning stub.

## Proposed host architecture

A host-side request coordinator can make decisions before Chromium renders the result. This is more than a simple proxy: page identity and browser lifecycle are essential for uBlock's per-site and per-frame policies.

```text
Browser navigation or subresource request
  → host assigns tab/frame/request/redirect identity
  → resolver supplies canonical name chain and IP records when needed
  → original uBlock network engine returns allow/block/redirect/header decisions
  → native browser network stack performs the allowed request
  → eligible response bytes pause before parsing
  → original uBlock HTML/response filtering code processes those bytes
  → host delivers the filtered response to Chromium
  → original cosmetic filtering and scriptlets operate on the page
```

A network-only proxy cannot replace the final DOM and scriptlet steps. Putting the entire extension “before Chromium” would lose those browser-side functions. The intended division is native request/response control plus original page integrations.

### Stage 1: API inventory and test contract

1. Pin Firefox and Chromium packages from the same upstream release and record source hashes.
2. Inventory actual Firefox-specific calls, event semantics and feature detection. Compare against the existing native acceptance suite.
3. Define supported APIs explicitly. Do not spoof Firefox browser identity to turn on code paths before the APIs exist.
4. Add an explicit experimental mode and a capability/status panel. Preserve the currently verified mode as the default until the new route passes acceptance.

Completion: a reproducible comparison, explicit API contract and fixtures for each missing behavior. The current source audit is the starting point; it does not complete the runtime port.

### Stage 2: DNS/CNAME and IP filtering

1. Add a scoped, validated DNS service callable only by the pinned blocker context.
2. Return real canonical-name chains, addresses and errors. Bound concurrency, lookup deadlines, cache size and TTLs; handle loops, NXDOMAIN, IPv4/IPv6 and cancellation.
3. Decide how resolver policy relates to the browser's DNS/DoH settings. A host resolver that observes a different answer from the browser is not sufficient evidence of accurate CNAME filtering.
4. Feed the resulting alias/IP context through the original Firefox request logic and its cache, keeping tab/frame context and site exceptions intact.

Acceptance: a controlled local resolver serves a first-party-looking alias that resolves to a blocked tracker. Verify the request is blocked before the destination sees it, while an explicit exception and an unrelated first-party request load normally. Measure cold/warm latency, timeouts and parallel requests. Direct tracker-host blocking alone does not prove CNAME uncloaking.

### Stage 3: Response interception before parsing

1. Prototype a response transport in the isolated browser session. Electron request hooks alone do not provide Firefox's response-body StreamFilter. Chromium DevTools Fetch interception is a candidate to investigate, not a completed implementation.
2. Give one coordinator ownership of the request lifecycle. Do not register a competing Electron `webRequest` interceptor that silently suppresses the current extension's request listeners. Do not correlate simultaneous requests using URL alone.
3. Map native request IDs, redirects and frame/document IDs consistently to the extension API. Request- and response-stage interception IDs must refer to the correct request leg.
4. Supply actual StreamFilter operations and event ordering: data, write, suspend/resume, close, disconnect, error and navigation cancellation. Preserve binary bytes until a filter has selected a text encoding.
5. Support compressed responses, charset detection, chunk boundaries and empty bodies. Update byte-dependent headers correctly. Keep CSP, CORS, cookies, authentication, TLS certificate verification and origin isolation enforced.
6. Bound buffering and CPU work, use backpressure, and cancel filtering when its tab closes. Unsupported or failed filtering must be visible; a required filtering decision must not silently deliver an unfiltered response.

Acceptance: the server includes a script that sets a sentinel. A real uBlock HTML filter removes that script and the sentinel never executes. Removing it after execution or merely hiding its DOM node is a failure. Repeat with redirects, concurrent identical URLs, subframes, cached responses, service workers, compressed bodies, non-UTF-8 text and streamed chunk boundaries. Add a `replace=` fixture and a byte-for-byte passthrough fixture for unmodified content.

### Stage 4: Firefox package integration

1. Adapt Firefox resource URLs, menus, storage, runtime metadata and permission conventions through explicit host adapters. Keep original files and document every derived manifest/preload change.
2. Run the original Firefox filtering code against the new DNS and stream services.
3. Retain the visible global enable/disable switch, original popup and a truthful capability display. Verify unload/reload, startup, tab closure and restart.
4. Verify that disabling the feature actually removes its effects; previously injected page code may require a page reload.

Completion: the original Firefox package's relevant features pass behavior tests in the recipient. Loading its manifest successfully is not acceptance.

### Stage 5: Effectiveness and performance comparison

Compare current Yoinkr MV2 mode, the new host mode, real Firefox with original uBlock, and current Chrome with uBlock Origin Lite. Use identical filter-list snapshots and test pages. Measure blocked/allowed requests, exceptions, pre-execution filtering, page completion, peak memory and latency. Record failures and API gaps separately from scores.

Only then describe the new route as matching particular Firefox capabilities. No “blocks every ad” or universal browser-superiority claim follows from the current fixture tests.

## Distribution

Keep downloaded extensions, profiles, certificates and raw reports ignored. Publish host source, pinned recipes, notices, reproducible tests and curated documentation. The Firefox port must retain uBlock's GPL obligations and attribution. No DSH or model-provider connection is required for the browser or its filtering.
