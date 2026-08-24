/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */

// Windows 24H2
// PowerShell 7.5.2
// Steps:
// - Open terminal
// - Type echo a
// - Press enter
// - Type echo b
// - Press enter
// - Type echo c
// - Press enter
export const events = [
	{
		"type": "resize",
		"cols": 167,
		"rows": 22
	},
	{
		"type": "output",
		"data": "\u001b[?9001h\u001b[?1004h\u001b[?25l\u001b[2J\u001b[m\u001b[H\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\u001b[H\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\u0007\u001b[?25h"
	},
	{
		"type": "input",
		"data": "\u001b[I"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\r\n\u001b[K\u001b[H\u001b[?25h"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;PromptType=posh-git\u0007\u001b]633;P;HasRichCommandDetection=True\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;ContinuationPrompt=>> \u0007\u001b]633;P;IsWindows=True\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\pwsh.exe \u0007\u001b]0;xterm.js [master] - PowerShell 7.5 (45808)\u0007\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b]633;EnvJson;{\"PATH\":\"C:\\x5c\\x5cProgram Files\\x5c\\x5cWindowsApps\\x5c\\x5cMicrosoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cMicrosoft SDKs\\x5c\\x5cAzure\\x5c\\x5cCLI2\\x5c\\x5cwbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cEclipse Adoptium\\x5c\\x5cjdk-8.0.345.1-hotspot\\x5c\\x5cbin\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cPhysX\\x5c\\x5cCommon\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit LFS\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnu\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cstarship\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cNVIDIA NvDLISR\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGitHub CLI\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cWindows Kits\\x5c\\x5c10\\x5c\\x5cWindows Performance Toolkit\\x5c\\x5c\\x3bC:\\x5c\\x5cProgramData\\x5c\\x5cchocolatey\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cdotnet\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cGpg4win\\x5c\\x5c..\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnodejs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit\\x5c\\x5ccmd\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.cargo\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cPython\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cthemes\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-cli\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cJetBrains\\x5c\\x5cToolbox\\x5c\\x5cscripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cnvs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cMicrosoft Visual Studio\\x5c\\x5c2017\\x5c\\x5cBuildTools\\x5c\\x5cMSBuild\\x5c\\x5c15.0\\x5c\\x5cBin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cBurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\x5c\\x5cripgrep-13.0.0-x86_64-pc-windows-msvc\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cSchniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\\x3bc:\\x5c\\x5cusers\\x5c\\x5cdaniel\\x5c\\x5c.local\\x5c\\x5cbin\\x3bC:\\x5c\\x5cTools\\x5c\\x5cHandle\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code Insiders\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cJulia-1.11.1\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPackages\\x5c\\x5cPythonSoftwareFoundation.Python.3.9_qbz5n2kfra8p0\\x5c\\x5cLocalCache\\x5c\\x5clocal-packages\\x5c\\x5cPython39\\x5c\\x5cScripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cWindsurf\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5ccursor\\x5c\\x5cresources\\x5c\\x5capp\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cnpm\\x3bc:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-oss-dev\\x5c\\x5cUser\\x5c\\x5cglobalStorage\\x5c\\x5cgithub.copilot-chat\\x5c\\x5cdebugCommand\"};d970493f-becd-4c84-a4e9-8d7017bac9af\u0007C:\\Github\\Tyriar\\xterm.js \u001b[93m[\u001b[92mmaster ↑2\u001b[93m]\u001b[m> \u001b]633;P;Prompt=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js \\x1b[93m[\\x1b[39m\\x1b[92mmaster\\x1b[39m\\x1b[92m ↑2\\x1b[39m\\x1b[93m]\\x1b[39m> \u0007\u001b]633;B\u0007"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "commandDetection.onCommandStarted"
	},
	{
		"type": "command",
		"id": "_setContext"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93me\u001b[97m\u001b[2m\u001b[3mcho b\u001b[1;41H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "e|cho b"
	},
	{
		"type": "promptInputChange",
		"data": "e|[cho b]"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\bec\u001b[97m\u001b[2m\u001b[3mho b\u001b[1;42H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "ec|[ho b]"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[1;40Hecho\u001b[97m\u001b[2m\u001b[3m b\u001b[1;44H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo|[ b]"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l\u001b[93m\u001b[1;40Hecho \u001b[97m\u001b[2m\u001b[3mb\b\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo |[b]"
	},
	{
		"type": "input",
		"data": "a"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[1;40Hecho \u001b[37ma\u001b[97m\u001b[2m\u001b[3mbc\u001b[1;46H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo a|[bc]"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b]633;Completions;0;5;5;[]\u0007"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\u001b[K"
	},
	{
		"type": "promptInputChange",
		"data": "echo a|"
	},
	{
		"type": "output",
		"data": "\r\n\u001b]633;E;echo a;d970493f-becd-4c84-a4e9-8d7017bac9af\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "promptInputChange",
		"data": "echo a|[]"
	},
	{
		"type": "promptInputChange",
		"data": "echo a"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo a"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo a"
	},
	{
		"type": "output",
		"data": "a\r\n"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b]633;EnvJson;{\"PATH\":\"C:\\x5c\\x5cProgram Files\\x5c\\x5cWindowsApps\\x5c\\x5cMicrosoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cMicrosoft SDKs\\x5c\\x5cAzure\\x5c\\x5cCLI2\\x5c\\x5cwbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cEclipse Adoptium\\x5c\\x5cjdk-8.0.345.1-hotspot\\x5c\\x5cbin\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cPhysX\\x5c\\x5cCommon\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit LFS\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnu\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cstarship\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cNVIDIA NvDLISR\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGitHub CLI\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cWindows Kits\\x5c\\x5c10\\x5c\\x5cWindows Performance Toolkit\\x5c\\x5c\\x3bC:\\x5c\\x5cProgramData\\x5c\\x5cchocolatey\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cdotnet\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cGpg4win\\x5c\\x5c..\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnodejs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit\\x5c\\x5ccmd\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.cargo\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cPython\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cthemes\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-cli\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cJetBrains\\x5c\\x5cToolbox\\x5c\\x5cscripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cnvs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cMicrosoft Visual Studio\\x5c\\x5c2017\\x5c\\x5cBuildTools\\x5c\\x5cMSBuild\\x5c\\x5c15.0\\x5c\\x5cBin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cBurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\x5c\\x5cripgrep-13.0.0-x86_64-pc-windows-msvc\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cSchniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\\x3bc:\\x5c\\x5cusers\\x5c\\x5cdaniel\\x5c\\x5c.local\\x5c\\x5cbin\\x3bC:\\x5c\\x5cTools\\x5c\\x5cHandle\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code Insiders\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cJulia-1.11.1\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPackages\\x5c\\x5cPythonSoftwareFoundation.Python.3.9_qbz5n2kfra8p0\\x5c\\x5cLocalCache\\x5c\\x5clocal-packages\\x5c\\x5cPython39\\x5c\\x5cScripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cWindsurf\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5ccursor\\x5c\\x5cresources\\x5c\\x5capp\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cnpm\\x3bc:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-oss-dev\\x5c\\x5cUser\\x5c\\x5cglobalStorage\\x5c\\x5cgithub.copilot-chat\\x5c\\x5cdebugCommand\"};d970493f-becd-4c84-a4e9-8d7017bac9af\u0007C:\\Github\\Tyriar\\xterm.js \u001b[93m[\u001b[92mmaster ↑2\u001b[93m]\u001b[m> \u001b]633;P;Prompt=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js \\x1b[93m[\\x1b[39m\\x1b[92mmaster\\x1b[39m\\x1b[92m ↑2\\x1b[39m\\x1b[93m]\\x1b[39m> \u0007\u001b]633;B\u0007"
	},
	{
		"type": "commandDetection.onCommandFinished",
		"commandLine": "echo a"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "commandDetection.onCommandStarted"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93me\u001b[97m\u001b[2m\u001b[3mcho a\u001b[3;41H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "e|cho a"
	},
	{
		"type": "promptInputChange",
		"data": "e|[cho a]"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\bec\u001b[97m\u001b[2m\u001b[3mho a\u001b[3;42H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "ec|[ho a]"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[3;40Hech\u001b[97m\u001b[2m\u001b[3mo a\u001b[3;43H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "ech|[o a]"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[m\u001b[93m\u001b[3;40Hecho\u001b[97m\u001b[2m\u001b[3m a\u001b[3;44H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo|[ a]"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l\u001b[93m\u001b[3;40Hecho \u001b[97m\u001b[2m\u001b[3ma\b\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo |[a]"
	},
	{
		"type": "input",
		"data": "b"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l\u001b[93m\u001b[3;40Hecho \u001b[37mb\u001b[97m\u001b[2m\u001b[3mar\u001b[3;46H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo b|[ar]"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b]633;Completions;0;5;5;[]\u0007"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\u001b[K\r\n\u001b]633;E;echo b;d970493f-becd-4c84-a4e9-8d7017bac9af\u0007"
	},
	{
		"type": "promptInputChange",
		"data": "echo b"
	},
	{
		"type": "promptInputChange",
		"data": "echo b|[]"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": "b\r\n"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "promptInputChange",
		"data": "echo b"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo b"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo b"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b]633;EnvJson;{\"PATH\":\"C:\\x5c\\x5cProgram Files\\x5c\\x5cWindowsApps\\x5c\\x5cMicrosoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cMicrosoft SDKs\\x5c\\x5cAzure\\x5c\\x5cCLI2\\x5c\\x5cwbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cEclipse Adoptium\\x5c\\x5cjdk-8.0.345.1-hotspot\\x5c\\x5cbin\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cPhysX\\x5c\\x5cCommon\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit LFS\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnu\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cstarship\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cNVIDIA NvDLISR\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGitHub CLI\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cWindows Kits\\x5c\\x5c10\\x5c\\x5cWindows Performance Toolkit\\x5c\\x5c\\x3bC:\\x5c\\x5cProgramData\\x5c\\x5cchocolatey\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cdotnet\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cGpg4win\\x5c\\x5c..\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnodejs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit\\x5c\\x5ccmd\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.cargo\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cPython\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cthemes\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-cli\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cJetBrains\\x5c\\x5cToolbox\\x5c\\x5cscripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cnvs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cMicrosoft Visual Studio\\x5c\\x5c2017\\x5c\\x5cBuildTools\\x5c\\x5cMSBuild\\x5c\\x5c15.0\\x5c\\x5cBin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cBurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\x5c\\x5cripgrep-13.0.0-x86_64-pc-windows-msvc\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cSchniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\\x3bc:\\x5c\\x5cusers\\x5c\\x5cdaniel\\x5c\\x5c.local\\x5c\\x5cbin\\x3bC:\\x5c\\x5cTools\\x5c\\x5cHandle\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code Insiders\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cJulia-1.11.1\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPackages\\x5c\\x5cPythonSoftwareFoundation.Python.3.9_qbz5n2kfra8p0\\x5c\\x5cLocalCache\\x5c\\x5clocal-packages\\x5c\\x5cPython39\\x5c\\x5cScripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cWindsurf\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5ccursor\\x5c\\x5cresources\\x5c\\x5capp\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cnpm\\x3bc:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-oss-dev\\x5c\\x5cUser\\x5c\\x5cglobalStorage\\x5c\\x5cgithub.copilot-chat\\x5c\\x5cdebugCommand\"};d970493f-becd-4c84-a4e9-8d7017bac9af\u0007C:\\Github\\Tyriar\\xterm.js \u001b[93m[\u001b[92mmaster ↑2\u001b[93m]\u001b[m> \u001b]633;P;Prompt=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js \\x1b[93m[\\x1b[39m\\x1b[92mmaster\\x1b[39m\\x1b[92m ↑2\\x1b[39m\\x1b[93m]\\x1b[39m> \u0007\u001b]633;B\u0007\u001b]633;Completions\u0007"
	},
	{
		"type": "commandDetection.onCommandFinished",
		"commandLine": "echo b"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "commandDetection.onCommandStarted"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93me\u001b[97m\u001b[2m\u001b[3mcho b\u001b[5;41H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "e|cho b"
	},
	{
		"type": "promptInputChange",
		"data": "e|[cho b]"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\bec\u001b[97m\u001b[2m\u001b[3mho b\u001b[5;42H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "ec|[ho b]"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[5;40Hech\u001b[97m\u001b[2m\u001b[3mo b\u001b[5;43H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "ech|[o b]"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[5;40Hecho\u001b[97m\u001b[2m\u001b[3m b\u001b[5;44H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo|[ b]"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[5;40Hecho \u001b[97m\u001b[2m\u001b[3mb\b\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo |[b]"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93m\u001b[5;40Hecho \u001b[37mc\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "echo c|"
	},
	{
		"type": "sendText",
		"data": "\u001b[24~e"
	},
	{
		"type": "output",
		"data": "\u001b[m\u001b]633;Completions;0;5;5;[]\u0007"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\r\n\u001b]633;E;echo c;d970493f-becd-4c84-a4e9-8d7017bac9af\u0007"
	},
	{
		"type": "promptInputChange",
		"data": "echo c|[]"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "promptInputChange",
		"data": "echo c"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo c"
	},
	{
		"type": "commandDetection.onCommandExecuted",
		"commandLine": "echo c"
	},
	{
		"type": "output",
		"data": "c\r\n"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b]633;EnvJson;{\"PATH\":\"C:\\x5c\\x5cProgram Files\\x5c\\x5cWindowsApps\\x5c\\x5cMicrosoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cMicrosoft SDKs\\x5c\\x5cAzure\\x5c\\x5cCLI2\\x5c\\x5cwbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cEclipse Adoptium\\x5c\\x5cjdk-8.0.345.1-hotspot\\x5c\\x5cbin\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cPhysX\\x5c\\x5cCommon\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit LFS\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnu\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cstarship\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cNVIDIA NvDLISR\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGitHub CLI\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cWindows Kits\\x5c\\x5c10\\x5c\\x5cWindows Performance Toolkit\\x5c\\x5c\\x3bC:\\x5c\\x5cProgramData\\x5c\\x5cchocolatey\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cdotnet\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cGpg4win\\x5c\\x5c..\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnodejs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit\\x5c\\x5ccmd\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.cargo\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cPython\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cthemes\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-cli\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cJetBrains\\x5c\\x5cToolbox\\x5c\\x5cscripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cnvs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cMicrosoft Visual Studio\\x5c\\x5c2017\\x5c\\x5cBuildTools\\x5c\\x5cMSBuild\\x5c\\x5c15.0\\x5c\\x5cBin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cBurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\x5c\\x5cripgrep-13.0.0-x86_64-pc-windows-msvc\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cSchniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\\x3bc:\\x5c\\x5cusers\\x5c\\x5cdaniel\\x5c\\x5c.local\\x5c\\x5cbin\\x3bC:\\x5c\\x5cTools\\x5c\\x5cHandle\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code Insiders\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cJulia-1.11.1\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPackages\\x5c\\x5cPythonSoftwareFoundation.Python.3.9_qbz5n2kfra8p0\\x5c\\x5cLocalCache\\x5c\\x5clocal-packages\\x5c\\x5cPython39\\x5c\\x5cScripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cWindsurf\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5ccursor\\x5c\\x5cresources\\x5c\\x5capp\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cnpm\\x3bc:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-oss-dev\\x5c\\x5cUser\\x5c\\x5cglobalStorage\\x5c\\x5cgithub.copilot-chat\\x5c\\x5cdebugCommand\"};d970493f-becd-4c84-a4e9-8d7017bac9af\u0007C:\\Github\\Tyriar\\xterm.js \u001b[93m[\u001b[92mmaster ↑2\u001b[93m]\u001b[m> \u001b]633;P;Prompt=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js \\x1b[93m[\\x1b[39m\\x1b[92mmaster\\x1b[39m\\x1b[92m ↑2\\x1b[39m\\x1b[93m]\\x1b[39m> \u0007\u001b]633;B\u0007"
	},
	{
		"type": "commandDetection.onCommandFinished",
		"commandLine": "echo c"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "commandDetection.onCommandStarted"
	}
];
