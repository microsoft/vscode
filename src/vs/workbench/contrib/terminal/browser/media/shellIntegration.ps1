# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

$Global:__VSCodeOriginalPrompt = $function:Prompt

function Global:__VSCode-Get-LastExitCode {
	if ($? -eq $True) {
		return 0
	}
	# TODO: Should we just return a string instead?
	return -1
}

function Global:Prompt() {
	# Command finished command line
	# OSC 633 ; A ; <CommandLine> ST
	$Result  = "`e]633;A;"
	# Sanitize the command line to ensure it can get transferred to the terminal and can be parsed
	# correctly. This isn't entirely safe but good for most cases, it's important for the Pt parameter
	# to only be composed of _printable_ characters as per the spec.
	# TODO: There are probably better serializable strings to use
	# TODO: This doesn't work for empty commands of ^C
	# TODO: Check ID against last to see if no command ran
	$CommandLine = $(Get-History -Count 1).CommandLine ?? ""
	$Result += $CommandLine.Replace("`n", "<LF>").Replace(";", "<CL>")
	$Result += "`a"
	# Command finished exit code
	# OSC 133 ; D ; <ExitCode> ST
	$Result += "`e]133;D;$(__VSCode-Get-LastExitCode)`a"
	# Prompt started
	# OSC 133 ; A ST
	$Result += "`e]133;A`a"
	# Current working directory
	# OSC 1337 ; CurrentDir=<CurrentDir> ST
	$Result += if($pwd.Provider.Name -eq 'FileSystem'){"`e]1337;CurrentDir=$($pwd.ProviderPath)`a"}
	# Write original prompt
	$Result += $Global:__VSCodeOriginalPrompt.Invoke()
	# Write command started
	$Result += "`e]133;B`a"
	return $Result
}

# TODO: Gracefully fallback when PSReadLine is not loaded
function Global:PSConsoleHostReadLine {
	[Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace, $ExecutionContext)
	# Write command executed sequence directly to Console to avoid the new line from Write-Host
	[Console]::Write("`e]133;C`u{7}")
}

# Set IsWindows property
[Console]::Write("`e]633;P;IsWindows=$($IsWindows)`a")
Write-Host "`e[1mShell integration activated!" -ForegroundColor Green
