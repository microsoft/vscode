param(
	[Parameter(Mandatory = $true)]
	[int]$RootProcessId,

	[Parameter(Mandatory = $true)]
	[string]$ExitMarker,

	[Parameter(Mandatory = $true)]
	[string]$StopMarker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$trackedProcessIds = [System.Collections.Generic.HashSet[int]]::new()
[void]$trackedProcessIds.Add($RootProcessId)

while ($true) {
	$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
	do {
		$changed = $false
		foreach ($process in $processes) {
			if (-not $trackedProcessIds.Contains([int]$process.ProcessId) -and $trackedProcessIds.Contains([int]$process.ParentProcessId)) {
				[void]$trackedProcessIds.Add([int]$process.ProcessId)
				$changed = $true
			}
		}
	} while ($changed)

	$runningProcessIds = [System.Collections.Generic.HashSet[int]]::new()
	foreach ($process in $processes) {
		[void]$runningProcessIds.Add([int]$process.ProcessId)
	}

	if (Test-Path -LiteralPath $StopMarker) {
		foreach ($processId in $trackedProcessIds) {
			if ($runningProcessIds.Contains($processId)) {
				Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
			}
		}
	}

	$hasRunningProcesses = $false
	foreach ($processId in $trackedProcessIds) {
		if ($runningProcessIds.Contains($processId)) {
			$hasRunningProcesses = $true
			break
		}
	}
	if (-not $hasRunningProcesses) {
		New-Item -ItemType File -Force -Path $ExitMarker | Out-Null
		exit 0
	}

	Start-Sleep -Milliseconds 250
}
