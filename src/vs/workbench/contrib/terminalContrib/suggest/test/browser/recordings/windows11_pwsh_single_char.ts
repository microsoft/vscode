/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */

// Type "w" and complete "w32tm.exe" ("32tm.exe").
// This test case is special in in that it accepts a completion immediately after requesting them
// which is a case we want to cover in the tests.
export const events = [
	{
		"type": "resize",
		"cols": 175,
		"rows": 17
	},
	{
		"type": "output",
		"data": "\u001b[?9001h\u001b[?1004h\u001b[?25l\u001b[2J\u001b[m\u001b[H\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\u001b[H\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.6.0_x64__8wekyb3d8bbwe\\pwsh.exe\u0007\u001b[?25h"
	},
	{
		"type": "input",
		"data": "\u001b[I"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\u001b[H\u001b[?25h"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;IsWindows=True\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;ContinuationPrompt=\\x1b[38\\x3b5\\x3b8m∙\\x1b[0m \u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b[34m\r\n\u001b[38;2;17;17;17m\u001b[44m11:12:08 \u001b[34m\u001b[41m \u001b[38;2;17;17;17mxterm.js \u001b[31m\u001b[43m \u001b[38;2;17;17;17m master \u001b[33m\u001b[46m \u001b[38;2;17;17;17m$ \u001b[36m\u001b[49m \u001b[mis \u001b[38;5;208m\u001b[1m v5.5.0\u001b[m via \u001b[32m\u001b[1m v20.18.0 \r\n❯\u001b[m \u001b]633;P;Prompt=\\x0a\\x1b[34m\\x1b[44\\x3b38\\x3b2\\x3b17\\x3b17\\x3b17m11:12:08\\x1b[0m\\x1b[44m \\x1b[41\\x3b34m\\x1b[0m\\x1b[41m \\x1b[38\\x3b2\\x3b17\\x3b17\\x3b17mxterm.js\\x1b[0m\\x1b[41m \\x1b[43\\x3b31m\\x1b[38\\x3b2\\x3b17\\x3b17\\x3b17m  master \\x1b[46\\x3b33m\\x1b[38\\x3b2\\x3b17\\x3b17\\x3b17m $ \\x1b[0m\\x1b[36m\\x1b[0m is \\x1b[1\\x3b38\\x3b5\\x3b208m v5.5.0\\x1b[0m via \\x1b[1\\x3b32m v20.18.0 \\x1b[0m\\x0a\\x1b[1\\x3b32m❯\\x1b[0m \u0007\u001b]633;B\u0007"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "input",
		"data": "w"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93mw\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "w|"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b]633;Completions;;0;1;[[\".\\\\webpack.config.headless.js\",3,\"C:\\\\Github\\\\Tyriar\\\\xterm.js\\\\webpack.config.headless.js\"],[\".\\\\webpack.config.js\",3,\"C:\\\\Github\\\\Tyriar\\\\xterm.js\\\\webpack.config.js\"],[\"${$}\",9,\"$\"],[\"$?\",9,\"?\"],[\"$args\",9,\"args\"],[\"$commandLine\",9,\"commandLine\"],[\"$completionPrefix\",9,\"completionPrefix\"],[\"$ConfirmPreference\",9,\"ConfirmPreference\"],[\"$ContinuationPrompt\",9,\"ContinuationPrompt\"],[\"$cursorIndex\",9,\"cursorIndex\"],[\"$DebugPreference\",9,\"DebugPreference\"],[\"$EnabledExperimentalFeatures\",9,\"EnabledExperimentalFeatures\"],[\"$Error\",9,\"Error\"],[\"$ErrorActionPreference\",9,\"ErrorActionPreference\"],[\"$ErrorView\",9,\"ErrorView\"],[\"$ExecutionContext\",9,\"ExecutionContext\"],[\"$false\",9,\"false\"],[\"$FormatEnumerationLimit\",9,\"FormatEnumerationLimit\"],[\"$HOME\",9,\"HOME\"],[\"$Host\",9,\"Host\"],[\"$InformationPreference\",9,\"InformationPreference\"],[\"$input\",9,\"input\"],[\"$IsCoreCLR\",9,\"IsCoreCLR\"],[\"$IsLinux\",9,\"IsLinux\"],[\"$IsMacOS\",9,\"IsMacOS\"],[\"$isStable\",9,\"isStable\"],[\"$IsWindows\",9,\"IsWindows\"],[\"$isWindows10\",9,\"isWindows10\"],[\"$LASTEXITCODE\",9,\"LASTEXITCODE\"],[\"$MaximumHistoryCount\",9,\"MaximumHistoryCount\"],[\"$MyInvocation\",9,\"MyInvocation\"],[\"$NestedPromptLevel\",9,\"NestedPromptLevel\"],[\"$Nonce\",9,\"Nonce\"],[\"$null\",9,\"null\"],[\"$osVersion\",9,\"osVersion\"],[\"$OutputEncoding\",9,\"OutputEncoding\"],[\"$PID\",9,\"PID\"],[\"$prefixCursorDelta\",9,\"prefixCursorDelta\"],[\"$PROFILE\",9,\"PROFILE\"],[\"$ProgressPreference\",9,\"ProgressPreference\"],[\"$PSBoundParameters\",9,\"PSBoundParameters\"],[\"$PSCommandPath\",9,\"PSCommandPath\"],[\"$PSCulture\",9,\"PSCulture\"],[\"$PSDefaultParameterValues\",9,\"PSDefaultParameterValues\"],[\"$PSEdition\",9,\"PSEdition\"],[\"$PSEmailServer\",9,\"PSEmailServer\"],[\"$PSHOME\",9,\"PSHOME\"],[\"$PSNativeCommandArgumentPassing\",9,\"PSNativeCommandArgumentPassing\"],[\"$PSNativeCommandUseErrorActionPreference\",9,\"PSNativeCommandUseErrorActionPreference\"],[\"$PSScriptRoot\",9,\"PSScriptRoot\"],[\"$PSSessionApplicationName\",9,\"PSSessionApplicationName\"],[\"$PSSessionConfigurationName\",9,\"PSSessionConfigurationName\"],[\"$PSSessionOption\",9,\"PSSessionOption\"],[\"$PSStyle\",9,\"PSStyle\"],[\"$PSUICulture\",9,\"PSUICulture\"],[\"$PSVersionTable\",9,\"PSVersionTable\"],[\"$PWD\",9,\"PWD\"],[\"$result\",9,\"result\"],[\"$ShellId\",9,\"ShellId\"],[\"$StackTrace\",9,\"StackTrace\"],[\"$true\",9,\"true\"],[\"$vBinPath\",9,\"vBinPath\"],[\"$VerbosePreference\",9,\"VerbosePreference\"],[\"$vParentPath\",9,\"vParentPath\"],[\"$vResolvedPath\",9,\"vResolvedPath\"],[\"$WarningPreference\",9,\"WarningPreference\"],[\"$WhatIfPreference\",9,\"WhatIfPreference\"],[\"${^}\",9,\"^\"],[\"$__LastHistoryId\",9,\"__LastHistoryId\"],[\"$__VSCodeOriginalPrompt\",9,\"__VSCodeOriginalPrompt\"],[\"$__VSCodeOriginalPSConsoleHostReadLine\",9,\"__VSCodeOriginalPSConsoleHostReadLine\"],[\"$env:ALLUSERSPROFILE\",9,\"[string]env:ALLUSERSPROFILE\"],[\"$env:APPDATA\",9,\"[string]env:APPDATA\"],[\"$env:ChocolateyInstall\",9,\"[string]env:ChocolateyInstall\"],[\"$env:ChocolateyLastPathUpdate\",9,\"[string]env:ChocolateyLastPathUpdate\"],[\"$env:CHROME_CRASHPAD_PIPE_NAME\",9,\"[string]env:CHROME_CRASHPAD_PIPE_NAME\"],[\"$env:CMDER_ROOT\",9,\"[string]env:CMDER_ROOT\"],[\"$env:CODE\",9,\"[string]env:CODE\"],[\"$env:COLORTERM\",9,\"[string]env:COLORTERM\"],[\"$env:CommonProgramFiles\",9,\"[string]env:CommonProgramFiles\"],[\"${env:CommonProgramFiles(x86)}\",9,\"[string]env:CommonProgramFiles(x86)\"],[\"$env:CommonProgramW6432\",9,\"[string]env:CommonProgramW6432\"],[\"$env:COMPUTERNAME\",9,\"[string]env:COMPUTERNAME\"],[\"$env:ComSpec\",9,\"[string]env:ComSpec\"],[\"$env:DISABLE_TEST_EXTENSION\",9,\"[string]env:DISABLE_TEST_EXTENSION\"],[\"$env:DriverData\",9,\"[string]env:DriverData\"],[\"$env:EFC_11408\",9,\"[string]env:EFC_11408\"],[\"$env:FPS_BROWSER_APP_PROFILE_STRING\",9,\"[string]env:FPS_BROWSER_APP_PROFILE_STRING\"],[\"$env:FPS_BROWSER_USER_PROFILE_STRING\",9,\"[string]env:FPS_BROWSER_USER_PROFILE_STRING\"],[\"$env:GIT_ASKPASS\",9,\"[string]env:GIT_ASKPASS\"],[\"$env:GIT_LFS_PATH\",9,\"[string]env:GIT_LFS_PATH\"],[\"$env:HOMEDRIVE\",9,\"[string]env:HOMEDRIVE\"],[\"$env:HOMEPATH\",9,\"[string]env:HOMEPATH\"],[\"$env:JAVA_HOME\",9,\"[string]env:JAVA_HOME\"],[\"$env:LANG\",9,\"[string]env:LANG\"],[\"$env:LOCALAPPDATA\",9,\"[string]env:LOCALAPPDATA\"],[\"$env:LOGONSERVER\",9,\"[string]env:LOGONSERVER\"],[\"$env:NAMESHORT\",9,\"[string]env:NAMESHORT\"],[\"$env:NODE_ENV\",9,\"[string]env:NODE_ENV\"],[\"$env:NODE_INCLUDE_PATH\",9,\"[string]env:NODE_INCLUDE_PATH\"],[\"$env:NUMBER_OF_PROCESSORS\",9,\"[string]env:NUMBER_OF_PROCESSORS\"],[\"$env:OneDrive\",9,\"[string]env:OneDrive\"],[\"$env:OneDriveCommercial\",9,\"[string]env:OneDriveCommercial\"],[\"$env:OneDriveConsumer\",9,\"[string]env:OneDriveConsumer\"],[\"$env:OPEN_SOURCE_CONTRIBUTOR\",9,\"[string]env:OPEN_SOURCE_CONTRIBUTOR\"],[\"$env:ORIGINAL_XDG_CURRENT_DESKTOP\",9,\"[string]env:ORIGINAL_XDG_CURRENT_DESKTOP\"],[\"$env:OS\",9,\"[string]env:OS\"],[\"$env:Path\",9,\"[string]env:Path\"],[\"$env:PATHEXT\",9,\"[string]env:PATHEXT\"],[\"$env:POSH_INSTALLER\",9,\"[string]env:POSH_INSTALLER\"],[\"$env:POSH_THEMES_PATH\",9,\"[string]env:POSH_THEMES_PATH\"],[\"$env:PROCESSOR_ARCHITECTURE\",9,\"[string]env:PROCESSOR_ARCHITECTURE\"],[\"$env:PROCESSOR_IDENTIFIER\",9,\"[string]env:PROCESSOR_IDENTIFIER\"],[\"$env:PROCESSOR_LEVEL\",9,\"[string]env:PROCESSOR_LEVEL\"],[\"$env:PROCESSOR_REVISION\",9,\"[string]env:PROCESSOR_REVISION\"],[\"$env:ProgramData\",9,\"[string]env:ProgramData\"],[\"$env:ProgramFiles\",9,\"[string]env:ProgramFiles\"],[\"${env:ProgramFiles(x86)}\",9,\"[string]env:ProgramFiles(x86)\"],[\"$env:ProgramW6432\",9,\"[string]env:ProgramW6432\"],[\"$env:PROMPT\",9,\"[string]env:PROMPT\"],[\"$env:PSModulePath\",9,\"[string]env:PSModulePath\"],[\"$env:PUBLIC\",9,\"[string]env:PUBLIC\"],[\"$env:PYTHONSTARTUP\",9,\"[string]env:PYTHONSTARTUP\"],[\"$env:SESSIONNAME\",9,\"[string]env:SESSIONNAME\"],[\"$env:STARSHIP_SESSION_KEY\",9,\"[string]env:STARSHIP_SESSION_KEY\"],[\"$env:STARSHIP_SHELL\",9,\"[string]env:STARSHIP_SHELL\"],[\"$env:SystemDrive\",9,\"[string]env:SystemDrive\"],[\"$env:SystemRoot\",9,\"[string]env:SystemRoot\"],[\"$env:TEMP\",9,\"[string]env:TEMP\"],[\"$env:TERM_PROGRAM\",9,\"[string]env:TERM_PROGRAM\"],[\"$env:TERM_PROGRAM_VERSION\",9,\"[string]env:TERM_PROGRAM_VERSION\"],[\"$env:TMP\",9,\"[string]env:TMP\"],[\"$env:UATDATA\",9,\"[string]env:UATDATA\"],[\"$env:USERDOMAIN\",9,\"[string]env:USERDOMAIN\"],[\"$env:USERDOMAIN_ROAMINGPROFILE\",9,\"[string]env:USERDOMAIN_ROAMINGPROFILE\"],[\"$env:USERNAME\",9,\"[string]env:USERNAME\"],[\"$env:USERPROFILE\",9,\"[string]env:USERPROFILE\"],[\"$env:VIRTUAL_ENV_DISABLE_PROMPT\",9,\"[string]env:VIRTUAL_ENV_DISABLE_PROMPT\"],[\"$env:VSCODE_GIT_ASKPASS_EXTRA_ARGS\",9,\"[string]env:VSCODE_GIT_ASKPASS_EXTRA_ARGS\"],[\"$env:VSCODE_GIT_ASKPASS_MAIN\",9,\"[string]env:VSCODE_GIT_ASKPASS_MAIN\"],[\"$env:VSCODE_GIT_ASKPASS_NODE\",9,\"[string]env:VSCODE_GIT_ASKPASS_NODE\"],[\"$env:VSCODE_GIT_IPC_HANDLE\",9,\"[string]env:VSCODE_GIT_IPC_HANDLE\"],[\"$env:VSCODE_INJECTION\",9,\"[string]env:VSCODE_INJECTION\"],[\"$env:windir\",9,\"[string]env:windir\"],[\"$CurrentlyExecutingCommand\",9,\"CurrentlyExecutingCommand\"],[\"$foreach\",9,\"foreach\"],[\"$LogCommandHealthEvent\",9,\"LogCommandHealthEvent\"],[\"$LogCommandLifecycleEvent\",9,\"LogCommandLifecycleEvent\"],[\"$LogEngineHealthEvent\",9,\"LogEngineHealthEvent\"],[\"$LogEngineLifecycleEvent\",9,\"LogEngineLifecycleEvent\"],[\"$LogProviderHealthEvent\",9,\"LogProviderHealthEvent\"],[\"$LogProviderLifecycleEvent\",9,\"LogProviderLifecycleEvent\"],[\"$LogSettingsEvent\",9,\"LogSettingsEvent\"],[\"$Matches\",9,\"Matches\"],[\"$OFS\",9,\"OFS\"],[\"$PSCmdlet\",9,\"PSCmdlet\"],[\"$PSDebugContext\",9,\"PSDebugContext\"],[\"$PSItem\",9,\"PSItem\"],[\"$PSLogUserData\",9,\"PSLogUserData\"],[\"$PSModuleAutoLoadingPreference\",9,\"PSModuleAutoLoadingPreference\"],[\"$PSSenderInfo\",9,\"PSSenderInfo\"],[\"$switch\",9,\"switch\"],[\"$this\",9,\"this\"],[\"$VerboseHelpErrors\",9,\"VerboseHelpErrors\"],[\"$_\",9,\"_\"],[\"$Alias:\",9,\"Drive that contains a view of the aliases stored in a session state\"],[\"$Env:\",9,\"Drive that contains a view of the environment variables for the process\"],[\"$Function:\",9,\"Drive that contains a view of the functions stored in a session state\"],[\"$Temp:\",9,\"Drive that maps to the temporary directory path for the current user\"],[\"$Variable:\",9,\"Drive that contains a view of those variables stored in a session state\"],[\"$Global:\",9,\"Global:\"],[\"$Local:\",9,\"Local:\"],[\"$Script:\",9,\"Script:\"],[\"$Private:\",9,\"Private:\"]]\u0007"
	},
	{
		"type": "command",
		"id": "workbench.action.terminal.acceptSelectedSuggestion"
	},
	{
		"type": "sendText",
		"data": "32tm.exe"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\bw32tm.exe\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "w32tm.exe|"
	}
];
