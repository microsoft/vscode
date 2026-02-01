#!/usr/bin/env pwsh
# Installs npm dependencies for all VS Code extensions that need them
# This ensures all extensions have their node_modules before building

param(
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$extensionsDir = Join-Path $PSScriptRoot '..' 'extensions'

Write-Host "Installing extension dependencies..." -ForegroundColor Cyan

$extensionsToInstall = @()

# Find all extensions with package.json that have dependencies but no node_modules
Get-ChildItem -Path $extensionsDir -Directory | ForEach-Object {
    $extensionDir = $_.FullName
    $packageJsonPath = Join-Path $extensionDir 'package.json'
    
    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        $hasDeps = $packageJson.dependencies -or $packageJson.devDependencies
        $hasNodeModules = Test-Path (Join-Path $extensionDir 'node_modules')
        
        if ($hasDeps -and -not $hasNodeModules) {
            $extensionsToInstall += $_.Name
        }
    }
}

if ($extensionsToInstall.Count -eq 0) {
    Write-Host "✓ All extensions already have dependencies installed" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($extensionsToInstall.Count) extension(s) needing dependencies:" -ForegroundColor Yellow
$extensionsToInstall | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

$failed = @()
$succeeded = 0

foreach ($ext in $extensionsToInstall) {
    $extensionPath = Join-Path $extensionsDir $ext
    
    try {
        if ($Verbose) {
            Write-Host "Installing $ext..." -ForegroundColor Cyan
            Push-Location $extensionPath
            npm install
            Pop-Location
        } else {
            Write-Host "Installing $ext..." -NoNewline
            Push-Location $extensionPath
            npm install --silent 2>&1 | Out-Null
            Pop-Location
            Write-Host " ✓" -ForegroundColor Green
        }
        $succeeded++
    }
    catch {
        if (-not $Verbose) {
            Write-Host " ✗" -ForegroundColor Red
        }
        $failed += $ext
        Write-Warning "Failed to install dependencies for $ext : $_"
    }
}

Write-Host ""
Write-Host "Installation complete:" -ForegroundColor Cyan
Write-Host "  Succeeded: $succeeded" -ForegroundColor Green
if ($failed.Count -gt 0) {
    Write-Host "  Failed: $($failed.Count)" -ForegroundColor Red
    Write-Host "  Failed extensions: $($failed -join ', ')" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✓ All extension dependencies installed successfully" -ForegroundColor Green
    exit 0
}
