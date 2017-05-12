# stop when there's an error
$ErrorActionPreference = 'Stop'

# set agent specific npm cache
if (Test-Path env:AGENT_WORKFOLDER) {
	$env:npm_config_cache = "${env:AGENT_WORKFOLDER}\npm-cache"
}

# throw when a process exits with something other than 0
function exec([scriptblock]$cmd, [string]$errorMessage = "Error executing command: " + $cmd) {
	& $cmd
	if ($LastExitCode -ne 0) {
		throw $errorMessage
	}
}

# log build step
function STEP() {
	Write-Host ""
	Write-Host "********************************************************************************"
	Write-Host "*** $args"
	Write-Host "********************************************************************************"
	Write-Host ""
}
