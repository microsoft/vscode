/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */
export const events = [
	{
		"type": "resize",
		"cols": 93,
		"rows": 29
	},
	{
		"type": "output",
		"data": "\u001b[?1h\u001b="
	},
	{
		"type": "output",
		"data": "\u001b]633;P;IsWindows=True\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;ContinuationPrompt=>> \u0007"
	},
	{
		"type": "output",
		"data": "\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;1R"
	},
	{
		"type": "output",
		"data": "\u001b]633;A\u0007\u001b]633;P;Cwd=/Users/meganrogge/Repos/xterm.js\u0007PS /Users/meganrogge/Repos/xterm.js> \u001b]633;P;Prompt=PS /Users/meganrogge/Repos/xterm.js> \u0007\u001b]633;B\u0007\u001b[?1h"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "output",
		"data": "\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;38R"
	},
	{
		"type": "input",
		"data": "g"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mg\u001b[0m\u001b[97;2;3mit commit -m \"see if reverting bug fix causes tests to pass in ci\" && git push\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;39H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;39R"
	},
	{
		"type": "promptInputChange",
		"data": "g|[it commit -m \"see if reverting bug fix causes tests to]"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[39;49m\u001b[39;49m\u001b]633;Completions;;0;1;[[\"${$}\",9,\"$\"],[\"$?\",9,\"?\"],[\"$args\",9,\"args\"],[\"$commandLine\",9,\"commandLine\"],[\"$completionPrefix\",9,\"completionPrefix\"],[\"$ConfirmPreference\",9,\"ConfirmPreference\"],[\"$ContinuationPrompt\",9,\"ContinuationPrompt\"],[\"$cursorIndex\",9,\"cursorIndex\"],[\"$DebugPreference\",9,\"DebugPreference\"],[\"$EnabledExperimentalFeatures\",9,\"EnabledExperimentalFeatures\"],[\"$Error\",9,\"Error\"],[\"$ErrorActionPreference\",9,\"ErrorActionPreference\"],[\"$ErrorView\",9,\"ErrorView\"],[\"$ExecutionContext\",9,\"ExecutionContext\"],[\"$false\",9,\"false\"],[\"$FormatEnumerationLimit\",9,\"FormatEnumerationLimit\"],[\"$HOME\",9,\"HOME\"],[\"$Host\",9,\"Host\"],[\"$InformationPreference\",9,\"InformationPreference\"],[\"$input\",9,\"input\"],[\"$IsCoreCLR\",9,\"IsCoreCLR\"],[\"$IsLinux\",9,\"IsLinux\"],[\"$IsMacOS\",9,\"IsMacOS\"],[\"$isStable\",9,\"isStable\"],[\"$IsWindows\",9,\"IsWindows\"],[\"$isWindows10\",9,\"isWindows10\"],[\"$MaximumHistoryCount\",9,\"MaximumHistoryCount\"],[\"$MyInvocation\",9,\"MyInvocation\"],[\"$NestedPromptLevel\",9,\"NestedPromptLevel\"],[\"$Nonce\",9,\"Nonce\"],[\"$null\",9,\"null\"],[\"$osVersion\",9,\"osVersion\"],[\"$OutputEncoding\",9,\"OutputEncoding\"],[\"$PID\",9,\"PID\"],[\"$prefixCursorDelta\",9,\"prefixCursorDelta\"],[\"$PROFILE\",9,\"PROFILE\"],[\"$ProgressPreference\",9,\"ProgressPreference\"],[\"$PSBoundParameters\",9,\"PSBoundParameters\"],[\"$PSCommandPath\",9,\"PSCommandPath\"],[\"$PSCulture\",9,\"PSCulture\"],[\"$PSDefaultParameterValues\",9,\"PSDefaultParameterValues\"],[\"$PSEdition\",9,\"PSEdition\"],[\"$PSEmailServer\",9,\"PSEmailServer\"],[\"$PSHOME\",9,\"PSHOME\"],[\"$PSNativeCommandArgumentPassing\",9,\"PSNativeCommandArgumentPassing\"],[\"$PSNativeCommandUseErrorActionPreference\",9,\"PSNativeCommandUseErrorActionPreference\"],[\"$PSScriptRoot\",9,\"PSScriptRoot\"],[\"$PSSessionApplicationName\",9,\"PSSessionApplicationName\"],[\"$PSSessionConfigurationName\",9,\"PSSessionConfigurationName\"],[\"$PSSessionOption\",9,\"PSSessionOption\"],[\"$PSStyle\",9,\"PSStyle\"],[\"$PSUICulture\",9,\"PSUICulture\"],[\"$PSVersionTable\",9,\"PSVersionTable\"],[\"$PWD\",9,\"PWD\"],[\"$result\",9,\"result\"],[\"$ShellId\",9,\"ShellId\"],[\"$StackTrace\",9,\"StackTrace\"],[\"$true\",9,\"true\"],[\"$VerbosePreference\",9,\"VerbosePreference\"],[\"$WarningPreference\",9,\"WarningPreference\"],[\"$WhatIfPreference\",9,\"WhatIfPreference\"],[\"${^}\",9,\"^\"],[\"$__LastHistoryId\",9,\"__LastHistoryId\"],[\"$__VSCodeOriginalPrompt\",9,\"__VSCodeOriginalPrompt\"],[\"$__VSCodeOriginalPSConsoleHostReadLine\",9,\"__VSCodeOriginalPSConsoleHostReadLine\"],[\"$env:APPLICATIONINSIGHTS_CONFIGURATION_CONTENT\",9,\"[string]env:APPLICATIONINSIGHTS_CONFIGURATION_CONTENT\"],[\"$env:COLORTERM\",9,\"[string]env:COLORTERM\"],[\"$env:COMMAND_MODE\",9,\"[string]env:COMMAND_MODE\"],[\"$env:GIT_ASKPASS\",9,\"[string]env:GIT_ASKPASS\"],[\"$env:HOME\",9,\"[string]env:HOME\"],[\"$env:HOMEBREW_CELLAR\",9,\"[string]env:HOMEBREW_CELLAR\"],[\"$env:HOMEBREW_PREFIX\",9,\"[string]env:HOMEBREW_PREFIX\"],[\"$env:HOMEBREW_REPOSITORY\",9,\"[string]env:HOMEBREW_REPOSITORY\"],[\"$env:INFOPATH\",9,\"[string]env:INFOPATH\"],[\"$env:LANG\",9,\"[string]env:LANG\"],[\"$env:LOGNAME\",9,\"[string]env:LOGNAME\"],[\"$env:MallocNanoZone\",9,\"[string]env:MallocNanoZone\"],[\"$env:NODE_ENV\",9,\"[string]env:NODE_ENV\"],[\"$env:NODE_OPTIONS\",9,\"[string]env:NODE_OPTIONS\"],[\"$env:OLDPWD\",9,\"[string]env:OLDPWD\"],[\"$env:ORIGINAL_XDG_CURRENT_DESKTOP\",9,\"[string]env:ORIGINAL_XDG_CURRENT_DESKTOP\"],[\"$env:PATH\",9,\"[string]env:PATH\"],[\"$env:PSModulePath\",9,\"[string]env:PSModulePath\"],[\"$env:PWD\",9,\"[string]env:PWD\"],[\"$env:SHELL\",9,\"[string]env:SHELL\"],[\"$env:SHLVL\",9,\"[string]env:SHLVL\"],[\"$env:SSH_AUTH_SOCK\",9,\"[string]env:SSH_AUTH_SOCK\"],[\"$env:TERM\",9,\"[string]env:TERM\"],[\"$env:TERM_PROGRAM\",9,\"[string]env:TERM_PROGRAM\"],[\"$env:TERM_PROGRAM_VERSION\",9,\"[string]env:TERM_PROGRAM_VERSION\"],[\"$env:TMPDIR\",9,\"[string]env:TMPDIR\"],[\"$env:USER\",9,\"[string]env:USER\"],[\"$env:VSCODE_GIT_ASKPASS_EXTRA_ARGS\",9,\"[string]env:VSCODE_GIT_ASKPASS_EXTRA_ARGS\"],[\"$env:VSCODE_GIT_ASKPASS_MAIN\",9,\"[string]env:VSCODE_GIT_ASKPASS_MAIN\"],[\"$env:VSCODE_GIT_ASKPASS_NODE\",9,\"[string]env:VSCODE_GIT_ASKPASS_NODE\"],[\"$env:VSCODE_GIT_IPC_HANDLE\",9,\"[string]env:VSCODE_GIT_IPC_HANDLE\"],[\"$env:VSCODE_INJECTION\",9,\"[string]env:VSCODE_INJECTION\"],[\"$env:VSCODE_INSPECTOR_OPTIONS\",9,\"[string]env:VSCODE_INSPECTOR_OPTIONS\"],[\"$env:XPC_FLAGS\",9,\"[string]env:XPC_FLAGS\"],[\"$env:XPC_SERVICE_NAME\",9,\"[string]env:XPC_SERVICE_NAME\"],[\"$env:__CFBundleIdentifier\",9,\"[string]env:__CFBundleIdentifier\"],[\"$env:__CF_USER_TEXT_ENCODING\",9,\"[string]env:__CF_USER_TEXT_ENCODING\"],[\"$CurrentlyExecutingCommand\",9,\"CurrentlyExecutingCommand\"],[\"$foreach\",9,\"foreach\"],[\"$LASTEXITCODE\",9,\"LASTEXITCODE\"],[\"$LogCommandHealthEvent\",9,\"LogCommandHealthEvent\"],[\"$LogCommandLifecycleEvent\",9,\"LogCommandLifecycleEvent\"],[\"$LogEngineHealthEvent\",9,\"LogEngineHealthEvent\"],[\"$LogEngineLifecycleEvent\",9,\"LogEngineLifecycleEvent\"],[\"$LogProviderHealthEvent\",9,\"LogProviderHealthEvent\"],[\"$LogProviderLifecycleEvent\",9,\"LogProviderLifecycleEvent\"],[\"$LogSettingsEvent\",9,\"LogSettingsEvent\"],[\"$Matches\",9,\"Matches\"],[\"$OFS\",9,\"OFS\"],[\"$PSCmdlet\",9,\"PSCmdlet\"],[\"$PSDebugContext\",9,\"PSDebugContext\"],[\"$PSItem\",9,\"PSItem\"],[\"$PSLogUserData\",9,\"PSLogUserData\"],[\"$PSModuleAutoLoadingPreference\",9,\"PSModuleAutoLoadingPreference\"],[\"$PSSenderInfo\",9,\"PSSenderInfo\"],[\"$switch\",9,\"switch\"],[\"$this\",9,\"this\"],[\"$VerboseHelpErrors\",9,\"VerboseHelpErrors\"],[\"$_\",9,\"_\"],[\"$Alias:\",9,\"Drive that contains a view of the aliases stored in a session state\"],[\"$Env:\",9,\"Drive that contains a view of the environment variables for the process\"],[\"$Function:\",9,\"Drive that contains a view of the functions stored in a session state\"],[\"$Temp:\",9,\"Drive that maps to the temporary directory path for the current user\"],[\"$Variable:\",9,\"Drive that contains a view of those variables stored in a session state\"],[\"$Global:\",9,\"Global:\"],[\"$Local:\",9,\"Local:\"],[\"$Script:\",9,\"Script:\"],[\"$Private:\",9,\"Private:\"]]\u0007\u001b[39;49m\u001b[39;49m"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;39R"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mge\u001b[0m\u001b[97;2;3mt-Al\u001b[0m\u001b[39;49m                                                  \u001b[2;1H                       \u001b[0m\u001b[1;40H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;40R"
	},
	{
		"type": "promptInputChange",
		"data": "ge|[t-Al]"
	},
	{
		"type": "input",
		"data": "t"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget\u001b[0m\u001b[97;2;3m-Al\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;41H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;41R"
	},
	{
		"type": "promptInputChange",
		"data": "get|[-Al]"
	},
	{
		"type": "input",
		"data": "-"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget-\u001b[0m\u001b[97;2;3mAl\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;42H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;42R"
	},
	{
		"type": "promptInputChange",
		"data": "get-|[Al]"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget-c\u001b[0m\u001b[97;2;3monte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;43H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;43R"
	},
	{
		"type": "promptInputChange",
		"data": "get-c|[onte]"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget-co\u001b[0m\u001b[97;2;3mnte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;44H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;44R"
	},
	{
		"type": "promptInputChange",
		"data": "get-co|[nte]"
	},
	{
		"type": "input",
		"data": "n"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget-con\u001b[0m\u001b[97;2;3mte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;45H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;45R"
	},
	{
		"type": "promptInputChange",
		"data": "get-con|[te]"
	},
	{
		"type": "command",
		"id": "workbench.action.terminal.acceptSelectedSuggestion"
	},
	{
		"type": "sendText",
		"data": "Get-Content"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mget-co\u001b[0m\u001b[97;2;3mnte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;44H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;44R"
	},
	{
		"type": "promptInputChange",
		"data": "get-co|[nte]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mG\u001b[0m\u001b[97;2;3mit commit -m \"see if reverting bug fix causes tests to pass in ci\" && git push\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;39H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;39R"
	},
	{
		"type": "promptInputChange",
		"data": "G|[it commit -m \"see if reverting bug fix causes tests to]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGe\u001b[0m\u001b[97;2;3mt-Al\u001b[0m\u001b[39;49m                                                  \u001b[2;1H                       \u001b[0m\u001b[1;40H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;40R"
	},
	{
		"type": "promptInputChange",
		"data": "Ge|[t-Al]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet\u001b[0m\u001b[97;2;3m-Al\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;41H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;41R"
	},
	{
		"type": "promptInputChange",
		"data": "Get|[-Al]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-\u001b[0m\u001b[97;2;3mAl\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;42H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;42R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-|[Al]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-C\u001b[0m\u001b[97;2;3monte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;43H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;43R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-C|[onte]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Co\u001b[0m\u001b[97;2;3mnte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;44H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;44R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Co|[nte]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Con\u001b[0m\u001b[97;2;3mte\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;45H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;45R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Con|[te]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Cont\u001b[0m\u001b[97;2;3me\u001b[0m\u001b[39;49m\u001b[0m\u001b[1;46H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;46R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Cont|[e]"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Conte\u001b[39;49m\u001b[0m\u001b[1;47H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;47R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Conte|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Conten\u001b[39;49m\u001b[0m\u001b[1;48H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;48R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Conten|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[39;49m\u001b[0m\u001b[1;49H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;49R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content|"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[39;49m\u001b[0m\u001b[1;50H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;50R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content |"
	},
	{
		"type": "input",
		"data": "."
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m.\u001b[39;49m\u001b[0m\u001b[1;51H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;51R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content .|"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[39;49m\u001b[39;49m\u001b]633;Completions;12;1;11;[[\"./.devcontainer\",4,\"/Users/meganrogge/Repos/xterm.js/.devcontainer\"],[\"./.editorconfig\",3,\"/Users/meganrogge/Repos/xterm.js/.editorconfig\"],[\"./.eslintrc.json\",3,\"/Users/meganrogge/Repos/xterm.js/.eslintrc.json\"],[\"./.eslintrc.json.typings\",3,\"/Users/meganrogge/Repos/xterm.js/.eslintrc.json.typings\"],[\"./.git\",4,\"/Users/meganrogge/Repos/xterm.js/.git\"],[\"./.gitattributes\",3,\"/Users/meganrogge/Repos/xterm.js/.gitattributes\"],[\"./.github\",4,\"/Users/meganrogge/Repos/xterm.js/.github\"],[\"./.gitignore\",3,\"/Users/meganrogge/Repos/xterm.js/.gitignore\"],[\"./.gitmodules\",3,\"/Users/meganrogge/Repos/xterm.js/.gitmodules\"],[\"./.mailmap\",3,\"/Users/meganrogge/Repos/xterm.js/.mailmap\"],[\"./.mocha.env\",3,\"/Users/meganrogge/Repos/xterm.js/.mocha.env\"],[\"./.mocharc.yml\",3,\"/Users/meganrogge/Repos/xterm.js/.mocharc.yml\"],[\"./.npmignore\",3,\"/Users/meganrogge/Repos/xterm.js/.npmignore\"],[\"./.npmrc\",3,\"/Users/meganrogge/Repos/xterm.js/.npmrc\"],[\"./.nvmrc\",3,\"/Users/meganrogge/Repos/xterm.js/.nvmrc\"],[\"./.vscode\",4,\"/Users/meganrogge/Repos/xterm.js/.vscode\"],[\"./addons\",4,\"/Users/meganrogge/Repos/xterm.js/addons\"],[\"./bin\",4,\"/Users/meganrogge/Repos/xterm.js/bin\"],[\"./CODE_OF_CONDUCT.md\",3,\"/Users/meganrogge/Repos/xterm.js/CODE_OF_CONDUCT.md\"],[\"./CONTRIBUTING.md\",3,\"/Users/meganrogge/Repos/xterm.js/CONTRIBUTING.md\"],[\"./css\",4,\"/Users/meganrogge/Repos/xterm.js/css\"],[\"./demo\",4,\"/Users/meganrogge/Repos/xterm.js/demo\"],[\"./fixtures\",4,\"/Users/meganrogge/Repos/xterm.js/fixtures\"],[\"./headless\",4,\"/Users/meganrogge/Repos/xterm.js/headless\"],[\"./images\",4,\"/Users/meganrogge/Repos/xterm.js/images\"],[\"./LICENSE\",3,\"/Users/meganrogge/Repos/xterm.js/LICENSE\"],[\"./package.json\",3,\"/Users/meganrogge/Repos/xterm.js/package.json\"],[\"./README.md\",3,\"/Users/meganrogge/Repos/xterm.js/README.md\"],[\"./src\",4,\"/Users/meganrogge/Repos/xterm.js/src\"],[\"./test\",4,\"/Users/meganrogge/Repos/xterm.js/test\"],[\"./tsconfig.all.json\",3,\"/Users/meganrogge/Repos/xterm.js/tsconfig.all.json\"],[\"./typings\",4,\"/Users/meganrogge/Repos/xterm.js/typings\"],[\"./webpack.config.headless.js\",3,\"/Users/meganrogge/Repos/xterm.js/webpack.config.headless.js\"],[\"./webpack.config.js\",3,\"/Users/meganrogge/Repos/xterm.js/webpack.config.js\"],[\"./yarn.lock\",3,\"/Users/meganrogge/Repos/xterm.js/yarn.lock\"],[\".\",4,\"/Users/meganrogge/Repos/xterm.js\"],[\"..\",4,\"/Users/meganrogge/Repos\"]]\u0007\u001b[39;49m\u001b[39;49m"
	},
	{
		"type": "input",
		"data": "/"
	},
	{
		"type": "output",
		"data": "\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;51R"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./\u001b[39;49m\u001b[0m\u001b[1;52H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;52R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./|"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[39;49m\u001b[39;49m\u001b]633;Completions;12;2;14;[[\"./.devcontainer\",4,\"/Users/meganrogge/Repos/xterm.js/.devcontainer\"],[\"./.editorconfig\",3,\"/Users/meganrogge/Repos/xterm.js/.editorconfig\"],[\"./.eslintrc.json\",3,\"/Users/meganrogge/Repos/xterm.js/.eslintrc.json\"],[\"./.eslintrc.json.typings\",3,\"/Users/meganrogge/Repos/xterm.js/.eslintrc.json.typings\"],[\"./.git\",4,\"/Users/meganrogge/Repos/xterm.js/.git\"],[\"./.gitattributes\",3,\"/Users/meganrogge/Repos/xterm.js/.gitattributes\"],[\"./.github\",4,\"/Users/meganrogge/Repos/xterm.js/.github\"],[\"./.gitignore\",3,\"/Users/meganrogge/Repos/xterm.js/.gitignore\"],[\"./.gitmodules\",3,\"/Users/meganrogge/Repos/xterm.js/.gitmodules\"],[\"./.mailmap\",3,\"/Users/meganrogge/Repos/xterm.js/.mailmap\"],[\"./.mocha.env\",3,\"/Users/meganrogge/Repos/xterm.js/.mocha.env\"],[\"./.mocharc.yml\",3,\"/Users/meganrogge/Repos/xterm.js/.mocharc.yml\"],[\"./.npmignore\",3,\"/Users/meganrogge/Repos/xterm.js/.npmignore\"],[\"./.npmrc\",3,\"/Users/meganrogge/Repos/xterm.js/.npmrc\"],[\"./.nvmrc\",3,\"/Users/meganrogge/Repos/xterm.js/.nvmrc\"],[\"./.vscode\",4,\"/Users/meganrogge/Repos/xterm.js/.vscode\"],[\"./addons\",4,\"/Users/meganrogge/Repos/xterm.js/addons\"],[\"./bin\",4,\"/Users/meganrogge/Repos/xterm.js/bin\"],[\"./CODE_OF_CONDUCT.md\",3,\"/Users/meganrogge/Repos/xterm.js/CODE_OF_CONDUCT.md\"],[\"./CONTRIBUTING.md\",3,\"/Users/meganrogge/Repos/xterm.js/CONTRIBUTING.md\"],[\"./css\",4,\"/Users/meganrogge/Repos/xterm.js/css\"],[\"./demo\",4,\"/Users/meganrogge/Repos/xterm.js/demo\"],[\"./fixtures\",4,\"/Users/meganrogge/Repos/xterm.js/fixtures\"],[\"./headless\",4,\"/Users/meganrogge/Repos/xterm.js/headless\"],[\"./images\",4,\"/Users/meganrogge/Repos/xterm.js/images\"],[\"./LICENSE\",3,\"/Users/meganrogge/Repos/xterm.js/LICENSE\"],[\"./package.json\",3,\"/Users/meganrogge/Repos/xterm.js/package.json\"],[\"./README.md\",3,\"/Users/meganrogge/Repos/xterm.js/README.md\"],[\"./src\",4,\"/Users/meganrogge/Repos/xterm.js/src\"],[\"./test\",4,\"/Users/meganrogge/Repos/xterm.js/test\"],[\"./tsconfig.all.json\",3,\"/Users/meganrogge/Repos/xterm.js/tsconfig.all.json\"],[\"./typings\",4,\"/Users/meganrogge/Repos/xterm.js/typings\"],[\"./webpack.config.headless.js\",3,\"/Users/meganrogge/Repos/xterm.js/webpack.config.headless.js\"],[\"./webpack.config.js\",3,\"/Users/meganrogge/Repos/xterm.js/webpack.config.js\"],[\"./yarn.lock\",3,\"/Users/meganrogge/Repos/xterm.js/yarn.lock\"],[\".\",4,\"/Users/meganrogge/Repos/xterm.js\"],[\"..\",4,\"/Users/meganrogge/Repos\"]]\u0007\u001b[39;49m\u001b[39;49m"
	},
	{
		"type": "input",
		"data": "R"
	},
	{
		"type": "output",
		"data": "\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;52R"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./R\u001b[39;49m\u001b[0m\u001b[1;53H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;53R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./R|"
	},
	{
		"type": "input",
		"data": "E"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./RE\u001b[39;49m\u001b[0m\u001b[1;54H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;54R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./RE|"
	},
	{
		"type": "command",
		"id": "workbench.action.terminal.acceptSelectedSuggestion"
	},
	{
		"type": "sendText",
		"data": "ADME.md"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./REA\u001b[39;49m\u001b[0m\u001b[1;55H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;55R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./REA|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./READ\u001b[39;49m\u001b[0m\u001b[1;56H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;56R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./READ|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./READM\u001b[39;49m\u001b[0m\u001b[1;57H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;57R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./READM|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./README\u001b[39;49m\u001b[0m\u001b[1;58H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;58R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./README|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./README.\u001b[39;49m\u001b[0m\u001b[1;59H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;59R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./README.|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./README.m\u001b[39;49m\u001b[0m\u001b[1;60H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;60R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./README.m|"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[1;38H\u001b[0m\u001b[93mGet-Content\u001b[0m\u001b[39;49m \u001b[0m\u001b[37m./README.md\u001b[39;49m\u001b[0m\u001b[1;61H\u001b[?12l\u001b[?25h\u001b[6n"
	},
	{
		"type": "input",
		"data": "\u001b[1;61R"
	},
	{
		"type": "promptInputChange",
		"data": "Get-Content ./README.md|"
	}
];
