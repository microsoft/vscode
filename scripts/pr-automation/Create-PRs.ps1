# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Creates pull requests for specified branches with proper labels, reviewers, and descriptions.

.DESCRIPTION
    Automates the PR creation process:
    - Runs verification checks before creating PR
    - Creates PR with title and body from config
    - Adds labels and reviewers
    - Sets milestone
    - Records PR number in tracking file

.EXAMPLE
    .\Create-PRs.ps1 -Phase 1
    Creates PR 1 (Foundation & Infrastructure)

.EXAMPLE
    .\Create-PRs.ps1 -Branch "feature/editor-find-accessibility-help"
    Creates PR for specific branch

.EXAMPLE
    .\Create-PRs.ps1 -All
    Creates PRs for all branches (use with caution)

.EXAMPLE
    .\Create-PRs.ps1 -Phase 1 -DryRun
    Shows what would be created without actually creating
#>

[CmdletBinding()]
param(
    [string]$Branch,
    [int]$Phase,
    [switch]$All,
    [switch]$DryRun,
    [switch]$SkipVerification,
    [switch]$Force,
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

function Write-Step {
    param([string]$Step, [string]$Description)
    Write-Host "  [$Step] " -ForegroundColor Cyan -NoNewline
    Write-Host $Description
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
# PR DESCRIPTION GENERATORS
# ============================================================================

function Get-PRDescription {
    param([hashtable]$PRConfig)

    # REQUIRE description file to exist - no auto-generation
    # This ensures PR descriptions are complete, reviewed, and professional
    $descFile = Join-Path $scriptDir $PRConfig.DescriptionFile

    if (-not $PRConfig.DescriptionFile) {
        Write-Error "PR configuration for '$($PRConfig.Branch)' is missing DescriptionFile property"
        throw "Missing DescriptionFile in PR configuration"
    }

    if (-not (Test-Path $descFile)) {
        Write-Error @"
PR description file not found: $descFile

Each PR requires a complete description file in pr-descriptions/ folder.
Create the file with:
- Executive summary
- Checklist
- Detailed changes
- Testing steps
- Release note

See existing files in pr-descriptions/ for examples.
"@
        throw "Missing required PR description file: $($PRConfig.DescriptionFile)"
    }

    Write-Host "    Using description file: $($PRConfig.DescriptionFile)" -ForegroundColor DarkGray
    return Get-Content $descFile -Raw
}

# ============================================================================
# TRACKING FUNCTIONS
# ============================================================================

function Get-PRTracking {
    param([string]$FilePath)

    if (Test-Path $FilePath) {
        return Get-Content $FilePath -Raw | ConvertFrom-Json -AsHashtable
    }

    return @{
        CreatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        PRs = @{}
    }
}

function Save-PRTracking {
    param(
        [string]$FilePath,
        [hashtable]$Tracking
    )

    $Tracking.UpdatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $Tracking | ConvertTo-Json -Depth 10 | Set-Content $FilePath
}

function Get-ExistingPR {
    param([string]$BranchName)

    # Check if PR already exists for this branch
    $prs = gh pr list --head $BranchName --json number,state 2>$null | ConvertFrom-Json

    if ($prs -and $prs.Count -gt 0) {
        return $prs[0]
    }

    return $null
}

# ============================================================================
# LABEL AND MILESTONE SETUP
# ============================================================================

function Initialize-Labels {
    $config = Get-PRConfig

    Write-Host "`n  Setting up labels..." -ForegroundColor Cyan

    foreach ($label in $config.Labels) {
        $existingLabel = gh label list --search $label.Name --json name 2>$null | ConvertFrom-Json

        if (-not $existingLabel -or $existingLabel.Count -eq 0) {
            if (-not $DryRun) {
                gh label create $label.Name --color $label.Color --description $label.Description --force 2>$null
            }
            Write-Host "    Created label: $($label.Name)" -ForegroundColor Green
        } else {
            Write-Host "    Label exists: $($label.Name)" -ForegroundColor DarkGray
        }
    }
}

function Initialize-Milestone {
    $config = Get-PRConfig
    $milestoneName = $config.Milestone

    Write-Host "  Setting up milestone..." -ForegroundColor Cyan

    $milestones = gh milestone list --json title 2>$null | ConvertFrom-Json
    $exists = $milestones | Where-Object { $_.title -eq $milestoneName }

    if (-not $exists) {
        if (-not $DryRun) {
            gh milestone create $milestoneName --description "Comprehensive help for find and filter experiences (Alt+F1)" 2>$null
        }
        Write-Host "    Created milestone: $milestoneName" -ForegroundColor Green
    } else {
        Write-Host "    Milestone exists: $milestoneName" -ForegroundColor DarkGray
    }
}

# ============================================================================
# PR CREATION
# ============================================================================

function New-PullRequest {
    param([hashtable]$PRConfig)

    $branch = $PRConfig.Branch
    $title = $PRConfig.Title

    Write-Host "`n  +$('-' * 56)+" -ForegroundColor Cyan
    Write-Host "  | Creating PR: " -ForegroundColor Cyan -NoNewline
    Write-Host "$branch".PadRight(40).Substring(0, 40) -ForegroundColor Yellow -NoNewline
    Write-Host " |" -ForegroundColor Cyan
    Write-Host "  +$('-' * 56)+" -ForegroundColor Cyan

    # Check if PR already exists
    $existingPR = Get-ExistingPR -BranchName $branch
    if ($existingPR) {
        Write-Warning "PR already exists: #$($existingPR.number) ($($existingPR.state))"

        if (-not $Force) {
            return @{
                Success = $true
                PRNumber = $existingPR.number
                Skipped = $true
                Message = "PR already exists"
            }
        }

        Write-Host "    -Force specified, continuing..." -ForegroundColor Yellow
    }

    # Run verification if not skipped
    if (-not $SkipVerification) {
        Write-Step "1/5" "Verifying branch..."

        # Quick verification
        $exists = git branch --list $branch 2>$null
        $remoteBranch = git branch -r --list "origin/$branch" 2>$null

        if (-not $exists -and -not $remoteBranch) {
            Write-Error "Branch not found: $branch"
            return @{ Success = $false; Message = "Branch not found" }
        }

        # Check file diff
        $files = git diff main...$branch --name-only 2>$null
        $expectedFiles = $PRConfig.ExpectedFiles

        $missingFiles = @()
        foreach ($expected in $expectedFiles) {
            if ($files -notcontains $expected) {
                $missingFiles += $expected
            }
        }

        if ($missingFiles.Count -gt 0) {
            Write-Warning "Missing expected files: $($missingFiles -join ', ')"
            if (-not $Force) {
                return @{ Success = $false; Message = "Missing expected files" }
            }
        }

        Write-Host "    ✓ Branch verified" -ForegroundColor Green
    }

    # Generate description
    Write-Step "2/5" "Generating description..."
    $description = Get-PRDescription -PRConfig $PRConfig

    if ($DryRun) {
        Write-Host "`n    --- DRY RUN: Would create PR with ---" -ForegroundColor Yellow
        Write-Host "    Title: $title" -ForegroundColor DarkGray
        Write-Host "    Base: main" -ForegroundColor DarkGray
        Write-Host "    Head: $branch" -ForegroundColor DarkGray
        Write-Host "    Labels: $($PRConfig.Labels -join ', ')" -ForegroundColor DarkGray
        Write-Host "    Reviewers: $($PRConfig.Reviewers -join ', ')" -ForegroundColor DarkGray
        Write-Host "    --- End DRY RUN ---`n" -ForegroundColor Yellow

        return @{
            Success = $true
            PRNumber = "DRY-RUN"
            DryRun = $true
        }
    }

    # Create PR
    Write-Step "3/5" "Creating pull request..."

    $prOutput = gh pr create `
        --base main `
        --head $branch `
        --title $title `
        --body $description 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create PR: $prOutput"
        return @{ Success = $false; Message = $prOutput }
    }

    # Extract PR number from output
    $prNumber = $null
    if ($prOutput -match "pull/(\d+)") {
        $prNumber = $Matches[1]
    } elseif ($prOutput -match "#(\d+)") {
        $prNumber = $Matches[1]
    }

    Write-Host "    ✓ Created PR #$prNumber" -ForegroundColor Green

    # Add labels
    Write-Step "4/5" "Adding labels..."

    if ($PRConfig.Labels -and $PRConfig.Labels.Count -gt 0) {
        $labelString = $PRConfig.Labels -join ","
        gh pr edit $prNumber --add-label $labelString 2>$null
        Write-Host "    ✓ Labels added: $labelString" -ForegroundColor Green
    }

    # Add reviewers
    Write-Step "5/5" "Adding reviewers and milestone..."

    if ($PRConfig.Reviewers -and $PRConfig.Reviewers.Count -gt 0) {
        foreach ($reviewer in $PRConfig.Reviewers) {
            gh pr edit $prNumber --add-reviewer $reviewer 2>$null
        }
        Write-Host "    ✓ Reviewers added: $($PRConfig.Reviewers -join ', ')" -ForegroundColor Green
    } else {
        Write-Warning "No reviewers specified - add manually"
    }

    # Add milestone
    $config = Get-PRConfig
    gh pr edit $prNumber --milestone $config.Milestone 2>$null
    Write-Host "    ✓ Milestone set: $($config.Milestone)" -ForegroundColor Green

    Write-Success "PR #$prNumber created successfully!"
    Write-Host "    URL: https://github.com/microsoft/vscode/pull/$prNumber" -ForegroundColor Cyan

    return @{
        Success = $true
        PRNumber = $prNumber
        URL = "https://github.com/microsoft/vscode/pull/$prNumber"
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Write-Header "PR CREATION AUTOMATION"

if ($DryRun) {
    Write-Host "`n  ⚠️  DRY RUN MODE - No changes will be made`n" -ForegroundColor Yellow
}

# Determine which PRs to create
$config = Get-PRConfig
$prsToCreate = @()

if ($Branch) {
    $pr = Get-PRByBranch -BranchName $Branch
    if ($pr) {
        $prsToCreate += $pr
    } else {
        Write-Error "Branch '$Branch' not found in configuration"
        exit 1
    }
} elseif ($Phase -gt 0) {
    $prsToCreate = @(Get-PRsByPhase -Phase $Phase)
} elseif ($All) {
    $prsToCreate = $config.PRs
} else {
    Write-Host @"

  Usage:
    .\Create-PRs.ps1 -Phase <number>    Create PR for a specific phase (1=Foundation, 2=Content, 3=Polish)
    .\Create-PRs.ps1 -Branch <name>     Create PR for a specific branch
    .\Create-PRs.ps1 -All               Create all 3 PRs

  Options:
    -DryRun              Show what would be created without creating
    -SkipVerification    Skip branch verification checks
    -Force               Create even if PR exists or verification fails

  Examples:
    .\Create-PRs.ps1 -Phase 1
    .\Create-PRs.ps1 -Phase 1 -DryRun
    .\Create-PRs.ps1 -Branch "feature/editor-find-accessibility-help"

"@
    exit 0
}

if ($prsToCreate.Count -eq 0) {
    Write-Warning "No PRs to create"
    exit 0
}

Write-Host "  Creating $($prsToCreate.Count) PR(s)...`n" -ForegroundColor White

# Initialize labels and milestone
Initialize-Labels
Initialize-Milestone

# Load tracking
$tracking = Get-PRTracking -FilePath $TrackingFile

# Create each PR
$results = @()
$created = 0
$skipped = 0
$failed = 0

foreach ($pr in $prsToCreate) {
    $result = New-PullRequest -PRConfig $pr
    $results += @{
        Branch = $pr.Branch
        Result = $result
    }

    if ($result.Success) {
        if ($result.Skipped) {
            $skipped++
        } else {
            $created++

            # Track the PR
            if (-not $DryRun) {
                $tracking.PRs[$pr.Branch] = @{
                    PRNumber = $result.PRNumber
                    CreatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    Title = $pr.Title
                    Phase = $pr.Phase
                    URL = $result.URL
                }
            }
        }
    } else {
        $failed++
    }
}

# Save tracking
if (-not $DryRun -and $created -gt 0) {
    Save-PRTracking -FilePath $TrackingFile -Tracking $tracking
    Write-Host "`n  Tracking saved to: $TrackingFile" -ForegroundColor DarkGray
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n$('-' * 60)" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "                        SUMMARY" -ForegroundColor White
Write-Host "$('-' * 60)" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

Write-Host "`n  PRs requested: $($prsToCreate.Count)" -ForegroundColor White
Write-Host "  Created: $created" -ForegroundColor Green
Write-Host "  Skipped (already exist): $skipped" -ForegroundColor Yellow
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "White" })

if ($created -gt 0 -or $skipped -gt 0) {
    Write-Host "`n  Created PRs:" -ForegroundColor Cyan
    foreach ($r in $results | Where-Object { $_.Result.Success }) {
        $prNum = $r.Result.PRNumber
        $status = if ($r.Result.Skipped) { "(existing)" } elseif ($r.Result.DryRun) { "(dry-run)" } else { "" }
        Write-Host "    - #$prNum - $($r.Branch) $status" -ForegroundColor White
    }
}

if ($failed -gt 0) {
    Write-Host "`n  Failed:" -ForegroundColor Red
    foreach ($r in $results | Where-Object { -not $_.Result.Success }) {
        Write-Host "    - $($r.Branch): $($r.Result.Message)" -ForegroundColor Red
    }
}

Write-Host "`n  Next steps:" -ForegroundColor White
Write-Host "    • Run .\Monitor-PRs.ps1 to check PR status" -ForegroundColor DarkGray
Write-Host "    • Run .\Merge-PRs.ps1 -Phase <n> when approved" -ForegroundColor DarkGray

Write-Host "`n$('-' * 60)`n" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

return @{
    Created = $created
    Skipped = $skipped
    Failed = $failed
    Results = $results
}
