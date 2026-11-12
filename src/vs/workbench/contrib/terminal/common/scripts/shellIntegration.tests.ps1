# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
#
# Manual validation tests for shellIntegration.ps1 error handling.
# Run with: Invoke-Pester ./shellIntegration.tests.ps1
# Or without Pester: pwsh -File ./shellIntegration.tests.ps1
#
# These tests validate that the Prompt() function and PSConsoleHostReadLine wrapper
# handle errors gracefully without breaking the OSC 633 sequence flow.

$ErrorActionPreference = 'Stop'
$script:TestsPassed = 0
$script:TestsFailed = 0

function Assert-Contains {
	param([string]$Haystack, [string]$Needle, [string]$Message)
	if ($Haystack.Contains($Needle)) {
		$script:TestsPassed++
		Write-Host "  PASS: $Message" -ForegroundColor Green
	} else {
		$script:TestsFailed++
		Write-Host "  FAIL: $Message" -ForegroundColor Red
		Write-Host "    Expected to contain: $Needle" -ForegroundColor Yellow
		Write-Host "    Got: $($Haystack.Substring(0, [Math]::Min(200, $Haystack.Length)))" -ForegroundColor Yellow
	}
}

function Assert-Equal {
	param($Expected, $Actual, [string]$Message)
	if ($Expected -eq $Actual) {
		$script:TestsPassed++
		Write-Host "  PASS: $Message" -ForegroundColor Green
	} else {
		$script:TestsFailed++
		Write-Host "  FAIL: $Message" -ForegroundColor Red
		Write-Host "    Expected: $Expected" -ForegroundColor Yellow
		Write-Host "    Got: $Actual" -ForegroundColor Yellow
	}
}

# Load shellIntegration.ps1 in a fresh scope
$scriptPath = Join-Path $PSScriptRoot 'shellIntegration.ps1'
if (-not (Test-Path $scriptPath)) {
	Write-Host "ERROR: shellIntegration.ps1 not found at $scriptPath" -ForegroundColor Red
	exit 1
}

Write-Host "`nShell Integration Robustness Tests" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# --- Test 1: OriginalPrompt.Invoke() error handling ---
Write-Host "`nTest Suite: Prompt() error handling" -ForegroundColor White

# Simulate the state that shellIntegration.ps1 creates
$Global:__VSCodeState = @{
	OriginalPrompt = { throw "Simulated Starship crash" }
	LastHistoryId = 5
	IsInExecution = $true
	HasPSReadLine = $true
	EnvVarsToReport = @()
	Nonce = 'test-nonce'
	IsStable = '1'
	IsA11yMode = $null
	IsWindows10 = $false
}

# Source the functions from shellIntegration.ps1
# We need to extract just the Prompt function and helper
. $scriptPath 2>$null

# Call the wrapped Prompt function
$promptResult = Prompt

Assert-Contains $promptResult "]633;B" "Prompt() emits 633;B even when OriginalPrompt throws"
Assert-Contains $promptResult "]633;D" "Prompt() emits 633;D (command finished)"
Assert-Contains $promptResult "]633;A" "Prompt() emits 633;A (prompt started)"
Assert-Contains $promptResult "PS> " "Prompt() uses fallback 'PS> ' when OriginalPrompt throws"

# --- Test 2: Normal prompt works ---
Write-Host "`nTest Suite: Prompt() normal operation" -ForegroundColor White

$Global:__VSCodeState.OriginalPrompt = { return "CustomPrompt> " }
$Global:__VSCodeState.IsInExecution = $true
$Global:__VSCodeState.LastHistoryId = 5

$promptResult = Prompt

Assert-Contains $promptResult "]633;B" "Prompt() emits 633;B with normal prompt"
Assert-Contains $promptResult "]633;A" "Prompt() emits 633;A with normal prompt"
Assert-Contains $promptResult "CustomPrompt> " "Prompt() includes custom prompt text"

# Verify IsInExecution was reset
Assert-Equal $false $Global:__VSCodeState.IsInExecution "IsInExecution reset to false after Prompt()"

# --- Test 3: $OriginalPrompt variable initialization ---
Write-Host "`nTest Suite: Variable initialization" -ForegroundColor White

$Global:__VSCodeState.OriginalPrompt = { return "" }
$Global:__VSCodeState.IsInExecution = $true
$Global:__VSCodeState.LastHistoryId = 5

$promptResult = Prompt

Assert-Contains $promptResult "]633;B" "Prompt() emits 633;B even with empty prompt string"

# --- Summary ---
Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "Results: $($script:TestsPassed) passed, $($script:TestsFailed) failed" -ForegroundColor $(if ($script:TestsFailed -eq 0) { 'Green' } else { 'Red' })

# Cleanup
Remove-Variable -Name __VSCodeState -Scope Global -ErrorAction SilentlyContinue

if ($script:TestsFailed -gt 0) { exit 1 }
