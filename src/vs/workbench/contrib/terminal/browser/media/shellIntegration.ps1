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

# Store the nonce in script scope and unset the global
$Nonce = $env:VSCODE_NONCE
$env:VSCODE_NONCE = $null

if ($env:VSCODE_ENV_REPLACE) {
	$Split = $env:VSCODE_ENV_REPLACE.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=')
		[Environment]::SetEnvironmentVariable($Inner[0], $Inner[1].Replace('\x3a', ':'))
	}
	$env:VSCODE_ENV_REPLACE = $null
}
if ($env:VSCODE_ENV_PREPEND) {
	$Split = $env:VSCODE_ENV_PREPEND.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=')
		[Environment]::SetEnvironmentVariable($Inner[0], $Inner[1].Replace('\x3a', ':') + [Environment]::GetEnvironmentVariable($Inner[0]))
	}
	$env:VSCODE_ENV_PREPEND = $null
}
if ($env:VSCODE_ENV_APPEND) {
	$Split = $env:VSCODE_ENV_APPEND.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=')
		[Environment]::SetEnvironmentVariable($Inner[0], [Environment]::GetEnvironmentVariable($Inner[0]) + $Inner[1].Replace('\x3a', ':'))
	}
	$env:VSCODE_ENV_APPEND = $null
}

function Global:__VSCode-Escape-Value([string]$value) {
	# NOTE: In PowerShell v6.1+, this can be written `$value -replace '…', { … }` instead of `[regex]::Replace`.
	# Replace any non-alphanumeric characters.
	[regex]::Replace($value, '[\\\n;]', { param($match)
			# Encode the (ascii) matches as `\x<hex>`
			-Join (
				[System.Text.Encoding]::UTF8.GetBytes($match.Value) | ForEach-Object { '\x{0:x2}' -f $_ }
			)
		})
}

function Global:Prompt() {
	$FakeCode = [int]!$global:?
	# NOTE: We disable strict mode for the scope of this function because it unhelpfully throws an
	# error when $LastHistoryEntry is null, and is not otherwise useful.
	Set-StrictMode -Off
	$LastHistoryEntry = Get-History -Count 1
	# Skip finishing the command if the first command has not yet started
	if ($Global:__LastHistoryId -ne -1) {
		if ($LastHistoryEntry.Id -eq $Global:__LastHistoryId) {
			# Don't provide a command line or exit code if there was no history entry (eg. ctrl+c, enter on no command)
			$Result = "$([char]0x1b)]633;E`a"
			$Result += "$([char]0x1b)]633;D`a"
		}
		else {
			# Command finished command line
			# OSC 633 ; E ; <CommandLine?> ; <Nonce?> ST
			$Result = "$([char]0x1b)]633;E;"
			# Sanitize the command line to ensure it can get transferred to the terminal and can be parsed
			# correctly. This isn't entirely safe but good for most cases, it's important for the Pt parameter
			# to only be composed of _printable_ characters as per the spec.
			if ($LastHistoryEntry.CommandLine) {
				$CommandLine = $LastHistoryEntry.CommandLine
			}
			else {
				$CommandLine = ""
			}
			$Result += $(__VSCode-Escape-Value $CommandLine)
			$Result += ";$Nonce"
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
	$Result += if ($pwd.Provider.Name -eq 'FileSystem') { "$([char]0x1b)]633;P;Cwd=$(__VSCode-Escape-Value $pwd.ProviderPath)`a" }
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
if ($PSVersionTable.PSVersion -lt "6.0") {
	# Windows PowerShell is only available on Windows
	[Console]::Write("$([char]0x1b)]633;P;IsWindows=$true`a")
}
else {
	[Console]::Write("$([char]0x1b)]633;P;IsWindows=$IsWindows`a")
}

# Set always on key handlers which map to default VS Code keybindings
function Set-MappedKeyHandler {
	param ([string[]] $Chord, [string[]]$Sequence)
	try {
		$Handler = Get-PSReadLineKeyHandler -Chord $Chord | Select-Object -First 1
	}
 catch [System.Management.Automation.ParameterBindingException] {
		# PowerShell 5.1 ships with PSReadLine 2.0.0 which does not have -Chord,
		# so we check what's bound and filter it.
		$Handler = Get-PSReadLineKeyHandler -Bound | Where-Object -FilterScript { $_.Key -eq $Chord } | Select-Object -First 1
	}
	if ($Handler) {
		Set-PSReadLineKeyHandler -Chord $Sequence -Function $Handler.Function
	}
}

$Global:__VSCodeHaltCompletions = $false
function Set-MappedKeyHandlers {
	Set-MappedKeyHandler -Chord Ctrl+Spacebar -Sequence 'F12,a'
	Set-MappedKeyHandler -Chord Alt+Spacebar -Sequence 'F12,b'
	Set-MappedKeyHandler -Chord Shift+Enter -Sequence 'F12,c'
	Set-MappedKeyHandler -Chord Shift+End -Sequence 'F12,d'

	# Conditionally enable suggestions
	if ($env:VSCODE_SUGGEST -eq '1') {
		Remove-Item Env:VSCODE_SUGGEST

		# VS Code send completions request (may override Ctrl+Spacebar)
		Set-PSReadLineKeyHandler -Chord 'F12,e' -ScriptBlock {
			Send-Completions
		}

		# Suggest trigger characters
		Set-PSReadLineKeyHandler -Chord "-" -ScriptBlock {
			[Microsoft.PowerShell.PSConsoleReadLine]::Insert("-")
			if (!$Global:__VSCodeHaltCompletions) {
				Send-Completions
			}
		}

		Set-PSReadLineKeyHandler -Chord 'F12,y' -ScriptBlock {
			$Global:__VSCodeHaltCompletions = $true
		}

		Set-PSReadLineKeyHandler -Chord 'F12,z' -ScriptBlock {
			$Global:__VSCodeHaltCompletions = $false
		}
	}
}

function Send-Completions {
	$commandLine = ""
	$cursorIndex = 0
	# TODO: Since fuzzy matching exists, should completions be provided only for character after the
	#       last space and then filter on the client side? That would let you trigger ctrl+space
	#       anywhere on a word and have full completions available
	[Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$commandLine, [ref]$cursorIndex)
	$completionPrefix = $commandLine

	# Get completions
	$result = "`e]633;Completions"
	if ($completionPrefix.Length -gt 0) {
		# Get and send completions
		$completions = TabExpansion2 -inputScript $completionPrefix -cursorColumn $cursorIndex
		if ($null -ne $completions.CompletionMatches) {
			$result += ";$($completions.ReplacementIndex);$($completions.ReplacementLength);$($cursorIndex);"
			$result += $completions.CompletionMatches | ConvertTo-Json -Compress
		}
	}
	$result += "`a"

	Write-Host -NoNewLine $result
}

# Register key handlers if PSReadLine is available
if (Get-Module -Name PSReadLine) {
	Set-MappedKeyHandlers
}
