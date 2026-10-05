[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$RunDir,

	[string]$PlaywrightSession = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'windows-process-arguments.ps1')

$RunDir = [IO.Path]::GetFullPath($RunDir)
if (-not (Test-Path -LiteralPath $RunDir -PathType Container)) {
	throw "Run directory does not exist: $RunDir"
}

$expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP 'code-oss-dev'))
if (-not $RunDir.StartsWith("$expectedRoot\", [StringComparison]::OrdinalIgnoreCase)) {
	throw "Refusing to clean a directory outside $expectedRoot`: $RunDir"
}

if (-not [string]::IsNullOrWhiteSpace($PlaywrightSession)) {
	try {
		& npx '@playwright/cli' "-s=$PlaywrightSession" close
		if ($LASTEXITCODE -ne 0) {
			[Console]::Error.WriteLine("[cleanup.ps1] WARNING: failed to close Playwright session $PlaywrightSession; continuing cleanup.")
		}
	} catch {
		[Console]::Error.WriteLine("[cleanup.ps1] WARNING: could not close Playwright session $PlaywrightSession; continuing cleanup: $($_.Exception.Message)")
	}
}

$userDataDir = Join-Path $RunDir 'user-data'
$userDataArgument = "--user-data-dir=$userDataDir"
$remainingProcesses = @()
for ($attempt = 0; $attempt -lt 5; $attempt++) {
	$remainingProcesses = @(
		Get-CimInstance Win32_Process |
			Where-Object {
				$commandLine = $_.CommandLine
				$_.Name -eq 'Code - OSS.exe' -and
				$null -ne $commandLine -and
				(Test-CommandLineHasArgument $commandLine $userDataArgument)
			}
	)
	if ($remainingProcesses.Count -eq 0) {
		break
	}
	foreach ($process in $remainingProcesses) {
		Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
	}
	Start-Sleep -Milliseconds 500
}

$remainingProcesses = @(
	Get-CimInstance Win32_Process |
		Where-Object {
			$commandLine = $_.CommandLine
			$_.Name -eq 'Code - OSS.exe' -and
			$null -ne $commandLine -and
			(Test-CommandLineHasArgument $commandLine $userDataArgument)
		}
)
if ($remainingProcesses.Count -gt 0) {
	$processIds = $remainingProcesses.ProcessId -join ', '
	throw "Code OSS processes still reference the run directory: $processIds"
}

for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $RunDir); $attempt++) {
	try {
		Remove-Item -LiteralPath $RunDir -Recurse -Force
	} catch {
		if ($attempt -eq 4) {
			throw
		}
		Start-Sleep -Milliseconds 500
	}
}

if (Test-Path -LiteralPath $RunDir) {
	throw "Failed to remove run directory: $RunDir"
}

[PSCustomObject]@{
	runDir = $RunDir
	removed = $true
} | ConvertTo-Json -Compress
