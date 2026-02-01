# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Monitors the status of all PRs in the tracking file.

.DESCRIPTION
    Displays current status for all tracked PRs including:
    - Open/Merged/Closed state
    - Review status (approved, changes requested, pending)
    - CI check status
    - Merge conflicts
    - Days since creation

.EXAMPLE
    .\Monitor-PRs.ps1
    Shows status of all tracked PRs

.EXAMPLE
    .\Monitor-PRs.ps1 -Phase 1
    Shows status of PR 1 (Foundation)

.EXAMPLE
    .\Monitor-PRs.ps1 -Watch
    Continuously monitors PRs (updates every 60 seconds)

.EXAMPLE
    .\Monitor-PRs.ps1 -Branch "feature/editor-find-accessibility-help"
    Shows detailed status for a specific branch
#>

[CmdletBinding()]
param(
    [string]$Branch,
    [int]$Phase,
    [switch]$Watch,
    [int]$WatchInterval = 60,
    [switch]$Detailed,
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

function Get-StatusColor {
    param([string]$State)

    switch ($State.ToLower()) {
        "open" { return "Yellow" }
        "merged" { return "Green" }
        "closed" { return "Red" }
        "approved" { return "Green" }
        "changes_requested" { return "Red" }
        "pending" { return "Yellow" }
        "success" { return "Green" }
        "failure" { return "Red" }
        "pending" { return "Yellow" }
        default { return "White" }
    }
}

function Get-StatusIcon {
    param([string]$State)

    switch ($State.ToLower()) {
        "open" { return "[OPEN]" }
        "merged" { return "[OK]" }
        "closed" { return "[FAIL]" }
        "approved" { return "[OK]" }
        "changes_requested" { return "[X]" }
        "pending" { return "[...]" }
        "success" { return "[OK]" }
        "failure" { return "[X]" }
        default { return "?" }
    }
}

# ============================================================================
# PR STATUS FUNCTIONS
# ============================================================================

function Get-PRStatus {
    param([int]$PRNumber)

    $pr = gh pr view $PRNumber --json state,title,mergeable,isDraft,reviewDecision,statusCheckRollup,createdAt,updatedAt,mergedAt,url,labels 2>$null | ConvertFrom-Json

    if (-not $pr) {
        return $null
    }

    # Get reviews
    $reviews = gh pr view $PRNumber --json reviews 2>$null | ConvertFrom-Json

    # Determine overall review status
    $reviewStatus = "PENDING"
    if ($reviews.reviews) {
        $latestReviews = @{}
        foreach ($review in $reviews.reviews) {
            if ($review.state -ne "COMMENTED") {
                $latestReviews[$review.author.login] = $review.state
            }
        }

        $approvals = ($latestReviews.Values | Where-Object { $_ -eq "APPROVED" }).Count
        $changesRequested = ($latestReviews.Values | Where-Object { $_ -eq "CHANGES_REQUESTED" }).Count

        if ($changesRequested -gt 0) {
            $reviewStatus = "CHANGES_REQUESTED"
        } elseif ($approvals -gt 0) {
            $reviewStatus = "APPROVED"
        }
    }

    # Determine CI status
    $ciStatus = "PENDING"
    if ($pr.statusCheckRollup) {
        $failed = $pr.statusCheckRollup | Where-Object { $_.conclusion -eq "FAILURE" }
        $pending = $pr.statusCheckRollup | Where-Object { $_.conclusion -eq $null -or $_.conclusion -eq "" }

        if ($failed.Count -gt 0) {
            $ciStatus = "FAILURE"
        } elseif ($pending.Count -eq 0) {
            $ciStatus = "SUCCESS"
        }
    }

    # Calculate age
    $createdDate = [DateTime]::Parse($pr.createdAt)
    $age = (Get-Date) - $createdDate

    return @{
        Number = $PRNumber
        State = $pr.state
        Title = $pr.title
        IsDraft = $pr.isDraft
        Mergeable = $pr.mergeable
        ReviewStatus = $reviewStatus
        CIStatus = $ciStatus
        URL = $pr.url
        CreatedAt = $createdDate
        AgeDays = [math]::Floor($age.TotalDays)
        Labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
        MergedAt = $pr.mergedAt
    }
}

function Get-AllPRStatuses {
    param([hashtable]$Tracking, [int]$FilterPhase = 0, [string]$FilterBranch = "")

    $statuses = @()
    $config = Get-PRConfig

    foreach ($branch in $Tracking.PRs.Keys) {
        $prData = $Tracking.PRs[$branch]

        # Filter by phase
        if ($FilterPhase -gt 0 -and $prData.Phase -ne $FilterPhase) {
            continue
        }

        # Filter by branch
        if (-not [string]::IsNullOrEmpty($FilterBranch) -and $branch -ne $FilterBranch) {
            continue
        }

        # Get PR configuration
        $prConfig = Get-PRByBranch -BranchName $branch

        # Get live status from GitHub
        $status = Get-PRStatus -PRNumber $prData.PRNumber

        if ($status) {
            $status.Branch = $branch
            $status.Phase = $prData.Phase
            $status.Config = $prConfig
            $statuses += $status
        }
    }

    return $statuses | Sort-Object Phase, Branch
}

function Show-PRTable {
    param([array]$Statuses)

    if ($Statuses.Count -eq 0) {
        Write-Host "  No PRs found" -ForegroundColor Yellow
        return
    }

    # Header
    Write-Host "`n  " -NoNewline
    Write-Host "PR#".PadRight(8) -ForegroundColor Cyan -NoNewline
    Write-Host "State".PadRight(10) -ForegroundColor Cyan -NoNewline
    Write-Host "Review".PadRight(14) -ForegroundColor Cyan -NoNewline
    Write-Host "CI".PadRight(10) -ForegroundColor Cyan -NoNewline
    Write-Host "Age".PadRight(6) -ForegroundColor Cyan -NoNewline
    Write-Host "Branch" -ForegroundColor Cyan

    Write-Host "  $('-' * 70)" -ForegroundColor DarkGray

    $currentPhase = 0

    foreach ($pr in $Statuses) {
        # Phase separator
        if ($pr.Phase -ne $currentPhase) {
            if ($currentPhase -ne 0) {
                Write-Host ""
            }
            Write-Host "  Phase $($pr.Phase)" -ForegroundColor White
            Write-Host "  $('-' * 70)" -ForegroundColor DarkGray
            $currentPhase = $pr.Phase
        }

        # State with icon
        $stateIcon = Get-StatusIcon $pr.State
        $stateColor = Get-StatusColor $pr.State

        # Review status
        $reviewIcon = Get-StatusIcon $pr.ReviewStatus
        $reviewColor = Get-StatusColor $pr.ReviewStatus

        # CI status
        $ciIcon = Get-StatusIcon $pr.CIStatus
        $ciColor = Get-StatusColor $pr.CIStatus

        Write-Host "  " -NoNewline
        Write-Host "#$($pr.Number)".PadRight(8) -ForegroundColor White -NoNewline
        Write-Host "$stateIcon $($pr.State)".PadRight(10) -ForegroundColor $stateColor -NoNewline
        Write-Host "$reviewIcon $($pr.ReviewStatus)".PadRight(14).Substring(0, 14) -ForegroundColor $reviewColor -NoNewline
        Write-Host "$ciIcon $($pr.CIStatus)".PadRight(10).Substring(0, 10) -ForegroundColor $ciColor -NoNewline
        Write-Host "$($pr.AgeDays)d".PadRight(6) -ForegroundColor DarkGray -NoNewline

        # Branch name (truncated)
        $branchDisplay = $pr.Branch
        if ($branchDisplay.Length -gt 35) {
            $branchDisplay = $pr.Branch.Substring(0, 32) + "..."
        }
        Write-Host $branchDisplay -ForegroundColor DarkGray
    }
}

function Show-PRDetails {
    param([object]$Status)

    Write-Host "`n  +$('-' * 56)+" -ForegroundColor White
    Write-Host "  | PR #$($Status.Number)" -ForegroundColor White -NoNewline
    Write-Host " - $($Status.State)".PadRight(50 - $Status.Number.ToString().Length) -ForegroundColor (Get-StatusColor $Status.State) -NoNewline
    Write-Host "|" -ForegroundColor White
    Write-Host "  +$('-' * 56)+" -ForegroundColor White

    Write-Host "`n  Branch:  " -ForegroundColor Cyan -NoNewline
    Write-Host $Status.Branch -ForegroundColor White

    Write-Host "  Title:   " -ForegroundColor Cyan -NoNewline
    Write-Host $Status.Title -ForegroundColor White

    Write-Host "  URL:     " -ForegroundColor Cyan -NoNewline
    Write-Host $Status.URL -ForegroundColor Blue

    Write-Host "`n  Status Details:" -ForegroundColor Cyan

    $stateIcon = Get-StatusIcon $Status.State
    Write-Host "    State:   $stateIcon $($Status.State)" -ForegroundColor (Get-StatusColor $Status.State)

    $reviewIcon = Get-StatusIcon $Status.ReviewStatus
    Write-Host "    Review:  $reviewIcon $($Status.ReviewStatus)" -ForegroundColor (Get-StatusColor $Status.ReviewStatus)

    $ciIcon = Get-StatusIcon $Status.CIStatus
    Write-Host "    CI:      $ciIcon $($Status.CIStatus)" -ForegroundColor (Get-StatusColor $Status.CIStatus)

    Write-Host "    Merge:   $(if ($Status.Mergeable -eq 'MERGEABLE') { '[OK] No conflicts' } elseif ($Status.Mergeable -eq 'CONFLICTING') { '[X] Has conflicts' } else { '? Unknown' })" -ForegroundColor $(if ($Status.Mergeable -eq 'MERGEABLE') { 'Green' } elseif ($Status.Mergeable -eq 'CONFLICTING') { 'Red' } else { 'Yellow' })

    Write-Host "`n  Timeline:" -ForegroundColor Cyan
    Write-Host "    Created: $($Status.CreatedAt.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor DarkGray
    Write-Host "    Age:     $($Status.AgeDays) days" -ForegroundColor DarkGray

    if ($Status.MergedAt) {
        Write-Host "    Merged:  $($Status.MergedAt)" -ForegroundColor Green
    }

    if (-not [string]::IsNullOrEmpty($Status.Labels)) {
        Write-Host "`n  Labels: $($Status.Labels)" -ForegroundColor DarkGray
    }

    # Recommended actions
    Write-Host "`n  Recommended Actions:" -ForegroundColor Cyan

    if ($Status.State -eq "OPEN") {
        if ($Status.ReviewStatus -eq "CHANGES_REQUESTED") {
            Write-Host "    • Address review feedback and push changes" -ForegroundColor Yellow
        } elseif ($Status.ReviewStatus -eq "PENDING") {
            Write-Host "    • Wait for reviewer feedback" -ForegroundColor Yellow
        } elseif ($Status.ReviewStatus -eq "APPROVED") {
            if ($Status.CIStatus -eq "SUCCESS" -and $Status.Mergeable -eq "MERGEABLE") {
                Write-Host "    [OK] Ready to merge! Run: .\Merge-PRs.ps1 -PRNumber $($Status.Number)" -ForegroundColor Green
            } elseif ($Status.CIStatus -ne "SUCCESS") {
                Write-Host "    • Wait for CI checks to pass" -ForegroundColor Yellow
            } elseif ($Status.Mergeable -eq "CONFLICTING") {
                Write-Host "    • Resolve merge conflicts: git checkout $($Status.Branch) && git rebase main" -ForegroundColor Yellow
            }
        }
    } elseif ($Status.State -eq "MERGED") {
        Write-Host "    [OK] PR is merged! Check if dependent PRs can now proceed." -ForegroundColor Green
    }
}

# ============================================================================
# LOAD TRACKING
# ============================================================================

function Get-PRTracking {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    return Get-Content $FilePath -Raw | ConvertFrom-Json -AsHashtable
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

function Show-Dashboard {
    Clear-Host

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Header "PR MONITORING DASHBOARD - $timestamp"

    $tracking = Get-PRTracking -FilePath $TrackingFile

    if (-not $tracking) {
        Write-Host "`n  No tracking file found at: $TrackingFile" -ForegroundColor Yellow
        Write-Host "  Run .\Create-PRs.ps1 first to create PRs.`n" -ForegroundColor Yellow
        return $null
    }

    if ($tracking.PRs.Count -eq 0) {
        Write-Host "`n  No PRs tracked yet. Run .\Create-PRs.ps1 to create PRs.`n" -ForegroundColor Yellow
        return $null
    }

    Write-Host "`n  Fetching PR statuses..." -ForegroundColor Cyan

    $statuses = Get-AllPRStatuses -Tracking $tracking -FilterPhase $Phase -FilterBranch $Branch

    if ($Branch -and $statuses.Count -eq 1) {
        # Show detailed view for single branch
        Show-PRDetails -Status $statuses[0]
    } else {
        # Show table view
        Show-PRTable -Statuses $statuses

        # Summary
        $open = ($statuses | Where-Object { $_.State -eq "OPEN" }).Count
        $merged = ($statuses | Where-Object { $_.State -eq "MERGED" }).Count
        $closed = ($statuses | Where-Object { $_.State -eq "CLOSED" }).Count
        $approved = ($statuses | Where-Object { $_.State -eq "OPEN" -and $_.ReviewStatus -eq "APPROVED" }).Count
        $readyToMerge = ($statuses | Where-Object {
            $_.State -eq "OPEN" -and
            $_.ReviewStatus -eq "APPROVED" -and
            $_.CIStatus -eq "SUCCESS" -and
            $_.Mergeable -eq "MERGEABLE"
        }).Count

        Write-Host "`n  Summary:" -ForegroundColor White
        Write-Host "    Total: $($statuses.Count)  |  " -ForegroundColor DarkGray -NoNewline
        Write-Host "Open: $open  |  " -ForegroundColor Yellow -NoNewline
        Write-Host "Merged: $merged  |  " -ForegroundColor Green -NoNewline
        Write-Host "Closed: $closed" -ForegroundColor Red

        if ($readyToMerge -gt 0) {
            Write-Host "`n  🎉 $readyToMerge PR(s) ready to merge!" -ForegroundColor Green
            Write-Host "     Run: .\Merge-PRs.ps1 -AutoMerge`n" -ForegroundColor Cyan
        }
    }

    return $statuses
}

# Run once or watch mode
if ($Watch) {
    Write-Host "  Watch mode enabled. Press Ctrl+C to stop.`n" -ForegroundColor Cyan

    while ($true) {
        Show-Dashboard

        Write-Host "`n  Refreshing in $WatchInterval seconds... (Ctrl+C to stop)" -ForegroundColor DarkGray
        Start-Sleep -Seconds $WatchInterval
    }
} else {
    $result = Show-Dashboard

    if ($Detailed -and $result) {
        Write-Host "`n  For detailed view of a specific PR:" -ForegroundColor DarkGray
        Write-Host "    .\Monitor-PRs.ps1 -Branch `"branch-name`"`n" -ForegroundColor DarkGray
    }
}
