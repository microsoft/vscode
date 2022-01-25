# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

$Global:__VSCodeOriginalPrompt = (Get-Command Prompt).ScriptBlock

function Global:__VSCode-Get-LastExitCode {
  if ($? -eq $True) {
      return "0"
  }
	# TODO: Should we just return a string instead?
  return "-1"
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
	$Result += $(Get-History -Count 1).CommandLine.Replace("`n", "<LF>").Replace(";", "<CL>")
	$Result += "`u{7}"
	# Command finished exit code
	# OSC 133 ; D ; <ExitCode> ST
	$Result += "`e]133;D;$(__VSCode-Get-LastExitCode)`u{7}"
	# Prompt started
	# OSC 133 ; A ST
	$Result += "`e]133;A`u{7}"
	# Current working directory
	# OSC 1337 ; CurrentDir=<CurrentDir> ST
	$Result += "`e]1337;CurrentDir=$(Get-Location)`u{7}"
	# Write original prompt
	$Result += Invoke-Command -ScriptBlock $Global:__VSCodeOriginalPrompt
	# Write command started
	$Result += "`e]133;B`u{7}"
  return $Result
}

# TODO: Gracefully fallback when PSReadLine is not loaded
function Global:PSConsoleHostReadLine {
    [Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace, $ExecutionContext)
    # Write command executed sequence directly to Console to avoid the new line from Write-Host
    [Console]::Write("`e]133;C`u{7}")
}

# Set IsWindows property
Write-Output "`e]633;P;IsWindows=$($IsWindows)`u{7}"
Write-Host "Shell integration activated!" -ForegroundColor Green -NoNewline
