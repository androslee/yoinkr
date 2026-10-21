# Core portability preflight only. Does not claim native Windows recipient support.
[CmdletBinding()]
param(
    [string] $Out = (Join-Path ([System.IO.Path]::GetTempPath()) ('yoinkr-windows-' + [guid]::NewGuid().ToString())),
    [switch] $InstallCachedDependencies
)
$ErrorActionPreference = 'Stop'
if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    throw 'Run this wrapper on Windows. A Linux result cannot establish Windows portability.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
Push-Location $projectRoot
try {
    if ($InstallCachedDependencies) {
        $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
        & $npm ci --offline --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw 'Cached dependency installation failed. Acquire dependencies with npm ci before the offline test; no automatic online retry is performed.'
        }
    }
    & $node (Join-Path $PSScriptRoot 'verify-portability.mjs') --out $Out
    $resultCode = $LASTEXITCODE
    if ($resultCode -ne 0) { throw "Windows core portability check failed ($resultCode). Inspect $Out." }
    Write-Host "Core portability evidence saved in $Out."
    Write-Host 'Native VS Code/Joplin acceptance is still required; this does not complete milestone 24.'
}
finally {
    Pop-Location
}
