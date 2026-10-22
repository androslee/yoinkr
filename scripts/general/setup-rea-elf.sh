#!/bin/sh
# Explicit, project-local setup; conversion/inspection commands never install tools.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
PROVIDER_ENV="$ROOT/.tools/rea-elf"
command -v uv >/dev/null 2>&1 || { echo 'Install uv or prepare an equivalent Python environment explicitly.' >&2; exit 1; }
if [ ! -x "$PROVIDER_ENV/bin/python" ]; then uv venv "$PROVIDER_ENV"; fi
uv pip install --python "$PROVIDER_ENV/bin/python" -r "$ROOT/scripts/general/requirements-rea-elf.txt"
printf 'REA provider Python: %s\n' "$PROVIDER_ENV/bin/python"
