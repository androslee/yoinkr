# mod.json — the mod manifest

One `mod.json` per mod directory, next to the entry script. `schema` is `1`.

Validation splits into **errors** (the mod is skipped; `yoinkr validate` exits 1)
and **warnings** (the mod still loads, but you are told). The point of the split:
anything that could load the wrong thing is an error; anything that merely
suggests the mod is unproven is a warning.

## Fields

| field | required | meaning |
|---|---|---|
| `schema` | yes | must be `1` |
| `id` | yes | stable identifier; used by `enable`/`disable`, `conflicts_with`, and the disable log |
| `name` | yes | display name |
| `version` | yes | the mod's own version |
| `entry` | yes | path, relative to the mod directory, to the script injected into each renderer document |
| `targets` | yes | at least one `{app, versions, tested?}` |
| `touches` | no | what the mod claims to disturb — see below |
| `conflicts_with` | no | mod ids that must not load alongside this one |
| `exclusive` | no | `true` = this mod refuses to share the app with any other |
| `provenance` | no | where the mod's inputs came from |

### targets

```json
{ "app": "code", "versions": "^1.40.0", "tested": ["1.42.1", "1.43.0"] }
```

`app` is the install directory name as reported by `yoinkr list`, or `"*"`.
`versions` is required even when it is `"*"`, because an omitted range usually
means "nobody thought about it" rather than "tested against everything".
`tested` is a list of exact versions known to work; a version in `tested` matches
even if the range would not, which is how a mod gets pinned to what it was
actually checked against.

### touches

```json
"touches": {
  "dom": ["#workbench.parts.statusbar"],
  "ipc": ["command:workbench.action.showAllSymbols"],
  "globals": ["window.myMod"],
  "files": ["resources/app/out/"]
}
```

Each key takes an array of strings. Two mods that declare the same touch point
produce a `touch_overlap` **warning** — overlap is often fine, but it is the
first thing to look at when two mods misbehave together, so it is said out loud
at plan time rather than discovered later.

`files` is a claim, not an instruction: yoinkr does not write into the app. It
exists so a mod that vendors a copy of something can say so.

### provenance

```json
"provenance": { "source": "hand-written", "redistributes_app_files": false }
```

An unset `source` is a **warning**. A mod that redistributes app files gets a
warning too — that is a licensing question, not a technical one, and it should be
asked before shipping, not after.

## How the loader uses it

- A mod whose `targets` do not match the app is **skipped**, and the plan says so.
- A `conflicts_with` or `exclusive` match **refuses the launch** (`--force`
  overrides, and the refusal is still printed).
- The manifest is what safe mode keys on: disable-on-failure acts on the
  **most recently added** mod, one mod per crash, and records the reason.
- `pin` records which mod ids were present when the baseline was taken, so a
  drift report names the mods that were relying on the old bytes.

## What is deliberately not here

No `depends_on` resolution, no load-order directives, no priority. Load order is
install order (`~/.modkit/state/<app>/state.json`), and if a mod needs a
specific order it should not be pretending the manifest controls that.

## v0.2 validation and loading clarifications

Identifiers use letters/digits followed by letters, digits, dot, underscore or hyphen (maximum 128 characters). Entry paths must be relative and remain in the mod directory after resolving symlinks. Duplicate loaded IDs are errors. `conflicts_with` must be a string array; `exclusive` must be boolean.

The range subset is `*`, exact `x.y.z`, `>=x.y.z`, and `^x.y.z`. Unsupported syntax and prereleases are refused; no coercion of malformed versions occurs. Zero-major caret ranges stop at the next minor (`^0.2.1`) or exact patch (`^0.0.1`) boundary. Tested versions must be exact x.y.z strings.

Only enabled mods participate in conflict checks. Safe mode runs the app without mod injection or a debug endpoint. Install order persists when a new mod is first launched; filesystem enumeration changes do not reorder known mods.

Entry code runs as an ordinary script inside a guarded function, not an ES module. Imports and top-level await are not supported. The guard catches synchronous throws and avoids duplicate execution per document; it does not sandbox the mod or capture every asynchronous failure. Newly discovered windows get the same registrations, but polling does not guarantee execution before app initialization.
