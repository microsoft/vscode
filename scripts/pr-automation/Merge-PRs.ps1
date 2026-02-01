# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Merges approved PRs that pass all checks.

.DESCRIPTION
    Merges PRs that meet all requirements:
    - State is OPEN
    - Has reviewer approval
    - CI checks pass
    - No merge conflicts

    Can merge specific PRs or auto-merge all ready PRs.

.EXAMPLE
    .\Merge-PRs.ps1 -PRNumber 12345
    Merge a specific PR if it's ready

.EXAMPLE
    .\Merge-PRs.ps1 -Phase 1
    Merge all ready Phase 1 PRs

.EXAMPLE
    .\Merge-PRs.ps1 -AutoMerge
    Merge all PRs that are ready to merge

.EXAMPLE
    .\Merge-PRs.ps1 -PRNumber 12345 -DryRun
    Check if PR is ready without actually merging
#>

[CmdletBinding()]
param(
    [int]$PRNumber,
    [int]$Phase,
    [string]$Branch,
    [switch]$AutoMerge,
    [switch]$DryRun,
    [switch]$Force,
    [switch]$Squash,
    [switch]$DeleteBranch,
    [string]$TrackingFile = ".\PR-Tracking.json"
)

# Import configuration
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$scriptDir\PR-Config.ps1"

# ============================================================================
# OUTPUT HELPERS
# ============================================================================

function Write-Header {
    param([string]$Text)
    Write-Host "`n+$('-' * ($Text.Length + 2))+" -ForegroundColor White
    Write-Host "| $Text |" -ForegroundColor White
    Write-Host "+$('-' * ($Text.Length + 2))+" -ForegroundColor White
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  ⚠️  $Message" -ForegroundColor Yellow
}

# ============================================================================
# PR MERGE FUNCTIONS
# ============================================================================

function Get-PRMergeReadiness {
    param([int]$PRNumber)

    $pr = gh pr view $PRNumber --json state,mergeable,isDraft,reviewDecision,statusCheckRollup,headRefName 2>$null | ConvertFrom-Json

    if (-not $pr) {
        return @{
            Ready = $false
            Reason = "PR not found"
        }
    }

    $reasons = @()

    # Check state
    if ($pr.state -ne "OPEN") {
        $reasons += "PR is $($pr.state), not OPEN"
    }

    # Check draft
    if ($pr.isDraft) {
        $reasons += "PR is still a draft"
    }

    # Check review
    if ($pr.reviewDecision -eq "CHANGES_REQUESTED") {
        $reasons += "Changes requested by reviewer"
    } elseif ($pr.reviewDecision -ne "APPROVED") {
        $reasons += "Review not approved (status: $($pr.reviewDecision))"
    }

    # Check CI
    $ciPending = $false
    $ciFailed = $false
    if ($pr.statusCheckRollup) {
        foreach ($check in $pr.statusCheckRollup) {
            if ($check.conclusion -eq "FAILURE") {
                $ciFailed = $true
                $reasons += "CI check failed: $($check.context)"
            } elseif (-not $check.conclusion) {
                $ciPending = $true
            }
        }

        if ($ciPending -and -not $ciFailed) {
            $reasons += "CI checks still running"
        }

        # Detect CLA/license checks specifically and require them to pass.
        # Common CLA check contexts include strings containing 'cla' or 'license'.
        $claChecks = $pr.statusCheckRollup | Where-Object { $_.context -match '(?i)cla|license' }
        if ($claChecks -and $claChecks.Count -gt 0) {
            $claFailed = $claChecks | Where-Object { $_.conclusion -ne 'SUCCESS' }
            if ($claFailed.Count -gt 0) {
                $claNames = ($claFailed | ForEach-Object { $_.context }) -join ', '
                $reasons += "CLA check(s) not passed: $claNames"
            }
        }
    }

    # Check mergeable
    if ($pr.mergeable -eq "CONFLICTING") {
        $reasons += "Has merge conflicts"
    } elseif ($pr.mergeable -eq "UNKNOWN") {
        $reasons += "Merge status unknown (checking...)"
    }

    return @{
        Ready = ($reasons.Count -eq 0)
        Reasons = $reasons
        Branch = $pr.headRefName
        State = $pr.state
        ReviewDecision = $pr.reviewDecision
        Mergeable = $pr.mergeable
    }
}

function Merge-SinglePR {
    param(
        [int]$PRNumber,
        [switch]$DryRun,
        [switch]$Force,
        [switch]$Squash,
        [switch]$DeleteBranch
    )

    Write-Host "`n  Checking PR #$PRNumber..." -ForegroundColor Cyan

    $readiness = Get-PRMergeReadiness -PRNumber $PRNumber

    if (-not $readiness.Ready) {
        if (-not $Force) {
            Write-Warning "PR #$PRNumber is not ready to merge:"
            foreach ($reason in $readiness.Reasons) {
                Write-Host "    • $reason" -ForegroundColor Yellow
            }
            return @{
                Success = $false
                PRNumber = $PRNumber
                Reason = $readiness.Reasons -join "; "
            }
        } else {
            Write-Warning "PR not ready but -Force specified, proceeding..."
        }
    }

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would merge PR #$PRNumber" -ForegroundColor Yellow
        Write-Host "    Branch: $($readiness.Branch)" -ForegroundColor DarkGray
        Write-Host "    Review: $($readiness.ReviewDecision)" -ForegroundColor DarkGray
        Write-Host "    Mergeable: $($readiness.Mergeable)" -ForegroundColor DarkGray

        return @{
            Success = $true
            PRNumber = $PRNumber
            DryRun = $true
        }
    }

    # Interactive confirmation: ensure maintainer explicitly verifies CLA status
    if (-not $Force) {
        $promptMsg = "Confirm that the contributor has signed the CLA for PR #$PRNumber and that you have verified it. Type 'yes' to continue:"
        $response = Read-Host $promptMsg
        if (-not $response) {
            Write-Warning "Merge cancelled: no confirmation provided. Use -Force to override." -ForegroundColor Yellow
            return @{ Success = $false; PRNumber = $PRNumber; Reason = "CLA not confirmed by user" }
        }
        if ($response.Trim().ToLower() -ne 'yes') {
            Write-Warning "Merge cancelled: confirmation did not match 'yes'. Use -Force to override." -ForegroundColor Yellow
            return @{ Success = $false; PRNumber = $PRNumber; Reason = "CLA confirmation denied" }
        }
    }

    # Build merge command
    $mergeArgs = @()

    # Always squash for VS Code (clean history)
    $mergeArgs += "--squash"

    # Delete branch after merge
    $mergeArgs += "--delete-branch"

    Write-Host "  Merging PR #$PRNumber..." -ForegroundColor Cyan

    $result = gh pr merge $PRNumber $mergeArgs 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Success "PR #$PRNumber merged successfully!"

        return @{
            Success = $true
            PRNumber = $PRNumber
            Branch = $readiness.Branch
        }
    } else {
        Write-Error "Failed to merge PR #$PRNumber: $result"

        return @{
            Success = $false
            PRNumber = $PRNumber
            Reason = $result
        }
    }
}

function Update-LocalMain {
    Write-Host "`n  Updating local main branch..." -ForegroundColor Cyan

    git checkout main 2>$null
    git pull origin main 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Local main updated"
    } else {
        Write-Warning "Could not update local main"
    }
}

# ============================================================================
# TRACKING FUNCTIONS
# ============================================================================

function Get-PRTracking {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    return Get-Content $FilePath -Raw | ConvertFrom-Json -AsHashtable
}

function Save-PRTracking {
    param(
        [string]$FilePath,
        [hashtable]$Tracking
    )

    $Tracking.UpdatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $Tracking | ConvertTo-Json -Depth 10 | Set-Content $FilePath
}

function Get-TrackedPRs {
    param(
        [hashtable]$Tracking,
        [int]$FilterPhase,
        [string]$FilterBranch
    )

    $prs = @()

    foreach ($branch in $Tracking.PRs.Keys) {
        $prData = $Tracking.PRs[$branch]

        if ($FilterPhase -gt 0 -and $prData.Phase -ne $FilterPhase) {
            continue
        }

        if (-not [string]::IsNullOrEmpty($FilterBranch) -and $branch -ne $FilterBranch) {
            continue
        }

        $prs += @{
            Branch = $branch
            PRNumber = $prData.PRNumber
            Phase = $prData.Phase
        }
    }

    return $prs | Sort-Object Phase
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Write-Header "PR MERGE AUTOMATION"

if ($DryRun) {
    Write-Host "`n  ⚠️  DRY RUN MODE - No merges will be performed`n" -ForegroundColor Yellow
}

$tracking = Get-PRTracking -FilePath $TrackingFile
$prsToMerge = @()

# Determine which PRs to try to merge
if ($PRNumber -gt 0) {
    # Specific PR
    $prsToMerge += @{ PRNumber = $PRNumber; Branch = "specified" }
} elseif ($Phase -gt 0) {
    if (-not $tracking) {
        Write-Error "No tracking file found. Run Create-PRs.ps1 first."
        exit 1
    }
    $prsToMerge = Get-TrackedPRs -Tracking $tracking -FilterPhase $Phase
} elseif (-not [string]::IsNullOrEmpty($Branch)) {
    if (-not $tracking) {
        Write-Error "No tracking file found. Run Create-PRs.ps1 first."
        exit 1
    }
    $prsToMerge = Get-TrackedPRs -Tracking $tracking -FilterBranch $Branch
} elseif ($AutoMerge) {
    if (-not $tracking) {
        Write-Error "No tracking file found. Run Create-PRs.ps1 first."
        exit 1
    }
    $prsToMerge = Get-TrackedPRs -Tracking $tracking -FilterPhase 0
} else {
    Write-Host @"

  Usage:
    .\Merge-PRs.ps1 -PRNumber <number>     Merge a specific PR
    .\Merge-PRs.ps1 -Phase <number>        Merge all ready PRs in a phase
    .\Merge-PRs.ps1 -Branch <name>         Merge PR for specific branch
    .\Merge-PRs.ps1 -AutoMerge             Merge all ready PRs

  Options:
    -DryRun     Show what would be merged without merging
    -Force      Merge even if some checks are pending

  Examples:
    .\Merge-PRs.ps1 -PRNumber 12345
    .\Merge-PRs.ps1 -Phase 1
    .\Merge-PRs.ps1 -AutoMerge -DryRun

"@
    exit 0
}

if ($prsToMerge.Count -eq 0) {
    Write-Warning "No PRs found to merge"
    exit 0
}

Write-Host "  Found $($prsToMerge.Count) PR(s) to check...`n" -ForegroundColor White

# Check and merge each PR
$merged = 0
$skipped = 0
$failed = 0
$results = @()

foreach ($pr in $prsToMerge) {
    $result = Merge-SinglePR -PRNumber $pr.PRNumber -DryRun:$DryRun -Force:$Force -Squash:$Squash -DeleteBranch:$DeleteBranch

    $results += $result

    if ($result.Success) {
        if ($result.DryRun) {
            $skipped++
        } else {
            $merged++

            # Update tracking
            if ($tracking -and $pr.Branch -ne "specified") {
                $tracking.PRs[$pr.Branch].MergedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                $tracking.PRs[$pr.Branch].State = "MERGED"
            }
        }
    } else {
        $skipped++
    }
}

# Save tracking updates
if (-not $DryRun -and $merged -gt 0 -and $tracking) {
    Save-PRTracking -FilePath $TrackingFile -Tracking $tracking
}

# Update local main if we merged anything
if (-not $DryRun -and $merged -gt 0) {
    Update-LocalMain
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n$('-' * 60)" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "                        SUMMARY" -ForegroundColor White
Write-Host "$('-' * 60)" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

Write-Host "`n  PRs checked: $($prsToMerge.Count)" -ForegroundColor White
Write-Host "  Merged: $merged" -ForegroundColor Green
Write-Host "  Skipped (not ready): $skipped" -ForegroundColor Yellow
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "White" })

if ($merged -gt 0) {
    Write-Host "`n  Successfully merged:" -ForegroundColor Green
    foreach ($r in $results | Where-Object { $_.Success -and -not $_.DryRun }) {
        Write-Host "    • PR #$($r.PRNumber)" -ForegroundColor White
    }
}

if ($skipped -gt 0) {
    Write-Host "`n  Not ready to merge:" -ForegroundColor Yellow
    foreach ($r in $results | Where-Object { -not $_.Success }) {
        Write-Host "    • PR #$($r.PRNumber): $($r.Reason)" -ForegroundColor Yellow
    }
}

# Next steps
Write-Host "`n  Next steps:" -ForegroundColor White

if ($merged -gt 0) {
    Write-Host "    • Check if dependent PRs can now be merged" -ForegroundColor DarkGray
    Write-Host "    • Run .\Monitor-PRs.ps1 to see updated status" -ForegroundColor DarkGray
}

if ($skipped -gt 0) {
    Write-Host "    • Address review feedback for skipped PRs" -ForegroundColor DarkGray
    Write-Host "    • Wait for CI checks to complete" -ForegroundColor DarkGray
    Write-Host "    • Resolve merge conflicts if any" -ForegroundColor DarkGray
}

Write-Host "`n$('-' * 60)`n" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

return @{
    Merged = $merged
    Skipped = $skipped
    Failed = $failed
    Results = $results
}
