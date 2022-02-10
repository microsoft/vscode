# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

param(
	[Parameter(HelpMessage="Hides the shell integration welcome message")]
	[switch] $HideWelcome = $False
)

$Global:__VSCodeOriginalPrompt = $function:Prompt

$Global:__LastHistoryId = -1

function Global:__VSCode-Get-LastExitCode {
	if ($? -eq $True) {
		return 0
	}
	# TODO: Should we just return a string instead?
	return -1
}

function Global:Prompt() {
	$LastHistoryEntry = $(Get-History -Count 1)
	if ($LastHistoryEntry.Id -eq $Global:__LastHistoryId) {
		# Don't provide a command line or exit code if there was no history entry (eg. ctrl+c, enter on no command)
		$Result  = "`e]633;A`a"
		$Result += "`e]133;D`a"
	} else {
		# Command finished command line
		# OSC 633 ; A ; <CommandLine?> ST
		$Result  = "`e]633;A;"
		# Sanitize the command line to ensure it can get transferred to the terminal and can be parsed
		# correctly. This isn't entirely safe but good for most cases, it's important for the Pt parameter
		# to only be composed of _printable_ characters as per the spec.
		$CommandLine = $LastHistoryEntry.CommandLine ?? ""
		$Result += $CommandLine.Replace("`n", "<LF>").Replace(";", "<CL>")
		$Result += "`a"
		# Command finished exit code
		# OSC 133 ; D ; <ExitCode?> ST
		$Result += "`e]133;D;$(__VSCode-Get-LastExitCode)`a"
	}
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
	$Global:__LastHistoryId = $LastHistoryEntry.Id
	return $Result
}

# TODO: Gracefully fallback when PSReadLine is not loaded
$__VSCodeOriginalPSConsoleHostReadLine = $function:PSConsoleHostReadLine
function Global:PSConsoleHostReadLine {
	$tmp = $__VSCodeOriginalPSConsoleHostReadLine.Invoke()
	# Write command executed sequence directly to Console to avoid the new line from Write-Host
	[Console]::Write("`e]133;C`a")
	$tmp
}

# Set IsWindows property
[Console]::Write("`e]633;P;IsWindows=$($IsWindows)`a")

# Show the welcome message
if ($HideWelcome -eq $False) {
	Write-Host "`e[1mShell integration activated!`e[0m" -ForegroundColor Green
}
