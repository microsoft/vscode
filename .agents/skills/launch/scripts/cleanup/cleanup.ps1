# Stops the Code OSS instance of a launch and removes its run directory. Reused run directories
# are kept unless -Remove is passed. The implementation is cleanup.ts; this wrapper finds a suitable
# Node.js and passes the arguments through.

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$RunDir,

	[string]$PlaywrightSession = '',

	[switch]$Remove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\runNode.ps1')

$arguments = @('--run-dir', $RunDir)
if (-not [string]::IsNullOrWhiteSpace($PlaywrightSession)) {
	$arguments += @('--playwright-session', $PlaywrightSession)
}
if ($Remove) {
	$arguments += '--remove'
}

$result = Invoke-NodeScript (Get-UsableNode (Get-Location).Path) (Join-Path $PSScriptRoot 'cleanup.ts') $arguments
$result.Stdout
if ($result.ExitCode -ne 0) {
	throw "Cleanup of $RunDir failed (exit code $($result.ExitCode))."
}