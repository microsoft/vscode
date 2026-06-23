<#
.SYNOPSIS
    Run the OSS NOTICE pipeline locally against this worktree to validate the
    cglicenses override-inject + presence-index behavior without a CI build.

.DESCRIPTION
    Reproduces the CI steps we can run locally:
      1. scan-licenses.ts  -> ext-notices.txt + ext-notices.txt.presence.json
      2. merge-notices.ts  -> ThirdPartyNotices.new.txt (loads the presence
                              index automatically as the --extensions sibling)

    The one CI input we cannot produce locally is the Component Governance
    NOTICE (notice@0). Pass a cached copy via -CgNotice to get a realistic
    base set; omit it to validate inject/stale logic on its own (the inject
    targets are absent from CG by definition, so they still exercise the path).

    Outputs go to -OutDir (default C:\temp\oss-local) so both repos stay clean.

.EXAMPLE
    .\run-local.ps1
    Full run against the worktree, no CG base.

.EXAMPLE
    .\run-local.ps1 -CgNotice C:\temp\oss-local\generated.txt
    Full run with the cached CG NOTICE as the base set.

.EXAMPLE
    .\run-local.ps1 -SkipScan
    Re-run only the merge step (fast iteration on override/inject logic).
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..\..").Path,
    [string]$OutDir = 'C:\temp\oss-local',
    [string]$CgNotice = '',
    [switch]$SkipScan
)

$ErrorActionPreference = 'Stop'

$ossDir     = Join-Path $RepoRoot 'build\azure-pipelines\oss'
$cglicenses = Join-Path $RepoRoot 'cglicenses.json'
$extNotices = Join-Path $OutDir 'ext-notices.txt'
$presence   = "$extNotices.presence.json"
$newNotice  = Join-Path $OutDir 'ThirdPartyNotices.new.txt'
$runLog     = Join-Path $OutDir 'run.log'

# --- sanity checks ---------------------------------------------------------
if (-not (Test-Path $ossDir))     { throw "OSS scripts not found at $ossDir" }
if (-not (Test-Path $cglicenses)) { throw "cglicenses.json not found at $cglicenses" }
if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Warning "No node_modules at $RepoRoot - run 'npm i' there first or the presence index will be empty."
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Run a .ts pipeline script via tsx (handles ESM + .js import specifiers).
function Invoke-OssScript {
    param([string]$Script, [string[]]$ScriptArgs)
    Push-Location $ossDir
    try {
        Write-Host "==> tsx $Script $($ScriptArgs -join ' ')" -ForegroundColor Cyan
        # npm/tsx write warnings to stderr; with ErrorActionPreference=Stop that
        # would become a terminating error. Scope it to Continue and rely on the
        # real exit code instead.
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & npx --yes tsx $Script @ScriptArgs 2>&1 | Tee-Object -FilePath $runLog -Append
        $code = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($code -ne 0) { throw "$Script exited with code $code" }
    }
    finally { Pop-Location }
}

Remove-Item $runLog -ErrorAction SilentlyContinue

# --- 1. scanner ------------------------------------------------------------
if (-not $SkipScan) {
    $scanArgs = @('--repo', $RepoRoot, '--output', $extNotices)
    # Pass CG's notice so Section 3 only fetches license text for cgmanifest
    # git components CG did NOT already cover (avoids redundant network calls).
    if ($CgNotice -and (Test-Path $CgNotice)) {
        $scanArgs += @('--cg', $CgNotice)
    }
    Invoke-OssScript -Script 'scan-licenses.ts' -ScriptArgs $scanArgs
}
else {
    Write-Host "Skipping scan (reusing $extNotices)" -ForegroundColor Yellow
    if (-not (Test-Path $presence)) { Write-Warning "No presence file at $presence - merge cannot detect stale overrides." }
}

# --- 2. merge --------------------------------------------------------------
$mergeArgs = @('--extensions', $extNotices, '--cglicenses', $cglicenses, '--output', $newNotice)
if ($CgNotice -and (Test-Path $CgNotice)) {
    $mergeArgs += @('--cg', $CgNotice)
    Write-Host "Using CG base: $CgNotice" -ForegroundColor Green
}
else {
    Write-Warning "No CG cache (-CgNotice) - merging without a CG base. Inject/stale logic still validated."
}
$mergeArgs += '--provenance'
Invoke-OssScript -Script 'merge-notices.ts' -ScriptArgs $mergeArgs

# --- 3. focused summary ----------------------------------------------------
Write-Host "`n===== LOCAL RUN SUMMARY =====" -ForegroundColor Magenta
$patterns = 'Presence index:|\+ injected:|\? stale:|\? unmatched:|overrides injected:|overrides stale|overrides unmatched|Total packages:'
Select-String -Path $runLog -Pattern $patterns | ForEach-Object { Write-Host "  $($_.Line.Trim())" }

if (Test-Path $presence) {
    $presenceCount = (Get-Content $presence -Raw | ConvertFrom-Json).Count
    Write-Host "`n  Presence file: $presence ($presenceCount packages)"
}
Write-Host "  NOTICE output: $newNotice"
Write-Host "  Full log:      $runLog"
Write-Host "=============================" -ForegroundColor Magenta
