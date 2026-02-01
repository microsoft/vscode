# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

<#
.SYNOPSIS
    Verifies branch content against expected files and code quality standards.

.DESCRIPTION
    For each branch, this script checks:
    - Correct files are modified/created
    - No unintended files changed
    - No debug code (console.log, debugger, TODO, etc.)
    - TypeScript compilation passes
    - Code follows VS Code patterns
    - Commit messages are clean

.EXAMPLE
    .\Verify-Branches.ps1
    Verifies all branches

.EXAMPLE
    .\Verify-Branches.ps1 -Branch "feature/editor-find-accessibility-help"
    Verifies a specific branch

.EXAMPLE
    .\Verify-Branches.ps1 -Phase 1
    Verifies PR 1 (Foundation) branch

.EXAMPLE
    .\Verify-Branches.ps1 -SkipCompile
    Skips TypeScript compilation check (faster)
#>

[CmdletBinding()]
param(
    [string]$Branch,
    [int]$Phase,
    [switch]$SkipCompile,
    [switch]$Detailed,
    [switch]$StopOnError
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

function Write-BranchHeader {
    param([string]$BranchName, [int]$Current, [int]$Total)
    Write-Host "`n+$('-' * 58)+" -ForegroundColor Cyan
    Write-Host "| Branch [$Current/$Total]: " -ForegroundColor Cyan -NoNewline
    Write-Host "$BranchName".PadRight(42) -ForegroundColor Yellow -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    Write-Host "+$('-' * 58)+" -ForegroundColor Cyan
}

function Write-Check {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Details = "",
        [switch]$Warning
    )

    if ($Warning) {
        $icon = "[WARN]"
        $color = "Yellow"
    } elseif ($Passed) {
        $icon = "[OK]"
        $color = "Green"
    } else {
        $icon = "[FAIL]"
        $color = "Red"
    }

    Write-Host "  [$icon] " -ForegroundColor $color -NoNewline
    Write-Host $Name

    if (-not [string]::IsNullOrEmpty($Details)) {
        $detailColor = if ($Passed) { "DarkGray" } else { "Yellow" }
        Write-Host "      $Details" -ForegroundColor $detailColor
    }
}

# ============================================================================
# VERIFICATION FUNCTIONS
# ============================================================================

function Test-BranchExists {
    param([string]$BranchName)

    $localExists = git branch --list $BranchName 2>$null
    $remoteExists = git branch -r --list "origin/$BranchName" 2>$null

    return ($null -ne $localExists -and $localExists -ne "") -or ($null -ne $remoteExists -and $remoteExists -ne "")
}

function Get-BranchDiffFiles {
    param([string]$BranchName)

    $files = git diff main...$BranchName --name-only 2>$null
    return $files
}

function Get-BranchDiffStats {
    param([string]$BranchName)

    $stats = git diff main...$BranchName --stat 2>$null
    $additions = 0
    $deletions = 0

    foreach ($line in $stats) {
        if ($line -match "(\d+) insertions?\(\+\)") {
            $additions += [int]$Matches[1]
        }
        if ($line -match "(\d+) deletions?\(-\)") {
            $deletions += [int]$Matches[1]
        }
    }

    return @{
        Additions = $additions
        Deletions = $deletions
        Total = $additions + $deletions
    }
}

function Test-DebugCode {
    param([string]$BranchName)

    $debugPatterns = @(
        "console\.log",
        "console\.debug",
        "console\.warn",
        "console\.error",
        "debugger;",
        "// TODO",
        "// FIXME",
        "// HACK",
        "// XXX"
    )

    $issues = @()

    foreach ($pattern in $debugPatterns) {
        $matches = git diff main...$BranchName 2>$null | Select-String -Pattern "^\+.*$pattern" -AllMatches
        if ($matches) {
            foreach ($match in $matches) {
                $issues += @{
                    Pattern = $pattern
                    Line = $match.Line.Trim()
                }
            }
        }
    }

    return $issues
}

function Test-AnyTypes {
    param([string]$BranchName)

    $anyMatches = git diff main...$BranchName 2>$null | Select-String -Pattern "^\+.*:\s*any\b" -AllMatches
    $issues = @()

    if ($anyMatches) {
        foreach ($match in $anyMatches) {
            $issues += $match.Line.Trim()
        }
    }

    return $issues
}

function Test-CopyrightHeader {
    param([string]$BranchName, [string]$FilePath)

    $fileContent = git show "${BranchName}:${FilePath}" 2>$null | Select-Object -First 5 | Out-String
    return $fileContent -match "Copyright.*Microsoft"
}

function Test-Localization {
    param([string]$BranchName)

    # Check for hardcoded user-facing strings
    $diff = git diff main...$BranchName 2>$null

    # Look for string additions that might need localization
    $stringPatterns = git diff main...$BranchName 2>$null |
        Select-String -Pattern "^\+.*['""].*['""]" |
        Where-Object { $_ -notmatch "nls\.localize|import|require|console\.|localize\(" }

    return @($stringPatterns)
}

function Test-CommitMessages {
    param([string]$BranchName)

    $commits = git log main..$BranchName --oneline 2>$null
    $issues = @()

    $badPatterns = @("^WIP", "^temp", "^fix$", "^asdf", "^test$", "^wip")

    foreach ($commit in $commits) {
        foreach ($pattern in $badPatterns) {
            if ($commit -match $pattern) {
                $issues += $commit
                break
            }
        }
    }

    return $issues
}

function Invoke-BranchVerification {
    param([hashtable]$PRConfig)

    $branchName = $PRConfig.Branch
    $issues = @()
    $warnings = @()
    $allPassed = $true

    # Check 1: Branch exists
    $exists = Test-BranchExists -BranchName $branchName
    Write-Check -Name "Branch exists" -Passed $exists
    if (-not $exists) {
        Write-Host "    [ERROR] Cannot continue verification - branch not found" -ForegroundColor Red
        return @{ Passed = $false; Issues = @("Branch does not exist"); Warnings = @() }
    }

    # Check 2: Changed files match expected
    $changedFiles = @(Get-BranchDiffFiles -BranchName $branchName)
    $expectedFiles = $PRConfig.ExpectedFiles
    $fileCountMatch = $changedFiles.Count -eq $PRConfig.ExpectedFileCount

    $filesMatch = $true
    foreach ($expected in $expectedFiles) {
        if ($changedFiles -notcontains $expected) {
            $filesMatch = $false
            break
        }
    }

    # Check for unexpected files
    $unexpectedFiles = @()
    foreach ($file in $changedFiles) {
        if ($expectedFiles -notcontains $file) {
            $unexpectedFiles += $file
        }
    }

    $allFilesOK = $filesMatch -and ($unexpectedFiles.Count -eq 0) -and $fileCountMatch
    Write-Check -Name "Changed files match expected" -Passed $allFilesOK `
        -Details "Expected: $($expectedFiles -join ', ') | Found: $($changedFiles -join ', ')"

    if ($unexpectedFiles.Count -gt 0) {
        Write-Host "      [WARN]  Unexpected files:" -ForegroundColor Yellow
        foreach ($file in $unexpectedFiles) {
            Write-Host "         - $file" -ForegroundColor Yellow
        }
        $warnings += "Unexpected files: $($unexpectedFiles -join ', ')"
    }

    if (-not $filesMatch) {
        $issues += "Missing expected files"
        $allPassed = $false
    }

    # Check 3: Line count in expected range
    $stats = Get-BranchDiffStats -BranchName $branchName
    $lineCountOK = $true

    if ($PRConfig.EstimatedLines) {
        $inRange = ($stats.Additions -ge $PRConfig.EstimatedLines.Min) -and
                   ($stats.Additions -le $PRConfig.EstimatedLines.Max)

        if (-not $inRange) {
            $lineCountOK = $false
            $warnings += "Line count ($($stats.Additions)) outside expected range ($($PRConfig.EstimatedLines.Min)-$($PRConfig.EstimatedLines.Max))"
        }
    }

    Write-Check -Name "Line count in expected range" -Passed $lineCountOK `
        -Details "+$($stats.Additions) -$($stats.Deletions) lines" -Warning:(-not $lineCountOK)

    # Check 4: No debug code
    $debugIssues = Test-DebugCode -BranchName $branchName
    $noDebugCode = $debugIssues.Count -eq 0

    Write-Check -Name "No debug code" -Passed $noDebugCode

    if (-not $noDebugCode) {
        foreach ($issue in $debugIssues) {
            Write-Host "      [WARN]  Found: $($issue.Pattern)" -ForegroundColor Yellow
        }
        $issues += "Debug code found: $($debugIssues.Count) instances"
        $allPassed = $false
    }

    # Check 5: No `any` types
    $anyIssues = Test-AnyTypes -BranchName $branchName
    $noAnyTypes = $anyIssues.Count -eq 0

    Write-Check -Name "No 'any' types" -Passed $noAnyTypes

    if (-not $noAnyTypes) {
        $issues += "'any' type found: $($anyIssues.Count) instances"
        $allPassed = $false
    }

    # Check 6: Copyright header (for new files)
    if ($PRConfig.IsNewFile) {
        foreach ($file in $expectedFiles) {
            $hasCopyright = Test-CopyrightHeader -BranchName $branchName -FilePath $file
            Write-Check -Name "Copyright header present ($file)" -Passed $hasCopyright

            if (-not $hasCopyright) {
                $issues += "Missing Microsoft copyright header in $file"
                $allPassed = $false
            }
        }
    }

    # Check 7: Localization check
    $locIssues = Test-Localization -BranchName $branchName
    if ($locIssues.Count -gt 0) {
        Write-Check -Name "Localization check" -Passed $true -Warning `
            -Details "$($locIssues.Count) strings may need nls.localize()"
        $warnings += "Potential unlocalized strings found"
    } else {
        Write-Check -Name "Localization check" -Passed $true
    }

    # Check 8: Commit messages
    $commitIssues = Test-CommitMessages -BranchName $branchName
    $cleanCommits = $commitIssues.Count -eq 0

    Write-Check -Name "Commit messages quality" -Passed $cleanCommits

    if (-not $cleanCommits) {
        foreach ($bad in $commitIssues) {
            Write-Host "      [WARN]  Bad commit: $bad" -ForegroundColor Yellow
        }
        $warnings += "Unprofessional commit messages"
    }

    # Check 9: Dependencies merged (if applicable)
    if ($PRConfig.DependsOn) {
        foreach ($dep in $PRConfig.DependsOn) {
            # Check if dependency branch is merged to main
            $merged = git branch -r --merged main 2>$null | Where-Object { $_ -match $dep }
            # For now, just warn about dependencies
            Write-Check -Name "Dependency: $dep" -Passed $true -Warning `
                -Details "Ensure this is merged before creating PR"
        }
    }

    return @{
        Passed = $allPassed
        Issues = $issues
        Warnings = $warnings
        Stats = $stats
    }
}

function Test-Compilation {
    Write-Host "`n  Compiling TypeScript..." -ForegroundColor Cyan

    $startTime = Get-Date
    $result = npm run compile 2>&1
    $exitCode = $LASTEXITCODE
    $duration = (Get-Date) - $startTime

    $passed = $exitCode -eq 0

    Write-Check -Name "TypeScript compilation" -Passed $passed `
        -Details "Completed in $([math]::Round($duration.TotalSeconds, 1))s"

    if (-not $passed) {
        # Show first few errors
        $errors = $result | Select-String -Pattern "error TS\d+" | Select-Object -First 5
        foreach ($err in $errors) {
            Write-Host "      $($err.Line)" -ForegroundColor Red
        }
    }

    return $passed
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Write-Header "PR BRANCH VERIFICATION"

# Determine which branches to verify
$config = Get-PRConfig
$branchesToVerify = @()

if ($Branch) {
    # Specific branch
    $prConfig = Get-PRByBranch -BranchName $Branch
    if ($prConfig) {
        $branchesToVerify += $prConfig
    } else {
        Write-Host "  Branch '$Branch' not found in configuration" -ForegroundColor Red
        exit 1
    }
} elseif ($Phase -gt 0) {
    # Phase-specific
    $branchesToVerify = Get-PRsByPhase -Phase $Phase
} else {
    # All branches
    $branchesToVerify = $config.PRs
}

if ($branchesToVerify.Count -eq 0) {
    Write-Host "  No branches to verify" -ForegroundColor Yellow
    exit 0
}

Write-Host "  Verifying $($branchesToVerify.Count) branch(es)...`n" -ForegroundColor White

$results = @{}
$totalPassed = 0
$totalFailed = 0
$counter = 0

# Verify each branch
foreach ($pr in $branchesToVerify) {
    $counter++
    Write-BranchHeader -BranchName $pr.Branch -Current $counter -Total $branchesToVerify.Count

    $result = Invoke-BranchVerification -PRConfig $pr
    $results[$pr.Branch] = $result

    if ($result.Passed) {
        $totalPassed++
        Write-Host "`n  [OK] Branch PASSED" -ForegroundColor Green
    } else {
        $totalFailed++
        Write-Host "`n  [FAIL] Branch FAILED" -ForegroundColor Red

        foreach ($issue in $result.Issues) {
            Write-Host "     - $issue" -ForegroundColor Red
        }

        if ($StopOnError) {
            Write-Host "`n  Stopping due to -StopOnError flag" -ForegroundColor Yellow
            break
        }
    }

    if ($result.Warnings.Count -gt 0) {
        Write-Host "  [WARN] Warnings:" -ForegroundColor Yellow
        foreach ($warning in $result.Warnings) {
            Write-Host "     - $warning" -ForegroundColor Yellow
        }
    }
}

# Compilation check (once, at the end)
if (-not $SkipCompile) {
    Write-Host "`n+$('-' * 58)+" -ForegroundColor Cyan
    Write-Host "| " -ForegroundColor Cyan -NoNewline
    Write-Host "BUILD VERIFICATION".PadRight(57) -ForegroundColor White -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    Write-Host "+$('-' * 58)+" -ForegroundColor Cyan

    $compilePassed = Test-Compilation
    if (-not $compilePassed) {
        $totalFailed++
    }
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n$('-' * 60)" -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })
Write-Host "                        SUMMARY" -ForegroundColor White
Write-Host "$('-' * 60)" -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })

Write-Host "`n  Branches verified: $($branchesToVerify.Count)" -ForegroundColor White
Write-Host "  Passed: $totalPassed" -ForegroundColor Green
Write-Host "  Failed: $totalFailed" -ForegroundColor $(if ($totalFailed -gt 0) { "Red" } else { "White" })

if ($totalFailed -eq 0) {
    Write-Host @"

    [OK] ALL VERIFICATIONS PASSED

  Next steps:
    - Run .\Create-PRs.ps1 to create pull requests

"@ -ForegroundColor Green
} else {
    Write-Host @"

    [FAIL] SOME VERIFICATIONS FAILED

  Fix the issues above before creating PRs.
  Run with -Detailed for more information.

"@ -ForegroundColor Red
}

Write-Host "$('-' * 60)`n" -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })

# Return results for scripting
return @{
    AllPassed = ($totalFailed -eq 0)
    Results = $results
    TotalPassed = $totalPassed
    TotalFailed = $totalFailed
}
