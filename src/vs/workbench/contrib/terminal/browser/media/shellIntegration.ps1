# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# Prevent installing more than once per session
if (Test-Path variable:global:__VSCodeOriginalPrompt) {
	return;
}

# Disable shell integration when the language mode is restricted
if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
	return;
}

$Global:__VSCodeOriginalPrompt = $function:Prompt

$Global:__LastHistoryId = -1

function Global:__VSCode-Escape-Value([string]$value) {
	# NOTE: In PowerShell v6.1+, this can be written `$value -replace '…', { … }` instead of `[regex]::Replace`.
	# Replace any non-alphanumeric characters.
	[regex]::Replace($value, '[^a-zA-Z0-9]', { param($match)
		# Backslashes must be doubled.
		if ($match.Value -eq '\') {
			'\\'
		} else {
			# Any other characters are encoded as their UTF-8 hex values.
			-Join (
				[System.Text.Encoding]::UTF8.GetBytes($match.Value)
				| ForEach-Object { '\x{0:x2}' -f $_ }
			)
		}
	})
}

function Global:Prompt() {
	$FakeCode = [int]!$global:?
	$LastHistoryEntry = Get-History -Count 1
	# Skip finishing the command if the first command has not yet started
	if ($Global:__LastHistoryId -ne -1) {
		if ($LastHistoryEntry.Id -eq $Global:__LastHistoryId) {
			# Don't provide a command line or exit code if there was no history entry (eg. ctrl+c, enter on no command)
			$Result  = "$([char]0x1b)]633;E`a"
			$Result += "$([char]0x1b)]633;D`a"
		} else {
			# Command finished command line
			# OSC 633 ; A ; <CommandLine?> ST
			$Result  = "$([char]0x1b)]633;E;"
			# Sanitize the command line to ensure it can get transferred to the terminal and can be parsed
			# correctly. This isn't entirely safe but good for most cases, it's important for the Pt parameter
			# to only be composed of _printable_ characters as per the spec.
			if ($LastHistoryEntry.CommandLine) {
				$CommandLine = $LastHistoryEntry.CommandLine
			} else {
				$CommandLine = ""
			}
			$Result += $(__VSCode-Escape-Value $CommandLine)
			$Result += "`a"
			# Command finished exit code
			# OSC 633 ; D [; <ExitCode>] ST
			$Result += "$([char]0x1b)]633;D;$FakeCode`a"
		}
	}
	# Prompt started
	# OSC 633 ; A ST
	$Result += "$([char]0x1b)]633;A`a"
	# Current working directory
	# OSC 633 ; <Property>=<Value> ST
	$Result += if($pwd.Provider.Name -eq 'FileSystem'){"$([char]0x1b)]633;P;Cwd=$(__VSCode-Escape-Value $pwd.ProviderPath)`a"}
	# Before running the original prompt, put $? back to what it was:
	if ($FakeCode -ne 0) {
		Write-Error "failure" -ea ignore
	}
	# Run the original prompt
	$Result += $Global:__VSCodeOriginalPrompt.Invoke()
	# Write command started
	$Result += "$([char]0x1b)]633;B`a"
	$Global:__LastHistoryId = $LastHistoryEntry.Id
	return $Result
}

# Only send the command executed sequence when PSReadLine is loaded, if not shell integration should
# still work thanks to the command line sequence
if (Get-Module -Name PSReadLine) {
	$__VSCodeOriginalPSConsoleHostReadLine = $function:PSConsoleHostReadLine
	function Global:PSConsoleHostReadLine {
		$tmp = $__VSCodeOriginalPSConsoleHostReadLine.Invoke()
		# Write command executed sequence directly to Console to avoid the new line from Write-Host
		[Console]::Write("$([char]0x1b)]633;C`a")
		$tmp
	}
}

# Set IsWindows property
[Console]::Write("$([char]0x1b)]633;P;IsWindows=$($IsWindows)`a")

# Set always on key handlers which map to default VS Code keybindings
function Set-MappedKeyHandler {
	param ([string[]] $Chord, [string[]]$Sequence)
	$Handler = $(Get-PSReadLineKeyHandler -Chord $Chord | Select-Object -First 1)
	if ($Handler) {
		Set-PSReadLineKeyHandler -Chord $Sequence -Function $Handler.Function
	}
}

function Set-MappedKeyHandlers {
	Set-MappedKeyHandler -Chord Ctrl+Spacebar -Sequence 'F12,a'
	Set-MappedKeyHandler -Chord Alt+Spacebar -Sequence 'F12,b'
	Set-MappedKeyHandler -Chord Shift+Enter -Sequence 'F12,c'
	Set-MappedKeyHandler -Chord Shift+End -Sequence 'F12,d'
}

Set-MappedKeyHandlers
