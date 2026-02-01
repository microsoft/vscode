# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Validates all prerequisites for the PR automation workflow.

.DESCRIPTION
    Checks for:
    - Git installation and configuration
    - GitHub CLI (gh) installation and authentication
    - npm availability
    - Repository state (clean working tree, up-to-date main)
    - Required branches existence

.EXAMPLE
    .\Check-Prerequisites.ps1

.EXAMPLE
    .\Check-Prerequisites.ps1 -Fix
    Attempts to fix issues where possible (e.g., fetch origin, login to gh)
#>

[CmdletBinding()]
param(
    [switch]$Fix,
    [string]$RepoPath = (Get-Location)
)

# Import configuration
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$scriptDir\PR-Config.ps1"

# ============================================================================
# COLORS AND OUTPUT HELPERS
# ============================================================================

function Write-CheckResult {
    param(
        [string]$Check,
        [bool]$Passed,
        [string]$Message = "",
        [string]$Fix = ""
    )

    $icon = if ($Passed) { "[PASS]" } else { "[FAIL]" }
    $color = if ($Passed) { "Green" } else { "Red" }

    Write-Host "$icon " -ForegroundColor $color -NoNewline
    Write-Host $Check

    if (-not [string]::IsNullOrEmpty($Message)) {
        $msgColor = if ($Passed) { "DarkGray" } else { "Yellow" }
        Write-Host "      $Message" -ForegroundColor $msgColor
    }

    if (-not $Passed -and -not [string]::IsNullOrEmpty($Fix)) {
        Write-Host "      Fix: $Fix" -ForegroundColor Cyan
    }
}

function Write-Section {
    param([string]$Title)
    Write-Host "`n$('=' * 60)" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "$('=' * 60)" -ForegroundColor Cyan
}

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

$allPassed = $true
$issues = @()

Write-Host @"

------------------------------------------------------------------
|           PR AUTOMATION PREREQUISITE CHECK                      |
------------------------------------------------------------------

"@ -ForegroundColor White

# ---------------------------------------------------------------------------
# Section 1: Tool Installation
# ---------------------------------------------------------------------------
Write-Section "1. TOOL INSTALLATION"

# Check Git
$gitVersion = $null
try {
    $gitVersion = git --version 2>$null
    $gitInstalled = $LASTEXITCODE -eq 0
} catch {
    $gitInstalled = $false
}

Write-CheckResult -Check "Git installed" -Passed $gitInstalled `
    -Message $(if ($gitInstalled) { $gitVersion } else { "Git not found in PATH" }) `
    -Fix "Install from https://git-scm.com/download/win or run: winget install Git.Git"

if (-not $gitInstalled) {
    $allPassed = $false
    $issues += "Git not installed"
}

# Check GitHub CLI
$ghVersion = $null
try {
    $ghVersion = gh --version 2>$null | Select-Object -First 1
    $ghInstalled = $LASTEXITCODE -eq 0
} catch {
    $ghInstalled = $false
}

Write-CheckResult -Check "GitHub CLI (gh) installed" -Passed $ghInstalled `
    -Message $(if ($ghInstalled) { $ghVersion } else { "gh not found in PATH" }) `
    -Fix "Install via: winget install GitHub.cli"

if (-not $ghInstalled) {
    $allPassed = $false
    $issues += "GitHub CLI not installed"
}

# Check npm
$npmVersion = $null
try {
    $npmVersion = npm --version 2>$null
    $npmInstalled = $LASTEXITCODE -eq 0
} catch {
    $npmInstalled = $false
}

Write-CheckResult -Check "npm installed" -Passed $npmInstalled `
    -Message $(if ($npmInstalled) { "npm $npmVersion" } else { "npm not found in PATH" }) `
    -Fix "Install Node.js from https://nodejs.org/"

if (-not $npmInstalled) {
    $allPassed = $false
    $issues += "npm not installed"
}

# ---------------------------------------------------------------------------
# Section 2: Authentication
# ---------------------------------------------------------------------------
Write-Section "2. AUTHENTICATION"

$ghAuth = $null
$ghAuthenticated = $false
if ($ghInstalled) {
    try {
        $ghAuth = gh auth status 2>&1
        $ghAuthenticated = $LASTEXITCODE -eq 0
    } catch {
        $ghAuthenticated = $false
    }
}

Write-CheckResult -Check "GitHub CLI authenticated" -Passed $ghAuthenticated `
    -Message $(if ($ghAuthenticated) { "Authenticated to GitHub.com" } else { "Not logged in to GitHub" }) `
    -Fix "Run: gh auth login"

if ($ghAuthenticated -eq $false -and $Fix) {
    Write-Host "      Attempting to authenticate..." -ForegroundColor Yellow
    gh auth login
    $ghAuth = gh auth status 2>&1
    $ghAuthenticated = $LASTEXITCODE -eq 0
}

if (-not $ghAuthenticated) {
    $allPassed = $false
    $issues += "GitHub CLI not authenticated"
}

# ---------------------------------------------------------------------------
# Section 3: Repository State
# ---------------------------------------------------------------------------
Write-Section "3. REPOSITORY STATE"

# Check we're in a git repo
$inGitRepo = $false
Push-Location $RepoPath
try {
    $gitRoot = git rev-parse --show-toplevel 2>$null
    $inGitRepo = $LASTEXITCODE -eq 0
} catch {}

Write-CheckResult -Check "In git repository" -Passed $inGitRepo `
    -Message $(if ($inGitRepo) { $gitRoot } else { "Not in a git repository" }) `
    -Fix "Navigate to the VS Code repository: cd c:\vscode"

if (-not $inGitRepo) {
    $allPassed = $false
    $issues += "Not in git repository"
    Pop-Location
    return
}

# Check remote origin
$remoteUrl = git remote get-url origin 2>$null
$isVSCodeRepo = $remoteUrl -match "microsoft/vscode"

Write-CheckResult -Check "Remote is microsoft/vscode" -Passed $isVSCodeRepo `
    -Message $(if ($isVSCodeRepo) { $remoteUrl } else { "Remote: $remoteUrl" }) `
    -Fix "git remote set-url origin https://github.com/microsoft/vscode.git"

if (-not $isVSCodeRepo) {
    $allPassed = $false
    $issues += "Not in microsoft/vscode repository"
}

# Check current branch
$currentBranch = git branch --show-current 2>$null
$onMain = $currentBranch -eq "main"

Write-CheckResult -Check "On main branch" -Passed $onMain `
    -Message "Current branch: $currentBranch" `
    -Fix "git checkout main"

# Check for uncommitted changes
$gitStatus = git status --porcelain 2>$null
$cleanWorkTree = [string]::IsNullOrEmpty($gitStatus)

Write-CheckResult -Check "Clean working tree" -Passed $cleanWorkTree `
    -Message $(if ($cleanWorkTree) { "No uncommitted changes" } else { "$($gitStatus.Count) uncommitted changes" }) `
    -Fix "git stash or git commit your changes"

if (-not $cleanWorkTree) {
    $allPassed = $false
    $issues += "Uncommitted changes in working tree"
}

# Check if main is up to date
if ($Fix) {
    Write-Host "      Fetching from origin..." -ForegroundColor Yellow
    git fetch origin main 2>$null
}

$behindMain = git rev-list --count main..origin/main 2>$null
$mainUpToDate = ($behindMain -eq 0)

Write-CheckResult -Check "Main branch up to date" -Passed $mainUpToDate `
    -Message $(if ($mainUpToDate) { "Synchronized with origin/main" } else { "$behindMain commits behind origin/main" }) `
    -Fix "git pull origin main"

if (-not $mainUpToDate -and $Fix) {
    Write-Host "      Pulling latest main..." -ForegroundColor Yellow
    git pull origin main 2>$null
}

# ---------------------------------------------------------------------------
# Section 4: Required Branches
# ---------------------------------------------------------------------------
Write-Section "4. REQUIRED BRANCHES"

$config = Get-PRConfig
$allBranches = Get-AllBranches
$localBranches = git branch --list 2>$null | ForEach-Object { $_.Trim().TrimStart('* ') }
$remoteBranches = git branch -r 2>$null | ForEach-Object { $_.Trim().Replace('origin/', '') }

$missingBranches = @()
$foundBranches = @()

foreach ($branch in $allBranches) {
    $existsLocal = $localBranches -contains $branch
    $existsRemote = $remoteBranches -contains $branch

    if ($existsLocal -or $existsRemote) {
        $foundBranches += $branch
    } else {
        $missingBranches += $branch
    }
}

$branchesOK = $missingBranches.Count -eq 0

Write-CheckResult -Check "All required branches exist" -Passed $branchesOK `
    -Message "Found $($foundBranches.Count)/$($allBranches.Count) branches"

if (-not $branchesOK) {
    Write-Host "      Missing branches:" -ForegroundColor Yellow
    foreach ($branch in $missingBranches) {
        Write-Host "        - $branch" -ForegroundColor Red
    }
    $issues += "Missing branches: $($missingBranches -join ', ')"
} else {
    if ($VerbosePreference -eq 'Continue') {
        foreach ($branch in $foundBranches) {
            Write-Host "        [OK] $branch" -ForegroundColor DarkGray
        }
    }
}

# ---------------------------------------------------------------------------
# Section 5: Compilation Check
# ---------------------------------------------------------------------------
Write-Section "5. BUILD SYSTEM"

# Check if package.json exists
$packageJsonExists = Test-Path "$RepoPath\package.json"

Write-CheckResult -Check "package.json exists" -Passed $packageJsonExists `
    -Message $(if ($packageJsonExists) { "Found at repository root" } else { "Missing package.json" })

# Check if node_modules exists
$nodeModulesExists = Test-Path "$RepoPath\node_modules"

Write-CheckResult -Check "node_modules installed" -Passed $nodeModulesExists `
    -Message $(if ($nodeModulesExists) { "Dependencies installed" } else { "Run npm install first" }) `
    -Fix "npm install"

if (-not $nodeModulesExists) {
    $issues += "node_modules not installed"
}

Pop-Location

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host "`n$('-' * 60)" -ForegroundColor $(if ($allPassed) { "Green" } else { "Red" })

if ($allPassed -and $branchesOK) {
    Write-Host @"

    [OK] ALL PREREQUISITES PASSED

    You're ready to run the PR automation scripts!

    Next steps:
      1. Run .\Verify-Branches.ps1 to validate branch content
      2. Run .\Create-PRs.ps1 -Phase 1 to create PR 1 (Foundation)

"@ -ForegroundColor Green
} else {
    Write-Host @"

    [FAIL] SOME PREREQUISITES FAILED

    Please fix the following issues before proceeding:

"@ -ForegroundColor Red

    foreach ($issue in $issues) {
        Write-Host "      - $issue" -ForegroundColor Yellow
    }

    Write-Host "`n    Run with -Fix parameter to attempt automatic fixes:" -ForegroundColor Cyan
    Write-Host "      .\Check-Prerequisites.ps1 -Fix" -ForegroundColor White
}

Write-Host "$('-' * 60)`n" -ForegroundColor $(if ($allPassed) { "Green" } else { "Red" })

# Return result for scripts
return @{
    AllPassed = ($allPassed -and $branchesOK)
    Issues = $issues
    MissingBranches = $missingBranches
}
