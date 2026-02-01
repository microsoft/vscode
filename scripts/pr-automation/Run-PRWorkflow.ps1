# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
SYNOPSIS
    Main entry point for PR automation - runs the complete workflow.

.DESCRIPTION
    Orchestrates the full PR process:
    1. Prerequisites check
    2. Branch verification
    3. PR creation
    4. Monitoring
    5. Merging

.EXAMPLE
    .\Run-PRWorkflow.ps1 -Phase 1
    Runs the complete workflow for Phase 1

.EXAMPLE
    .\Run-PRWorkflow.ps1 -CheckOnly
    Only runs prerequisite checks

.EXAMPLE
    .\Run-PRWorkflow.ps1 -VerifyOnly
    Only runs branch verification

.EXAMPLE
    .\Run-PRWorkflow.ps1 -Status
    Shows current PR status dashboard
#>

[CmdletBinding()]
param(
    [int]$Phase,
    [switch]$CheckOnly,
    [switch]$VerifyOnly,
    [switch]$CreateOnly,
    [switch]$Status,
    [switch]$DryRun,
    [switch]$Force,
    [switch]$Help
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ============================================================================
# HELP
# ============================================================================

if ($Help -or ($PSBoundParameters.Count -eq 0)) {
    Write-Host @"

------------------------------------------------------------------
|                    PR AUTOMATION TOOLKIT                        |
|      VS Code Accessibility Help System - PR Management          |
------------------------------------------------------------------

SCRIPTS AVAILABLE:

  Check-Prerequisites.ps1   Verify git, gh CLI, authentication, branches
  Verify-Branches.ps1       Validate branch content and code quality
  Create-PRs.ps1           Create PRs with labels, reviewers, milestones
  Monitor-PRs.ps1          Dashboard showing PR status and review state
  Merge-PRs.ps1            Merge approved PRs that pass all checks

QUICK START:

  1. Run prerequisites check:
     .\Check-Prerequisites.ps1 -Fix

  2. Verify branches before creating PRs:
     .\Verify-Branches.ps1 -Phase 1

  3. Create PR 1 (Foundation):
     .\Create-PRs.ps1 -Phase 1

  4. Monitor PR status:
     .\Monitor-PRs.ps1

  5. Merge when approved:
     .\Merge-PRs.ps1 -Phase 1

CONSOLIDATED 3-PR STRUCTURE:

  PR 1 (Phase 1): Foundation & Infrastructure
    - feature/accessibility-help-foundation
    - Core wiring, contribution registrations, config, PRD

  PR 2 (Phase 2): Accessibility Help Content
    - feature/accessibility-help-content
    - All 7 new *AccessibilityHelp.ts provider files

  PR 3 (Phase 3): ARIA Hints & Bug Fixes
    - feature/accessibility-aria-polish
    - Widget ARIA hints, findWidget.ts bug fixes

  -Phase <n>      Target a specific PR (1-3)
  -DryRun         Preview actions without making changes
  -Force          Proceed despite warnings
  -Help           Show this help message

EXAMPLES:

  # Full workflow for PR 1 (Foundation)
  .\Run-PRWorkflow.ps1 -Phase 1

  # Just check status
  .\Run-PRWorkflow.ps1 -Status

  # Dry run to see what would happen
  .\Run-PRWorkflow.ps1 -Phase 1 -DryRun

  # Individual scripts
  .\Check-Prerequisites.ps1
  .\Verify-Branches.ps1 -Phase 1
  .\Create-PRs.ps1 -Phase 1 -DryRun
  .\Monitor-PRs.ps1 -Watch
  .\Merge-PRs.ps1 -AutoMerge

CONFIGURATION:

  Edit PR-Config.ps1 to customize:
  - Branch names and expected files
  - Reviewers for each PR
  - Labels and milestones
  - PR descriptions

"@ -ForegroundColor White
    exit 0
}

# ============================================================================
# STATUS DASHBOARD
# ============================================================================

if ($Status) {
    & "$scriptDir\Monitor-PRs.ps1"
    exit 0
}

# ============================================================================
# CHECK ONLY
# ============================================================================

if ($CheckOnly) {
    $result = & "$scriptDir\Check-Prerequisites.ps1" -Fix:$Force
    exit $(if ($result.AllPassed) { 0 } else { 1 })
}

# ============================================================================
# VERIFY ONLY
# ============================================================================

if ($VerifyOnly) {
    $args = @()
    if ($Phase -gt 0) { $args += @("-Phase", $Phase) }

    $result = & "$scriptDir\Verify-Branches.ps1" @args
    exit $(if ($result.AllPassed) { 0 } else { 1 })
}

# ============================================================================
# CREATE ONLY
# ============================================================================

if ($CreateOnly) {
    $args = @()
    if ($Phase -gt 0) { $args += @("-Phase", $Phase) }
    if ($DryRun) { $args += "-DryRun" }
    if ($Force) { $args += "-Force" }

    $result = & "$scriptDir\Create-PRs.ps1" @args
    exit $(if ($result.Failed -eq 0) { 0 } else { 1 })
}

# ============================================================================
# FULL WORKFLOW
# ============================================================================

if ($Phase -gt 0) {
    Write-Host @"

---------------------------------------------------------------
|               RUNNING FULL PR WORKFLOW                        |
|                      Phase $Phase                             |
---------------------------------------------------------------

"@ -ForegroundColor White

    # Step 1: Prerequisites
    Write-Host "STEP 1/4: Checking prerequisites..." -ForegroundColor Cyan
    $prereq = & "$scriptDir\Check-Prerequisites.ps1" -Fix

    if (-not $prereq.AllPassed) {
        Write-Host "`n[FAIL] Prerequisites failed. Please fix issues above.`n" -ForegroundColor Red
        exit 1
    }

    # Step 2: Verification
    Write-Host "`nSTEP 2/4: Verifying branches..." -ForegroundColor Cyan
    $verify = & "$scriptDir\Verify-Branches.ps1" -Phase $Phase -SkipCompile

    if (-not $verify.AllPassed -and -not $Force) {
        Write-Host "`n[FAIL] Branch verification failed. Use -Force to continue anyway.`n" -ForegroundColor Red
        exit 1
    }

    # Step 3: Create PRs
    Write-Host "`nSTEP 3/4: Creating PRs..." -ForegroundColor Cyan
    $createArgs = @("-Phase", $Phase)
    if ($DryRun) { $createArgs += "-DryRun" }
    if ($Force) { $createArgs += "-Force" }

    $create = & "$scriptDir\Create-PRs.ps1" @createArgs

    if ($create.Failed -gt 0) {
        Write-Host "`n[WARN] Some PRs failed to create.`n" -ForegroundColor Yellow
    }

    # Step 4: Show status
    Write-Host "`nSTEP 4/4: Current status..." -ForegroundColor Cyan
    & "$scriptDir\Monitor-PRs.ps1" -Phase $Phase

    Write-Host @"

----------------------------------------------------------------

  WORKFLOW COMPLETE FOR PHASE $Phase

  Next steps:
  1. Monitor PRs: .\Monitor-PRs.ps1 -Phase $Phase -Watch
  2. Address any review feedback
  3. When approved: .\Merge-PRs.ps1 -Phase $Phase

----------------------------------------------------------------

"@ -ForegroundColor Green

    exit 0
}

# Default: show help
& $MyInvocation.MyCommand.Path -Help
