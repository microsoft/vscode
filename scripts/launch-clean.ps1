# Launch Code OSS from sources with a throwaway profile and empty workspace.
# Usage:
#   .\scripts\launch-clean.ps1
#   .\scripts\launch-clean.ps1 -Agents
#   .\scripts\launch-clean.ps1 -Workspace C:\path\to\folder
#
# See build/custom/DEV-CLEAN-LAUNCH.md

param(
	[switch]$Agents,
	[string]$Workspace = '',
	[switch]$SkipPreLaunch
)

$ErrorActionPreference = 'Stop'

$Repo = Split-Path -Parent $PSScriptRoot
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunDir = Join-Path $env:TEMP "code-oss-clean-$Stamp"
$UserData = Join-Path $RunDir 'user-data'
$ExtDir = Join-Path $RunDir 'extensions'
$SharedData = Join-Path $RunDir 'shared-data'

if ([string]::IsNullOrWhiteSpace($Workspace)) {
	$Workspace = Join-Path $RunDir 'workspace'
}

New-Item -ItemType Directory -Force -Path $UserData, $ExtDir, $SharedData, $Workspace | Out-Null
if (-not (Test-Path (Join-Path $Workspace 'README.md'))) {
	@'
# Clean test workspace

Empty folder for BYOK / DIAL / Agents smoke tests.
'@ | Set-Content -Path (Join-Path $Workspace 'README.md') -Encoding UTF8
}

$codeBat = Join-Path $Repo 'scripts\code.bat'
if (-not (Test-Path $codeBat)) {
	Write-Error "Not a VS Code repo root: $Repo"
}

$args = @(
	'--disable-extension=vscode.vscode-api-tests',
	"--user-data-dir=$UserData",
	"--extensions-dir=$ExtDir",
	"--shared-data-dir=$SharedData",
	'--use-inmemory-secretstorage',
	'--no-cached-data',
	'--skip-welcome',
	'--skip-release-notes',
	'--disable-telemetry',
	'--disable-features=CalculateNativeWinOcclusion'
)

if ($Agents) {
	$args = @('--agents') + $args
}

$args += $Workspace

if ($SkipPreLaunch) {
	$env:VSCODE_SKIP_PRELAUNCH = '1'
} else {
	Remove-Item Env:VSCODE_SKIP_PRELAUNCH -ErrorAction SilentlyContinue
}

Push-Location $Repo
try {
	$proc = Start-Process -FilePath $codeBat -ArgumentList $args -PassThru -WindowStyle Normal
} finally {
	Pop-Location
}

Start-Sleep -Seconds 4

$codeProcesses = @(Get-Process -Name 'Code - OSS' -ErrorAction SilentlyContinue)
$window = $codeProcesses | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1

$info = [ordered]@{
	pid = $proc.Id
	windowPid = $window.Id
	windowTitle = $window.MainWindowTitle
	runDir = $RunDir
	workspace = $Workspace
	userDataDir = $UserData
	extensionsDir = $ExtDir
	sharedDataDir = $SharedData
	agents = [bool]$Agents
	repo = $Repo
}

$infoPath = Join-Path $RunDir 'launch-info.json'
($info | ConvertTo-Json -Depth 3) | Set-Content -Path $infoPath -Encoding UTF8

Write-Host ''
Write-Host 'Code OSS clean launch' -ForegroundColor Cyan
Write-Host "  Window:    $($info.windowTitle)"
Write-Host "  Workspace: $Workspace"
Write-Host "  Profile:   $UserData"
Write-Host "  Run dir:   $RunDir"
Write-Host "  Info:      $infoPath"
Write-Host ''
Write-Host 'Doc: build/custom/DEV-CLEAN-LAUNCH.md'

if (-not $window) {
	Write-Warning 'Process started but no window title yet — check taskbar or wait a few seconds.'
}
