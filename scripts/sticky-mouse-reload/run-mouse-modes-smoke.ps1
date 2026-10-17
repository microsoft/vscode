# Local A/B: sticky-mouse smoke (real Code OSS + Playwright + fake-tui fixture).
# Requires: already-built out/ and .build/electron (rebuild-local.ps1 -Target vscode).
#
# Usage:
#   pwsh -File scripts/sticky-mouse-reload/run-mouse-modes-smoke.ps1
#   pwsh -File scripts/sticky-mouse-reload/run-mouse-modes-smoke.ps1 -Compile
#
# Filter is fixed to "Terminal Mouse Modes" so the full terminal suite is not run.

param(
  [switch]$Compile
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root

$oss = Join-Path $root '.build\electron\Code - OSS.exe'
if (-not (Test-Path $oss)) {
  throw "Missing $oss — run rebuild-local.ps1 -Target vscode first"
}
$termOut = Join-Path $root 'out\vs\workbench\contrib\terminal\common\basePty.js'
if (-not (Test-Path $termOut)) {
  throw "Missing compiled out/ — run npm run compile first"
}

if ($Compile) {
  Write-Host 'Compiling smoke + automation...'
  Push-Location (Join-Path $root 'test\smoke')
  try {
    npm run compile
    if ($LASTEXITCODE -ne 0) { throw "smoke compile failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
} else {
  $smokeMain = Join-Path $root 'test\smoke\out\main.js'
  if (-not (Test-Path $smokeMain)) {
    Write-Host 'smoke out/ missing — compiling once...'
    Push-Location (Join-Path $root 'test\smoke')
    try {
      npm run compile
      if ($LASTEXITCODE -ne 0) { throw "smoke compile failed ($LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
  }
}

Write-Host 'Running Terminal Mouse Modes smoke (real Electron window will open)...'
# Clear CI so the suite is not auto-skipped
Remove-Item Env:CI -ErrorAction SilentlyContinue
Remove-Item Env:VSCODE_SKIP_MOUSE_MODE_SMOKE -ErrorAction SilentlyContinue

npm run smoketest-no-compile -- -f "Terminal Mouse Modes"
exit $LASTEXITCODE
