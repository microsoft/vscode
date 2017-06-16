# stop when there's an error
$ErrorActionPreference = 'Stop'

$env:HOME=$env:USERPROFILE

if (Test-Path env:AGENT_WORKFOLDER) {
	$env:USERPROFILE="${env:AGENT_WORKFOLDER}\home"
	$env:HOME="${env:USERPROFILE}"
	$env:npm_config_cache="${env:USERPROFILE}\npm-cache"
	New-Item -Path "$env:USERPROFILE" -Type directory -Force | out-null
	New-Item -Path "$env:npm_config_cache" -Type directory -Force | out-null
}

# throw when a process exits with something other than 0
function exec([scriptblock]$cmd, [string]$errorMessage = "Error executing command: " + $cmd) {
	& $cmd
	if ($LastExitCode -ne 0) {
		throw $errorMessage
	}
}

$Summary = @()
function step($Task, $Step) {
	echo ""
	echo "*****************************************************************************"
	echo "Start: $Task"
	echo "*****************************************************************************"
	echo ""

	$Stopwatch = [Diagnostics.Stopwatch]::StartNew()
	Invoke-Command $Step
	$Stopwatch.Stop()
	$Formatted = "{0:g}" -f $Stopwatch.Elapsed

	echo "*****************************************************************************"
	echo "End: $Task, Total: $Formatted"
	echo "*****************************************************************************"

	$global:Summary += @{ "$Task" = $Formatted }
}

function done() {
	echo ""
	echo "Build Summary"
	echo "============="
	$global:Summary | Format-Table @{L="Task";E={$_.Name}}, @{L="Duration";E={$_.Value}}
}