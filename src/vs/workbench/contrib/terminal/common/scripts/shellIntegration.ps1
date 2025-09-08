# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# PowerShell Shell Integration for VS Code Terminal
# This script provides enhanced output monitoring and command detection capabilities
# with improved robustness, error handling, and performance optimizations.

# Prevent installing more than once per session
if ($Global:__VSCodeState.OriginalPrompt -ne $null) {
	return;
}

# Disable shell integration when the language mode is restricted
if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
	return;
}

$Global:__VSCodeState = @{
	OriginalPrompt = $function:Prompt
	LastHistoryId = -1
	IsInExecution = $false
	EnvVarsToReport = @()
	EnvVarsCache = @{}
	Nonce = $null
	IsStable = $null
	IsA11yMode = $null
	IsWindows10 = $false
	CommandStartTime = $null
	LastPromptCwd = $null
	PromptNestingLevel = 0
}

# Store the nonce in a regular variable and unset the environment variable. It's by design that
# anything that can execute PowerShell code can read the nonce, as it's basically impossible to hide
# in PowerShell. The most important thing is getting it out of the environment.
$Global:__VSCodeState.Nonce = $env:VSCODE_NONCE
$env:VSCODE_NONCE = $null

$Global:__VSCodeState.IsStable = $env:VSCODE_STABLE
$env:VSCODE_STABLE = $null

$Global:__VSCodeState.IsA11yMode = $env:VSCODE_A11Y_MODE
$env:VSCODE_A11Y_MODE = $null

$__vscode_shell_env_reporting = $env:VSCODE_SHELL_ENV_REPORTING
$env:VSCODE_SHELL_ENV_REPORTING = $null
if ($__vscode_shell_env_reporting) {
	$Global:__VSCodeState.EnvVarsToReport = $__vscode_shell_env_reporting.Split(',')
}
Remove-Variable -Name __vscode_shell_env_reporting -ErrorAction SilentlyContinue

$osVersion = [System.Environment]::OSVersion.Version
$Global:__VSCodeState.IsWindows10 = $IsWindows -and $osVersion.Major -eq 10 -and $osVersion.Minor -eq 0 -and $osVersion.Build -lt 22000
Remove-Variable -Name osVersion -ErrorAction SilentlyContinue

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

# Register Python shell activate hooks
# Prevent multiple activation with guard
if (-not $env:VSCODE_PYTHON_AUTOACTIVATE_GUARD) {
	$env:VSCODE_PYTHON_AUTOACTIVATE_GUARD = '1'
	if ($env:VSCODE_PYTHON_PWSH_ACTIVATE -and $env:TERM_PROGRAM -eq 'vscode') {
		$activateScript = $env:VSCODE_PYTHON_PWSH_ACTIVATE
		Remove-Item Env:VSCODE_PYTHON_PWSH_ACTIVATE

		try {
			Invoke-Expression $activateScript
		}
		catch {
			$activationError = $_
			Write-Host "`e[0m`e[7m * `e[0;103m VS Code Python powershell activation failed with exit code $($activationError.Exception.Message) `e[0m"
		}
	}
}

function Global:__VSCode-Escape-Value([string]$value) {
	# Enhanced escape function with better error handling and null safety
	if (-not $value) {
		return ""
	}
	
	try {
		# NOTE: In PowerShell v6.1+, this can be written `$value -replace '…', { … }` instead of `[regex]::Replace`.
		# Replace any non-alphanumeric characters with proper encoding.
		[regex]::Replace($value, "[$([char]0x00)-$([char]0x1f)\\\n;]", { param($match)
				# Encode the (ascii) matches as `\x<hex>`
				-Join (
					[System.Text.Encoding]::UTF8.GetBytes($match.Value) | ForEach-Object { '\x{0:x2}' -f $_ }
				)
			})
	}
	catch {
		# Fallback for any encoding issues - strip problematic characters
		$value -replace '[\x00-\x1f\\;]', ''
	}
}

function Global:__VSCode-Build-OSC-Sequence([string]$command, [string[]]$parameters = @()) {
	# Efficiently build OSC (Operating System Command) sequences for VS Code shell integration
	# Uses StringBuilder for better performance with longer sequences
	$sequence = [System.Text.StringBuilder]::new()
	[void]$sequence.Append("$([char]0x1b)]633;$command")
	
	foreach ($param in $parameters) {
		if ($param) {
			[void]$sequence.Append(";$param")
		}
	}
	
	[void]$sequence.Append("`a")
	return $sequence.ToString()
}

function Global:__VSCode-Update-Environment-Cache() {
	# Enhanced environment variable tracking with differential change detection
	# Only sends environment updates when variables actually change, reducing overhead
	if ($Global:__VSCodeState.EnvVarsToReport.Count -eq 0) {
		return ""
	}
	
	try {
		$result = ""
		$hasChanges = $false
		$currentEnvMap = @{}
		
		# Build current environment state
		foreach ($varName in $Global:__VSCodeState.EnvVarsToReport) {
			if (Test-Path "env:$varName") {
				$currentEnvMap[$varName] = (Get-Item "env:$varName").Value
			} else {
				$currentEnvMap[$varName] = $null
			}
		}
		
		# Compare with cached state and detect changes
		foreach ($varName in $Global:__VSCodeState.EnvVarsToReport) {
			$currentValue = $currentEnvMap[$varName]
			$cachedValue = $Global:__VSCodeState.EnvVarsCache[$varName]
			
			if ($currentValue -ne $cachedValue) {
				$Global:__VSCodeState.EnvVarsCache[$varName] = $currentValue
				$hasChanges = $true
			}
		}
		
		# Only send full environment if there are changes or this is the first time
		if ($hasChanges -or $Global:__VSCodeState.EnvVarsCache.Count -eq 0) {
			$envJson = $currentEnvMap | ConvertTo-Json -Compress
			$result = (__VSCode-Build-OSC-Sequence "EnvJson" @((__VSCode-Escape-Value $envJson), $Global:__VSCodeState.Nonce))
		}
		
		return $result
	}
	catch {
		# Fallback to simple environment reporting on any error
		try {
			$envMap = @{}
			foreach ($varName in $Global:__VSCodeState.EnvVarsToReport) {
				if (Test-Path "env:$varName") {
					$envMap[$varName] = (Get-Item "env:$varName").Value
				}
			}
			$envJson = $envMap | ConvertTo-Json -Compress
			return (__VSCode-Build-OSC-Sequence "EnvJson" @((__VSCode-Escape-Value $envJson), $Global:__VSCodeState.Nonce))
		}
		catch {
			return ""
		}
	}
}

function Global:Prompt() {
	# Increment nesting level to detect recursive prompts
	$Global:__VSCodeState.PromptNestingLevel++
	
	try {
		$FakeCode = [int]!$global:?
		# NOTE: We disable strict mode for the scope of this function because it unhelpfully throws an
		# error when $LastHistoryEntry is null, and is not otherwise useful.
		Set-StrictMode -Off
		
		# Initialize result as StringBuilder for better performance
		$result = [System.Text.StringBuilder]::new()
		
		# Get history with error handling
		$LastHistoryEntry = $null
		try {
			$LastHistoryEntry = Get-History -Count 1 -ErrorAction SilentlyContinue
		}
		catch {
			# Continue without history if there's an error
		}
		
		# Skip finishing the command if the first command has not yet started or an execution has not
		# yet begun
		if ($Global:__VSCodeState.LastHistoryId -ne -1 -and ($Global:__VSCodeState.HasPSReadLine -eq $false -or $Global:__VSCodeState.IsInExecution -eq $true)) {
			$Global:__VSCodeState.IsInExecution = $false
			
			if ($null -eq $LastHistoryEntry -or $LastHistoryEntry.Id -eq $Global:__VSCodeState.LastHistoryId) {
				# Don't provide a command line or exit code if there was no history entry (eg. ctrl+c, enter on no command)
				[void]$result.Append((__VSCode-Build-OSC-Sequence "D"))
			}
			else {
				# Command finished exit code
				[void]$result.Append((__VSCode-Build-OSC-Sequence "D" @($FakeCode)))
			}
		}
		
		# Prompt started
		[void]$result.Append((__VSCode-Build-OSC-Sequence "A"))
		
		# Current working directory - only send if changed to reduce overhead
		if ($pwd.Provider.Name -eq 'FileSystem') {
			$currentCwd = $pwd.ProviderPath
			if ($currentCwd -ne $Global:__VSCodeState.LastPromptCwd) {
				$Global:__VSCodeState.LastPromptCwd = $currentCwd
				[void]$result.Append((__VSCode-Build-OSC-Sequence "P" @("Cwd=$(__VSCode-Escape-Value $currentCwd)")))
			}
		}
		
		# Send current environment variables with change detection
		$envResult = __VSCode-Update-Environment-Cache
		if ($envResult) {
			[void]$result.Append($envResult)
		}
		
		# Before running the original prompt, put $? back to what it was:
		if ($FakeCode -ne 0) {
			Write-Error "failure" -ea ignore
		}
		
		# Run the original prompt with error handling
		$OriginalPrompt = ""
		try {
			$OriginalPrompt = $Global:__VSCodeState.OriginalPrompt.Invoke()
		}
		catch {
			# Use a fallback prompt if the original fails
			$OriginalPrompt = "PS $($pwd.Path)> "
		}
		
		[void]$result.Append($OriginalPrompt)
		
		# Prompt reporting for development builds
		if ($Global:__VSCodeState.IsStable -eq "0") {
			[void]$result.Append((__VSCode-Build-OSC-Sequence "P" @("Prompt=$(__VSCode-Escape-Value $OriginalPrompt)")))
		}
		
		# Write command started
		[void]$result.Append((__VSCode-Build-OSC-Sequence "B"))
		
		# Update last history ID if we have a valid entry
		if ($null -ne $LastHistoryEntry) {
			$Global:__VSCodeState.LastHistoryId = $LastHistoryEntry.Id
		}
		
		return $result.ToString()
	}
	catch {
		# Fallback to minimal functionality on any error
		try {
			$FakeCode = [int]!$global:?
			$Result = ""
			$Result += "$([char]0x1b)]633;A`a"
			if ($pwd.Provider.Name -eq 'FileSystem') { 
				$Result += "$([char]0x1b)]633;P;Cwd=$(__VSCode-Escape-Value $pwd.ProviderPath)`a" 
			}
			$OriginalPrompt = $Global:__VSCodeState.OriginalPrompt.Invoke()
			$Result += $OriginalPrompt
			$Result += "$([char]0x1b)]633;B`a"
			return $Result
		}
		catch {
			# Ultimate fallback
			return "PS $($pwd.Path)> "
		}
	}
	finally {
		# Always decrement nesting level
		$Global:__VSCodeState.PromptNestingLevel--
		if ($Global:__VSCodeState.PromptNestingLevel -lt 0) {
			$Global:__VSCodeState.PromptNestingLevel = 0
		}
	}
}

# Report prompt type
if ($env:STARSHIP_SESSION_KEY) {
	[Console]::Write("$([char]0x1b)]633;P;PromptType=starship`a")
}
elseif ($env:POSH_SESSION_ID) {
	[Console]::Write("$([char]0x1b)]633;P;PromptType=oh-my-posh`a")
}
elseif ((Test-Path variable:global:GitPromptSettings) -and $Global:GitPromptSettings) {
	[Console]::Write("$([char]0x1b)]633;P;PromptType=posh-git`a")
}

if ($Global:__VSCodeState.IsA11yMode -eq "1") {
	if (Get-Module -Name PSReadLine) {
		return
	}
	$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
	$specialPsrlPath = Join-Path $scriptRoot 'psreadline'
	Import-Module $specialPsrlPath
	Set-PSReadLineOption -EnableScreenReaderMode
}

# Only send the command executed sequence when PSReadLine is loaded, if not shell integration should
# still work thanks to the command line sequence
$Global:__VSCodeState.HasPSReadLine = $false
if (Get-Module -Name PSReadLine) {
	$Global:__VSCodeState.HasPSReadLine = $true
	[Console]::Write("$([char]0x1b)]633;P;HasRichCommandDetection=True`a")

	$Global:__VSCodeState.OriginalPSConsoleHostReadLine = $function:PSConsoleHostReadLine
	function Global:PSConsoleHostReadLine {
		try {
			# Record command start time for performance tracking
			$Global:__VSCodeState.CommandStartTime = Get-Date
			
			# Get the command line from PSReadLine
			$CommandLine = $Global:__VSCodeState.OriginalPSConsoleHostReadLine.Invoke()
			$Global:__VSCodeState.IsInExecution = $true

			# Skip empty commands and commands that are just whitespace
			if ([string]::IsNullOrWhiteSpace($CommandLine)) {
				return $CommandLine
			}

			# Build command line sequence efficiently
			$sequenceParameters = @(__VSCode-Escape-Value $CommandLine)
			
			# Only send the nonce if the OS is not Windows 10 as it seems to echo to the terminal sometimes
			if ($Global:__VSCodeState.IsWindows10 -eq $false -and $Global:__VSCodeState.Nonce) {
				$sequenceParameters += $Global:__VSCodeState.Nonce
			}
			
			# Command line and command executed sequences
			$commandSequence = (__VSCode-Build-OSC-Sequence "E" $sequenceParameters)
			$commandSequence += (__VSCode-Build-OSC-Sequence "C")

			# Write command executed sequence directly to Console to avoid the new line from Write-Host
			[Console]::Write($commandSequence)

			return $CommandLine
		}
		catch {
			# Fallback to original behavior on any error
			try {
				$CommandLine = $Global:__VSCodeState.OriginalPSConsoleHostReadLine.Invoke()
				$Global:__VSCodeState.IsInExecution = $true
				
				# Minimal sequence on error
				$Result = "$([char]0x1b)]633;E;$(__VSCode-Escape-Value $CommandLine)`a"
				$Result += "$([char]0x1b)]633;C`a"
				[Console]::Write($Result)
				
				return $CommandLine
			}
			catch {
				# Ultimate fallback - return empty line
				return ""
			}
		}
	}

	# Set ContinuationPrompt property with error handling
	try {
		$psreadlineOptions = Get-PSReadLineOption -ErrorAction SilentlyContinue
		if ($psreadlineOptions -and $psreadlineOptions.ContinuationPrompt) {
			$Global:__VSCodeState.ContinuationPrompt = $psreadlineOptions.ContinuationPrompt
			[Console]::Write((__VSCode-Build-OSC-Sequence "P" @("ContinuationPrompt=$(__VSCode-Escape-Value $Global:__VSCodeState.ContinuationPrompt)")))
		}
	}
	catch {
		# Continue silently if PSReadLine options can't be read
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
	
	if (-not (Get-Module -Name PSReadLine)) {
		return
	}
	
	try {
		$Handler = $null
		try {
			$Handler = Get-PSReadLineKeyHandler -Chord $Chord -ErrorAction SilentlyContinue | Select-Object -First 1
		}
		catch [System.Management.Automation.ParameterBindingException] {
			# PowerShell 5.1 ships with PSReadLine 2.0.0 which does not have -Chord,
			# so we check what's bound and filter it.
			try {
				$Handler = Get-PSReadLineKeyHandler -Bound -ErrorAction SilentlyContinue | Where-Object -FilterScript { $_.Key -eq $Chord } | Select-Object -First 1
			}
			catch {
				# Ignore errors if we can't get key handlers
			}
		}
		catch {
			# Ignore other errors getting key handlers
		}
		
		if ($Handler -and $Handler.Function) {
			try {
				Set-PSReadLineKeyHandler -Chord $Sequence -Function $Handler.Function -ErrorAction SilentlyContinue
			}
			catch {
				# Ignore errors setting key handlers
			}
		}
	}
	catch {
		# Ignore all errors in key handler setup
	}
}

function Set-MappedKeyHandlers {
	try {
		Set-MappedKeyHandler -Chord Ctrl+Spacebar -Sequence 'F12,a'
		Set-MappedKeyHandler -Chord Alt+Spacebar -Sequence 'F12,b'
		Set-MappedKeyHandler -Chord Shift+Enter -Sequence 'F12,c'
		Set-MappedKeyHandler -Chord Shift+End -Sequence 'F12,d'
	}
	catch {
		# Ignore errors in key handler setup
	}
}
