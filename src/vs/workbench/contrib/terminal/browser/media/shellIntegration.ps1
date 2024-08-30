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

$isStable = $env:VSCODE_STABLE
$env:VSCODE_STABLE = $null

$osVersion = [System.Environment]::OSVersion.Version
$isWindows10 = $IsWindows -and $osVersion.Major -eq 10 -and $osVersion.Minor -eq 0 -and $osVersion.Build -lt 22000

if ($env:VSCODE_ENV_REPLACE) {
	$Split = $env:VSCODE_ENV_REPLACE.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=', 2)
		[Environment]::SetEnvironmentVariable($Inner[0], $Inner[1].Replace('\x3a', ':'))
	}
	$env:VSCODE_ENV_REPLACE = $null
}
if ($env:VSCODE_ENV_PREPEND) {
	$Split = $env:VSCODE_ENV_PREPEND.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=', 2)
		[Environment]::SetEnvironmentVariable($Inner[0], $Inner[1].Replace('\x3a', ':') + [Environment]::GetEnvironmentVariable($Inner[0]))
	}
	$env:VSCODE_ENV_PREPEND = $null
}
if ($env:VSCODE_ENV_APPEND) {
	$Split = $env:VSCODE_ENV_APPEND.Split(":")
	foreach ($Item in $Split) {
		$Inner = $Item.Split('=', 2)
		[Environment]::SetEnvironmentVariable($Inner[0], [Environment]::GetEnvironmentVariable($Inner[0]) + $Inner[1].Replace('\x3a', ':'))
	}
	$env:VSCODE_ENV_APPEND = $null
}

function Global:__VSCode-Escape-Value([string]$value) {
	# NOTE: In PowerShell v6.1+, this can be written `$value -replace '…', { … }` instead of `[regex]::Replace`.
	# Replace any non-alphanumeric characters.
	[regex]::Replace($value, "[$([char]0x00)-$([char]0x1f)\\\n;]", { param($match)
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
	$Result = ""
	# Skip finishing the command if the first command has not yet started
	if ($Global:__LastHistoryId -ne -1) {
		if ($LastHistoryEntry.Id -eq $Global:__LastHistoryId) {
			# Don't provide a command line or exit code if there was no history entry (eg. ctrl+c, enter on no command)
			$Result += "$([char]0x1b)]633;D`a"
		}
		else {
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
	$OriginalPrompt += $Global:__VSCodeOriginalPrompt.Invoke()
	$Result += $OriginalPrompt

	# Prompt
	# OSC 633 ; <Property>=<Value> ST
	if ($isStable -eq "0") {
		$Result += "$([char]0x1b)]633;P;Prompt=$(__VSCode-Escape-Value $OriginalPrompt)`a"
	}

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
		$CommandLine = $__VSCodeOriginalPSConsoleHostReadLine.Invoke()

		# Command line
		# OSC 633 ; E ; <CommandLine?> ; <Nonce?> ST
		$Result = "$([char]0x1b)]633;E;"
		$Result += $(__VSCode-Escape-Value $CommandLine)
		# Only send the nonce if the OS is not Windows 10 as it seems to echo to the terminal
		# sometimes
		if ($IsWindows10 -eq $false) {
			$Result += ";$Nonce"
		}
		$Result += "`a"

		# Command executed
		# OSC 633 ; C ST
		$Result += "$([char]0x1b)]633;C`a"

		# Write command executed sequence directly to Console to avoid the new line from Write-Host
		[Console]::Write($Result)

		$CommandLine
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

# Set ContinuationPrompt property
if ($isStable -eq "0") {
	$ContinuationPrompt = (Get-PSReadLineOption).ContinuationPrompt
	if ($ContinuationPrompt) {
		[Console]::Write("$([char]0x1b)]633;P;ContinuationPrompt=$(__VSCode-Escape-Value $ContinuationPrompt)`a")
	}
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

function Get-KeywordCompletionResult(
	$Keyword,
	$Description = $Keyword
) {
	[System.Management.Automation.CompletionResult]::new($Keyword, $Keyword, [System.Management.Automation.CompletionResultType]::Keyword, $Description)
}

function Set-MappedKeyHandlers {
	Set-MappedKeyHandler -Chord Ctrl+Spacebar -Sequence 'F12,a'
	Set-MappedKeyHandler -Chord Alt+Spacebar -Sequence 'F12,b'
	Set-MappedKeyHandler -Chord Shift+Enter -Sequence 'F12,c'
	Set-MappedKeyHandler -Chord Shift+End -Sequence 'F12,d'

	# Enable suggestions if the environment variable is set and Windows PowerShell is not being used
	# as APIs are not available to support this feature
	if ($env:VSCODE_SUGGEST -eq '1' -and $PSVersionTable.PSVersion -ge "7.0") {
		Remove-Item Env:VSCODE_SUGGEST

		# VS Code send completions request (may override Ctrl+Spacebar)
		Set-PSReadLineKeyHandler -Chord 'F12,e' -ScriptBlock {
			Send-Completions
		}

		# VS Code send global completions request
		Set-PSReadLineKeyHandler -Chord 'F12,f' -ScriptBlock {
			# Get commands, convert to string array to reduce the payload size and send as JSON
			$commands = @(
				[System.Management.Automation.CompletionCompleters]::CompleteCommand('')
				Get-KeywordCompletionResult -Keyword 'begin'
				Get-KeywordCompletionResult -Keyword 'break'
				Get-KeywordCompletionResult -Keyword 'catch' -Description "catch [[<error type>][',' <error type>]*] {<statement list>}"
				Get-KeywordCompletionResult -Keyword 'class' -Description @"
class <class-name> [: [<base-class>][,<interface-list>]] {
    [[<attribute>] [hidden] [static] <property-definition> ...]
    [<class-name>([<constructor-argument-list>])
      {<constructor-statement-list>} ...]
    [[<attribute>] [hidden] [static] <method-definition> ...]
}
"@
				Get-KeywordCompletionResult -Keyword 'clean'
				Get-KeywordCompletionResult -Keyword 'continue'
				Get-KeywordCompletionResult -Keyword 'data' -Description @"
data [<variable-name>] [-supportedCommand <cmdlet-name>] {
    <Permitted content>
}
"@
				Get-KeywordCompletionResult -Keyword 'do' -Description @"
do {<statement list>} while (<condition>)
do {<statement list>} until (<condition>)
"@
				Get-KeywordCompletionResult -Keyword 'dynamicparam' -Description "dynamicparam {<statement-list>}"
				Get-KeywordCompletionResult -Keyword 'else' -Description @"
if (<test1>)
    {<statement list 1>}
[elseif (<test2>)
    {<statement list 2>}]
[else
    {<statement list 3>}]
"@
				Get-KeywordCompletionResult -Keyword 'elseif' -Description @"
if (<test1>)
    {<statement list 1>}
[elseif (<test2>)
    {<statement list 2>}]
[else
    {<statement list 3>}]
"@
				Get-KeywordCompletionResult -Keyword 'end'
				Get-KeywordCompletionResult -Keyword 'enum' -Description @"
[[<attribute>]...] [Flag()] enum <enum-name>[ : <underlying-type-name>] {
    <label 0> [= 1]
    <label 1> [= 2]
    <label 2> [= 4]
    <label 3> [= 8]
    ...
}
"@
				Get-KeywordCompletionResult -Keyword 'exit' -Description "exit [<exitcode>]"
				Get-KeywordCompletionResult -Keyword 'filter' -Description "filter [<scope:>]<name> {<statement list>}"
				Get-KeywordCompletionResult -Keyword 'finally' -Description "finally {<statement list>}"
				Get-KeywordCompletionResult -Keyword 'for' -Description @"
for (<Init>; <Condition>; <Repeat>)
{
    <Statement list>
}
"@
				Get-KeywordCompletionResult -Keyword 'foreach' -Description "foreach ($<item> in $<collection>){<statement list>}"
				Get-KeywordCompletionResult -Keyword 'function' -Description @"
function [<scope:>]<name> [([type]`$parameter1[,[type]`$parameter2])]
{
  begin {<statement list>}
  process {<statement list>}
  end {<statement list>}
  clean {<statement list>}
}
"@
				Get-KeywordCompletionResult -Keyword 'hidden'
				Get-KeywordCompletionResult -Keyword 'if' -Description @"
if (<test1>)
	{<statement list 1>}
[elseif (<test2>)
	{<statement list 2>}]
[else
	{<statement list 3>}]
"@
				Get-KeywordCompletionResult -Keyword 'in' -Description "foreach (`$<item> in `$<collection>){<statement list>}"
				Get-KeywordCompletionResult -Keyword 'param' -Description "param (`$Parameter1)"
				Get-KeywordCompletionResult -Keyword 'process'
				Get-KeywordCompletionResult -Keyword 'return' -Description "return [<expression>]"
				Get-KeywordCompletionResult -Keyword 'static' -Description @"
class <class-name> [: [<base-class>][,<interface-list>]] {
    [[<attribute>] [hidden] [static] <property-definition> ...]
    [<class-name>([<constructor-argument-list>])
      {<constructor-statement-list>} ...]
    [[<attribute>] [hidden] [static] <method-definition> ...]
}
"@
				Get-KeywordCompletionResult -Keyword 'switch' -Description @"
Switch (<test-expression>)
{
    <result1-to-be-matched> {<action>}
    <result2-to-be-matched> {<action>}
}
"@
				Get-KeywordCompletionResult -Keyword 'throw' -Description "throw [<expression>]"
				Get-KeywordCompletionResult -Keyword 'trap' -Description "trap [[<error type>]] {<statement list>}"
				Get-KeywordCompletionResult -Keyword 'try' -Description "try {<statement list>}"
				Get-KeywordCompletionResult -Keyword 'until' -Description "do {<statement list>} until (<condition>)"
				Get-KeywordCompletionResult -Keyword 'using' -Description @"
using module <module-name>

using assembly <.NET-assembly-path>
"@
				Get-KeywordCompletionResult -Keyword 'while' -Description "while (<condition>){<statement list>}"
			)
			$mappedCommands = Compress-Completions($commands)
			$result = "$([char]0x1b)]633;CompletionsPwshCommands;commands;"
			$result += $mappedCommands | ConvertTo-Json -Compress
			$result += "`a"
			Write-Host -NoNewLine $result
		}

		Set-PSReadLineKeyHandler -Chord 'F12,g' -ScriptBlock {
			Import-Module "$PSScriptRoot\GitTabExpansion.psm1"
			Remove-PSReadLineKeyHandler -Chord 'F12,g'
		}
		Set-PSReadLineKeyHandler -Chord 'F12,h' -ScriptBlock {
			Import-Module "$PSScriptRoot\CodeTabExpansion.psm1"
			Remove-PSReadLineKeyHandler -Chord 'F12,h'
		}
	}
}

function Send-Completions {
	$commandLine = ""
	$cursorIndex = 0
	$prefixCursorDelta = 0
	[Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$commandLine, [ref]$cursorIndex)
	$completionPrefix = $commandLine

	# Start completions sequence
	$result = "$([char]0x1b)]633;Completions"

	# If there is a space in the input, defer to TabExpansion2 as it's more complicated to
	# determine what type of completions to use.
	# `[` is included here as namespace commands are not included in CompleteCommand(''),
	# additionally for some reason CompleteVariable('[') causes the prompt to clear and reprint
	# multiple times
	if ($completionPrefix.Contains(' ') -or $completionPrefix.Contains('[') -or $PSVersionTable.PSVersion -lt "6.0") {

		# Adjust the completion prefix and cursor index such that tab expansion will be requested
		# immediately after the last whitespace. This allows the client to perform fuzzy filtering
		# such that requesting completions in the middle of a word should show the same completions
		# as at the start. This only happens when the last word does not include special characters:
		# - `/` and `\`: Completions change when navigating directories.
		# - `$`: Completions change when variables.
		$lastWhitespaceIndex = $completionPrefix.LastIndexOf(' ')
		$lastWord = $completionPrefix.Substring($lastWhitespaceIndex + 1)
		if ($lastWord -notmatch '[/\\$]') {
			if ($lastWhitespaceIndex -ne -1 -and $lastWhitespaceIndex -lt $cursorIndex) {
				$newCursorIndex = $lastWhitespaceIndex + 1
				$completionPrefix = $completionPrefix.Substring(0, $newCursorIndex)
				$prefixCursorDelta = $cursorIndex - $newCursorIndex
				$cursorIndex = $newCursorIndex
			}
		}
		# If it contains `/` or `\`, get completions from the nearest `/` or `\` such that file
		# completions are consistent regardless of where it was requested
		elseif ($lastWord -match '[/\\]') {
			$lastSlashIndex = $completionPrefix.LastIndexOfAny(@('/', '\'))
			if ($lastSlashIndex -ne -1 -and $lastSlashIndex -lt $cursorIndex) {
				$newCursorIndex = $lastSlashIndex + 1
				$completionPrefix = $completionPrefix.Substring(0, $newCursorIndex)
				$prefixCursorDelta = $cursorIndex - $newCursorIndex
				$cursorIndex = $newCursorIndex
			}
		}

		# Get completions using TabExpansion2
		$completions = $null
		try
		{
			$completions = TabExpansion2 -inputScript $completionPrefix -cursorColumn $cursorIndex
		}
		catch
		{
			# TabExpansion2 may throw when there are no completions, in this case return an empty
			# list to prevent falling back to file path completions
		}
		if ($null -eq $completions -or $null -eq $completions.CompletionMatches) {
			$result += ";0;$($completionPrefix.Length);$($completionPrefix.Length);[]"
		} else {
			$result += ";$($completions.ReplacementIndex);$($completions.ReplacementLength + $prefixCursorDelta);$($cursorIndex - $prefixCursorDelta);"
			$json = [System.Collections.ArrayList]@($completions.CompletionMatches)
			# Relative directory completions
			if ($completions.CompletionMatches.Count -gt 0 -and $completions.CompletionMatches.Where({ $_.ResultType -eq 3 -or $_.ResultType -eq 4 })) {
				# Add `../ relative to the top completion
				$firstCompletion = $completions.CompletionMatches[0]
				if ($firstCompletion.CompletionText.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) {
					if ($completionPrefix -match "(\.\.\$([System.IO.Path]::DirectorySeparatorChar))+") {
						$parentDir = "$($matches[0])..$([System.IO.Path]::DirectorySeparatorChar)"
						$currentPath = Split-Path -Parent $firstCompletion.ToolTip
						try {
							$parentDirPath = Split-Path -Parent $currentPath
							$json.Add([System.Management.Automation.CompletionResult]::new(
								$parentDir, $parentDir, [System.Management.Automation.CompletionResultType]::ProviderContainer, $parentDirPath)
							)
						} catch { }
					}
				}
				# Add `.` and `..` to the completions list for results that only contain files and dirs
				else {
					$json.Add([System.Management.Automation.CompletionResult]::new(
						'.', '.', [System.Management.Automation.CompletionResultType]::ProviderContainer, (Get-Location).Path)
					)
					$json.Add([System.Management.Automation.CompletionResult]::new(
						'..', '..', [System.Management.Automation.CompletionResultType]::ProviderContainer, (Split-Path (Get-Location) -Parent))
					)
				}
			}
			# Add `-` and `+` as a completion for move backwards in location history. Unfortunately
			# we don't set the path it will navigate to since the Set-Location stack is not public
			# API https://github.com/PowerShell/PowerShell/issues/23860
			if ($completionPrefix -eq "cd -") {
				$json.Add([System.Management.Automation.CompletionResult]::new('-', '-', [System.Management.Automation.CompletionResultType]::ProviderContainer, "Navigate backwards in location history"))
			}
			if ($completionPrefix -eq "cd +") {
				$json.Add([System.Management.Automation.CompletionResult]::new('+', '+', [System.Management.Automation.CompletionResultType]::ProviderContainer, "Navigate forwards in location history"))
			}
			$mappedCommands = Compress-Completions($json)
			$result += $mappedCommands | ConvertTo-Json -Compress
		}
	}
	# If there is no space, get completions using CompletionCompleters as it gives us more
	# control and works on the empty string
	else {
		# If it contains `/` or `\`, get completions from the nearest `/` or `\` such that file
		# completions are consistent regardless of where it was requested
		if ($completionPrefix -match '[/\\]') {
			$lastSlashIndex = $completionPrefix.LastIndexOfAny(@('/', '\'))
			if ($lastSlashIndex -ne -1 -and $lastSlashIndex -lt $cursorIndex) {
				$newCursorIndex = $lastSlashIndex + 1
				$completionPrefix = $completionPrefix.Substring(0, $newCursorIndex)
				$prefixCursorDelta = $cursorIndex - $newCursorIndex
				$cursorIndex = $newCursorIndex
			}
		}
		# Note that CompleteCommand isn't included here as it's expensive
		$completions = $(
			# Add trailing \ for directories so behavior aligns with TabExpansion2
			[System.Management.Automation.CompletionCompleters]::CompleteFilename($completionPrefix) | ForEach-Object {
				if ($_.ResultType -eq [System.Management.Automation.CompletionResultType]::ProviderContainer) {
					[System.Management.Automation.CompletionResult]::new("$($_.CompletionText)$([System.IO.Path]::DirectorySeparatorChar)", "$($_.CompletionText)$([System.IO.Path]::DirectorySeparatorChar)", $_.ResultType, $_.ToolTip)
				} else {
					$_
				}
			}
			([System.Management.Automation.CompletionCompleters]::CompleteVariable(''))
		)
		if ($null -ne $completions) {
			$result += ";$($completions.ReplacementIndex);$($completions.ReplacementLength + $prefixCursorDelta);$($cursorIndex - $prefixCursorDelta);"
			$mappedCommands = Compress-Completions($completions)
			$result += $mappedCommands | ConvertTo-Json -Compress
		} else {
			$result += ";0;$($completionPrefix.Length);$($completionPrefix.Length);[]"
		}
	}

	# End completions sequence
	$result += "`a"

	Write-Host -NoNewLine $result
}

function Compress-Completions($completions) {
	$completions | ForEach-Object {
		if ($_.CustomIcon) {
			,@($_.CompletionText, $_.ResultType, $_.ToolTip, $_.CustomIcon)
		}
		elseif ($_.CompletionText -eq $_.ToolTip) {
			,@($_.CompletionText, $_.ResultType)
		} else {
			,@($_.CompletionText, $_.ResultType, $_.ToolTip)
		}
	}
}

# Register key handlers if PSReadLine is available
if (Get-Module -Name PSReadLine) {
	Set-MappedKeyHandlers
}
