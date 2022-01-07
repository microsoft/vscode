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
  return "`e]133;D;$(__VSCode-Get-LastExitCode)`u{7}`e]133;A`u{7}`e]1337;CurrentDir=$(Get-Location)`u{7}$(Invoke-Command -ScriptBlock $Global:__VSCodeOriginalPrompt)`e]133;B`u{7}"
}

# TODO: Gracefully fallback when PSReadLine is not loaded
function Global:PSConsoleHostReadLine {
    [Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace, $ExecutionContext)
    # Write command executed sequence directly to Console to avoid the new line from Write-Host
    [Console]::Write("`e]133;C`u{7}")
}

Write-Output "`e]133;E`u{7}"
