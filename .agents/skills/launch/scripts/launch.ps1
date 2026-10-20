# Launches Code OSS (VS Code from sources) with an isolated copy of a user-data-dir and unique
# debugger ports, and prints one JSON line once it is ready. The implementation is launch.ts; this
# wrapper finds a suitable Node.js and passes the arguments through. See ../SKILL.md for options.
#
# PowerShell drops an unquoted `--`; quote it to pass arguments to Code OSS: & launch.ps1 '--' --verbose
# Uses $args instead of a param block, so that `powershell -File launch.ps1 --repo ...` works too.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runNode.ps1')

$cliArgs = @($args | ForEach-Object { [string]$_ })
$repoForNode = (Get-Location).Path
for ($index = 0; $index -lt $cliArgs.Count - 1; $index++) {
	if ($cliArgs[$index] -eq '--') {
		break
	}
	if ($cliArgs[$index] -eq '--repo') {
		$repoForNode = $cliArgs[$index + 1]
	}
}
$node = Get-UsableNode $repoForNode

$result = Invoke-NodeScript $node (Join-Path $PSScriptRoot 'launch.ts') $cliArgs @{
	# Dev Drives (ReFS) copy much faster; Node cannot tell file systems apart, .NET can
	CODE_OSS_DEV_REFS_VOLUMES = (@([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady -and $_.DriveFormat -eq 'ReFS' } | ForEach-Object { $_.RootDirectory.FullName }) -join ';')
	# Copying is dominated by per-file overhead; more I/O threads keep the disk busy
	UV_THREADPOOL_SIZE = '32'
}
$result.Stdout
exit $result.ExitCode