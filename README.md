# Yoinkr

**Your favorite features. In your favorite apps.**

Yoinkr helps investigate a desktop application's implementation, recover a feature and its dependencies, adapt it to a different application, and check whether the result behaves correctly. It combines a local workbench, a CLI, recipe-driven adapters, and optional MCP tools for coding agents.

It is an experimental developer tool. Transfers require application-specific work; this is not a universal one-click application merger.

## Start here

- **[Examples](examples/README.md)** — choose a donor/recipient pair, build it locally, and see what is actually supported.
- **[Framework support](docs/FRAMEWORK_SUPPORT.md)** — verified routes and explicit gaps.
- **[Transfer workflow](docs/TRANSFER_WORKFLOW.md)** — investigate, recover, integrate, compare, and roll back.
- **[MCP setup](docs/AGENT_TOOLS.md)** — connect a compatible coding agent. No specific AI host is required.

## Install and run

Requires Node **22.19+ on the 22.x line**, **24.11+ on 24.x**, or **26+** and npm. Native examples may require additional tools listed in their own guides.

```sh
git clone https://github.com/androslee/yoinkr.git
cd yoinkr
npm ci --ignore-scripts
node src/cli.js --help
node src/cli.js backend
node src/cli.js doctor
```

To investigate two applications:

```sh
node src/cli.js workbench --app /path/to/donor --app /path/to/recipient
```

Open the localhost URL printed by the command. Supply actual local application directories; downloaded applications and previous investigation cases are not part of this repository. [Workbench guide](docs/INVESTIGATION_WORKBENCH.md).

Analysis and builds run locally without model tokens. Installing dependencies and acquiring third-party inputs require internet access. Connecting an AI agent is optional and may have its own usage charges.

## Examples

| Example | What is transferred | Scope |
| --- | --- | --- |
| [uBlock Origin → VS Code](examples/ublock-vscode/README.md) | Original uBlock, Dark Reader and adapted RES in a browser with vertical tabs and named sessions | Separate browser session; default/custom network filtering, cosmetics, scriptlets and original controls. Linux scope and checks in the example guide. |
| [Krita → OBS](examples/krita-obs/README.md) | Original Qt triangle color selector controlling transparent live ink | Actual OBS dock, GPU scene rendering, restart and guarded rollback verified on the pinned Linux/Qt lane. RGB host; not Krita’s full paint engine. |
| [Screenity → Firefox](examples/screenity-firefox/README.md) | Original drawing, highlighting, arrows, shapes, text and history modules | Experimental Firefox recording studio with a separate portable browser/profile. Partial port; see the example for tested capture modes and limits. |
| [MQTT Explorer → VS Code / Joplin](examples/mqtt-raw-diff/README.md) | Recovered Raw/Diff comparison UI | Historical verified result; source tooling retained, generated MQTT apps/bundles excluded from release. |
| [Element → VS Code](examples/element-search/README.md) | Original message-highlighting classes | Native local transcript-search window. Does not include Matrix services or the full Element UI. |
| [GIMP → OBS](examples/obs-annotations/README.md) | Original stroke-smoothing function | Experimental Qt dock/annotation source; compilation and numeric checks established, actual OBS/GIMP GUI acceptance pending. |

Each example describes original versus new code, exact input versions, setup, output locations and verification limits. Third-party source/runtime downloads, browser profiles, credentials, recovered payloads, screenshots and large binaries are generated locally and excluded from Git.

### Featured: VS Code research browser

The [uBlock Origin → VS Code example](examples/ublock-vscode/README.md) adds a native browser window to a separate copy of Code:

- **Full original uBlock Origin MV2**, with custom filters, subscriptions, per-site controls and the original dashboard/logger. Network blocking, cosmetic filtering, scriptlets and CSP header enforcement are verified.
- **Dark Reader and Reddit Enhancement Suite**, with always-visible enable/disable and settings buttons.
- **Vertical tabs, named local sessions and automatic tab restoration.**

This restores the original blocker's filtering workflow in the tested Electron host. It does not claim a measured blocking-rate advantage over Lite. DNS/CNAME uncloaking and Firefox response-body filtering remain future work. The guide includes setup, build, verification and rollback instructions; native verification currently covers Linux x86-64. Source and recipes are shared here; downloaded applications, generated builds and browsing profiles stay local.

## How transfers work

1. **Investigate** the donor and intended recipient using the pinned [REA](https://github.com/morluto/rea) analysis engine.
2. **Recover** a bounded feature, keeping its original code, assets, dependencies and attribution.
3. **Adapt** the browser/host interfaces through an explicit recipe. A missing host API may require replacement code or make a transfer infeasible.
4. **Verify** behavior against original inputs, check permissions and lifecycle, and retain a reproducible result.
5. **Deliver** into a separate application copy with drift checks and rollback where supported.

An extension, source module, rendered UI and native component are different transfer boundaries. Passing one example does not establish arbitrary compatibility with its entire framework. Windows and macOS native application adapters remain unverified.

## Documentation

| Task | Guide |
| --- | --- |
| Understand the public repository layout | [Repository contents](docs/REPOSITORY.md) |
| Explore framework/application candidates | [Framework catalog](docs/FRAMEWORK_EXAMPLES.md) |
| Use CLI and local investigations | [Transfer workflow](docs/TRANSFER_WORKFLOW.md), [evidence queries](docs/EVIDENCE_QUERIES.md) |
| Export and reproduce a recipe | [Portable delivery](docs/PORTABLE_DELIVERY.md) |
| Build recovered UI packages | [Feature packages](docs/FEATURE_PACKAGES.md), [host adapters](docs/FEATURE_HOSTS.md) |
| Use agent tools | [MCP setup and permissions](docs/AGENT_TOOLS.md) |
| Preserve existing Modkit workspaces | [Rename compatibility](docs/RENAMING.md) |
| Prepare a release or hand off Windows checks | [Release checklist](docs/RELEASE_CHECKLIST.md) |

## Development

```sh
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and pull-request guidance.

The regression suite uses temporary fixtures. Native and browser checks need the runtimes/tools documented in each example and write local results. Historical development receipts are not bundled; reproduce the relevant checks rather than assuming a missing local screenshot exists in a fresh checkout.

## License and attribution

Yoinkr is licensed under [GNU GPLv3](LICENSE). Third-party software and recovered features retain their own licenses, notices and redistribution requirements. Public examples contain acquisition recipes and host code; they do not grant new rights to donor applications. [Upstream provenance](docs/UPSTREAMS.md), [third-party notices](THIRD_PARTY_NOTICES.md) and [license review](docs/LICENSING.md).


## ANDRos note

thanks for taking a look.  my inspiration for this was the deepseek harness with its cordis plugin system.  where you could just about add anything to it.  infintely modable.  and the universal modder (rehan-remade/universal-modder) for video games.  after looking into it and realizing "other things" likely had the same attack vector/exploit possibility that was used there (common applications built on the same engines/frameworks), i thought that idea should be able to transfer to something broader.  why not desktop applications too.  can we take features from application FOO and easily transfer them exactly into the 2nd application BAR because they are built on the same framework BAZ.

and yes, i think so.
