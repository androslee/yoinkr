# Bounded native component workflow (v0.16)

The first native profile transfers **the original compiled zlib shared library** into a separate recipient and calls its `crc32` and `zlibVersion` exports through a fixed Python `ctypes` adapter. REA supplies execution-free ELF layout/export/linkage Evidence. Matching retained zlib headers supply the reviewed C ABI. Runtime checks then compare donor-snapshot calls and recipient-copy calls against a separate bitwise JavaScript CRC32 implementation and explicit known vectors.

This delivers one native component path, not a generic DLL/managed-assembly importer or a new decompiler. No source rebuild, extracted machine-code slice, arbitrary export invocation or VS Code extension is used. Keeping the whole library preserves its internal calls, relocation data and loader behavior. In this library the small exported `crc32` entry delegates into other code, illustrating why copying a symbol's apparent byte range would be insufficient.

## Delivered showcase

Open `builds/native-component-v0.16/native-report.html` for the readable verification snapshot. It lists native/reference results, ABI/runtime identities, source hashes and retained provider limitations. The snapshot is not a live integrity status.

The showcase has:

- An exact local zlib binary, matching `zlib.h`/`zconf.h`, supplied copyright/license and original-path provenance in `SOURCE.json`.
- Complete actual REA Evidence under `workspace/.native/evidence/`, plus selected exports and limitations in the workspace metadata.
- Separate donor-snapshot and recipient library files; a fixed, hash-tracked native host adapter.
- Sixteen explicit vectors, including the `123456789` check value `cbf43926`, empty input, binary/NUL bytes, Unicode, incremental chunks, seeds and 64 KiB buffers.
- A recipient inventory of three real files in `asset-checksums.json`, produced through the copied library. SHA-256 identities accompany the native CRC32 values.
- Additional acceptance under `acceptance/runtime-*/ACCEPTANCE.json`: a deliberately wrong expectation produces a retained failure, a modified library is refused before execution, and an unavailable provider leaves marked preparation diagnostics.

The supplied component/version is zlib 1.3 on this Linux x86-64 machine. The actual loaded libc paths and SHA-256 values are recorded by the native host. libc remains a host runtime dependency; it is not bundled or assumed portable to other systems. Original installed libraries, headers and license files are never modified.

## Explicit provider setup

The installed REA ELF provider requires a caller-supplied Python environment containing pwntools 4.15.0, pyelftools 0.33 and Unicorn 2.1.2. A project-only environment is already prepared at `.tools/rea-elf` for this delivery. The complete package lock is `scripts/requirements-rea-elf.txt`.

To reproduce it explicitly, with `uv` available:

```sh
./scripts/setup-rea-elf.sh
```

Setup may download packages. Native preparation/verification commands never install packages, alter system Python, register agents or change DSH. REA receives the selected interpreter through a per-subprocess `REA_PWNTOOLS_PYTHON` setting. The `ctypes` host itself uses only Python's standard library with isolated Python mode and a minimal environment.

REA's ELF provider reported that its optional PLT convenience mapping could not allocate Unicorn memory on this host. This diagnostic and all upstream limitations are retained. Export identity and linkage facts used by this profile remain present; no complete PLT/call graph or function recovery is claimed. The separate native calls establish the behavior of the listed vectors, rather than converting that warning into a passing static-analysis claim.

## Commands

From the Yoinkr directory, select an absolute Python path:

```sh
YOINKR_PROVIDER_PYTHON="$PWD/.tools/rea-elf/bin/python"
node src/cli.js native-prepare ./native.json --input-root /path/to/component-inputs \
  --python "$YOINKR_PROVIDER_PYTHON" --out /path/to/new-workspace
node src/cli.js native-status /path/to/new-workspace
node src/cli.js native-verify /path/to/new-workspace --python "$YOINKR_PROVIDER_PYTHON"
node src/cli.js native-checksum /path/to/new-workspace \
  --python "$YOINKR_PROVIDER_PYTHON" --input-root /path/to/recipient-assets \
  --file scene.json --file texture.bin --out /path/to/new-checksums.json
```

`native-prepare` performs static preparation only. It requires an absent output directory outside source/recipe roots, pins all input bytes, checks the retained header declarations, asks REA to inspect the copied original, and refuses unsupported architecture, image type, exports or dependency declarations. A failed provider/preparation leaves a clearly marked `PREPARE-FAILED.json` plus available logs; an incomplete workspace cannot be executed. Existing destinations are refused.

`native-status` checks the original snapshots, recipe, complete Evidence/logs, recipient library and adapter hashes. Modified or redirected paths cause refusal; status returns nonzero on ordinary drift. Before execution, verification/checksum commands recheck tracked bytes and the retained REA Evidence. Close any process using a working copy and avoid concurrent writers. Hash checks detect drift, not malicious rewriting of the entire unsigned workspace.

`native-verify` writes a new immutable report under `.native/runs/` for each completed comparison, including failed expectations, runtime errors, timeouts and bounded output failures. A failed comparison returns nonzero in the CLI. A preflight refusal makes no native call and does not produce a new execution report. Static evidence and native execution are separate stages.

`native-checksum` executes the copied library for explicitly selected recipient files and compares every value to the independent reference before writing a new JSON inventory. Files remain unchanged. The report destination must be outside the component workspace and asset root and must not already exist. CRC32 is a compatibility/integrity primitive, not cryptographic authentication; SHA-256 identities are recorded separately.

To reproduce the example in a fresh directory:

```sh
node scripts/build-native-component.mjs --out ./builds/my-native-component \
  --python "$YOINKR_PROVIDER_PYTHON"
node scripts/native-component-smoke.mjs ./builds/my-native-component
```

## Recipe and ABI contract

Schema 1 `native-component` recipes use the exact profile `zlib-crc32-linux-x64-v1`, a stable `id`, four `inputs` and 1–32 `cases`. The shipped recipe under `builds/native-component-v0.16/recipe/native.json` has real hashes and ready-to-run vectors.

Each input declares a relative `file`, exact lowercase `sha256` and one unique role: `library`, `header`, `types` or `license`. All four roles are mandatory; file paths may not overlap or traverse directories, and symlink components are refused. The library is copied unchanged into `recipient/libz.so`; the original snapshot remains in `.native/inputs/`. The C headers must establish the zlib version, `uLong crc32(uLong, const Bytef *, uInt)`, unsigned-long and unsigned-int types. Header/runtime versions must agree for verification to pass.

REA Evidence must bind the selected digest to a little-endian ELF64 x86-64 `ET_DYN`, global/default-visible defined function exports `crc32` and `zlibVersion`, and only the reviewed `libc.so.6` dependency (or none). Unknown dependency entries are refused. Linked symbol addresses are observations, never passed as runtime pointers. The system loader resolves exports from the explicitly selected copied library; the host uses `unsigned long` (8 bytes), `unsigned int` (4 bytes), an actual buffer pointer and the explicit byte length. Runtime platform/width checks precede native loading.

Cases declare a unique `name`, canonical base64 `chunks`, uint32 `seed` and optional uint32 `expected`. Empty chunks use a non-null buffer, preserving incremental state. Unknown recipe fields, arbitrary commands, user-supplied function names/addresses, foreign ABI choices and noncanonical input encodings are not supported.

## Limits and execution boundary

This profile is verified only on Linux x86-64, not Windows/macOS, .NET/JVM or arbitrary ELF components. Each retained input is at most 8 MiB; recipes at most 1 MiB. A native job has 1–32 cases, each with 1–32 chunks of at most 64 KiB, and at most 1 MiB total decoded input. The file inventory accepts 1–16 files of at most 64 KiB each. REA output is capped at 8 MiB; host output at 256 KiB; the default native deadline is five seconds, configurable from 100 ms to 30 seconds. Only owned subprocesses are terminated on timeout.

The host loads native code, so library constructors and selected functions run with normal user permissions. Its separate process, isolated Python mode, hash checks, bounds and clean environment limit accidents and drift; they are not a hostile-code sandbox. This workflow is for reviewed component bytes with a known ABI. It does not discover prototypes from names, establish purity, resolve every possible dependency, or prove whole-application equivalence.
