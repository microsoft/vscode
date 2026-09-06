#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#---------------------------------------------------------------------------------------------

# Windows GitHub Copilot CLI bootstrapper
#
# Responsibilities:
#   1. Locate the real Copilot CLI binary (avoid recursion if this file shadows it).
#   2. Offer to install if missing (npm -g @github/copilot).
#   3. Enforce minimum version (>= REQUIRED_VERSION) with interactive update.
#   4. Execute the real binary with original arguments and exit with its status.
#
# NOTE: This file intentionally keeps logic self‑contained (no external deps) so it can be dropped into PATH directly.

# Minimum required Copilot CLI version
$RequiredVersion = "0.0.394"
$PackageName = "@github/copilot"

function Invoke-NpmGlobalCommand {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('install', 'update')][string]$Command,
        [Parameter(Mandatory = $true)][string]$Package
    )

    $npmArgs = @($Command, '-g', $Package)

    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) {
        & npm.cmd @npmArgs
    } else {
        & npm @npmArgs
    }
}

function Invoke-WingetInstall {
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $wingetCmd) {
        return $false
    }
    & winget install GitHub.Copilot
    return ($LASTEXITCODE -eq 0)
}

function Install-CopilotCLI {
    # Try npm first
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue }
    if ($npmCmd) {
        try {
            Invoke-NpmGlobalCommand -Command 'install' -Package $PackageName
            if ($LASTEXITCODE -eq 0) { return $true }
        } catch { }
    }
    # Fall back to winget
    Write-Host "npm is not available or installation failed. Trying winget..."
    if (Invoke-WingetInstall) { return $true }
    return $false
}

function Update-CopilotCLI {
    # Try npm first
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue }
    if ($npmCmd) {
        try {
            Invoke-NpmGlobalCommand -Command 'update' -Package $PackageName
            if ($LASTEXITCODE -eq 0) { return $true }
        } catch { }
    }
    # Fall back to winget
    Write-Host "npm is not available or update failed. Trying winget..."
    if (Invoke-WingetInstall) { return $true }
    return $false
}

function Find-RealCopilot {
    # Find the real copilot binary, avoiding this script if it's in PATH
    $CurrentScript = $MyInvocation.PSCommandPath
    if (-not $CurrentScript) { $CurrentScript = $PSCommandPath }
    $CopilotPath = (Get-Command copilot -ErrorAction SilentlyContinue).Source

    # Check if the copilot command would point to this script
    $CurrentScriptResolved = if ($CurrentScript) { (Resolve-Path $CurrentScript -ErrorAction SilentlyContinue).Path } else { $null }
    $CopilotPathResolved = if ($CopilotPath) { (Resolve-Path $CopilotPath -ErrorAction SilentlyContinue).Path } else { $null }

    if ($CurrentScript -eq $CopilotPath -or (Split-Path $CurrentScript -Parent) -eq (Split-Path $CopilotPath -Parent) -or ($CurrentScriptResolved -and $CopilotPathResolved -and $CurrentScriptResolved -eq $CopilotPathResolved)) {
        # The copilot in PATH is this script, find the real one by temporarily removing this script's directory from PATH
        $ScriptDir = Split-Path $CurrentScript -Parent
        $OldPath = $env:PATH
        # Use appropriate path delimiter based on OS
        $PathDelimiter = if ($IsWindows -or $env:OS -eq "Windows_NT") { ';' } else { ':' }
        $env:PATH = ($env:PATH -split $PathDelimiter | Where-Object { $_ -ne $ScriptDir }) -join $PathDelimiter
        $RealCopilot = (Get-Command copilot -ErrorAction SilentlyContinue).Source
        $env:PATH = $OldPath

        if ($RealCopilot -and (Test-Path $RealCopilot)) {
            return $RealCopilot
        } else {
            return $null
        }
    } else {
        # The copilot in PATH is different from this script, use it
        if ($CopilotPath -and (Test-Path $CopilotPath)) {
            return $CopilotPath
        } else {
            return $null
        }
    }
}

function Test-VersionCompatibility {
    param([string]$Version)
    $cleanInstalled = $Version -replace '^v',''
    $cleanRequired = $RequiredVersion -replace '^v',''
    try {
        $installedVer = [version]$cleanInstalled
        $requiredVer = [version]$cleanRequired
    } catch {
        return $false
    }
    return ($installedVer -ge $requiredVer)
}

function Test-AndLaunchCopilot {
    param([string[]]$Arguments)

    # Check if real copilot command exists
    $realCopilot = Find-RealCopilot
    if (-not $realCopilot) {
        Write-Host "Cannot find GitHub Copilot CLI (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)"
        $answer = Read-Host "Install GitHub Copilot CLI? (y/N)"
        if ($answer -eq "y" -or $answer -eq "Y") {
            if (Install-CopilotCLI) {
                Test-AndLaunchCopilot $Arguments
                return
            } else {
                Read-Host "Installation failed. Please install manually (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)."
                return
            }
        } else {
            exit 0
        }
    }

    # Check version compatibility
    $realCopilot = Find-RealCopilot
    if (-not $realCopilot) {
        Write-Host "Error: Unable to find copilot binary."
        $answer = Read-Host "Would you like to reinstall GitHub Copilot CLI? (y/N)"
        if ($answer -eq "y" -or $answer -eq "Y") {
            Write-Host "Reinstalling GitHub Copilot CLI..."
            if (Install-CopilotCLI) {
                Test-AndLaunchCopilot $Arguments
                return
            } else {
                Read-Host "Reinstallation failed. Please install manually (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)."
                return
            }
        } else {
            exit 0
        }
    }

    try {
        $versionOutput = & $realCopilot --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed"
        }
    } catch {
        # Write-Host "Error: Unable to check copilot version."
        $answer = Read-Host "Would you like to reinstall GitHub Copilot CLI? (y/N)"
        if ($answer -eq "y" -or $answer -eq "Y") {
            if (Install-CopilotCLI) {
                Test-AndLaunchCopilot $Arguments
                return
            } else {
                Read-Host "Reinstallation failed. Please install manually (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)."
                return
            }
        } else {
            exit 0
        }
    }

    # Extract version number from output (search through all lines)
    $version = $null
    if ($versionOutput) {
        foreach ($line in ($versionOutput -split "`n")) {
            $trimmedLine = $line.Trim()
            if ($trimmedLine -match '[0-9]+\.[0-9]+\.[0-9]+') {
                $version = $matches[0]
                break
            }
        }
    }

    # Command succeeded - assume CLI is installed even if we can't parse the version

    # Only check version compatibility if we have a valid version
    if ($version -and -not (Test-VersionCompatibility $version)) {
        Write-Host "GitHub Copilot CLI version $version is not compatible."
        Write-Host "Version $RequiredVersion or later is required."
        $answer = Read-Host "Update GitHub Copilot CLI? (y/N)"
        if ($answer -eq "y" -or $answer -eq "Y") {
            if (Update-CopilotCLI) {
                Test-AndLaunchCopilot $Arguments
                return
            } else {
                Read-Host "Update failed. Please update manually (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)."
                return
            }
        } else {
            exit 0
        }
    }

    # All checks passed, execute the real copilot binary
    $realCopilot = Find-RealCopilot
    if ($realCopilot -and (Test-Path $realCopilot)) {
        & $realCopilot @Arguments
    } else {
        Write-Host "Error: Could not find the real GitHub Copilot CLI binary"
        Read-Host "Please ensure it's properly installed (https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)"
        return
    }
}

# Start the check and launch process
$finalArgs = $args
# Handle --clear argument
if ($args.Length -gt 0 -and $args[0] -eq '--clear') {
    Clear-Host
    $finalArgs = $args[1..($args.Length - 1)]
}

Test-AndLaunchCopilot $finalArgs