/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */

// Windows 24H2
// PowerShell 7.5.2
// Steps:
// - Open terminal
// - Type foo
export const events = [
	{
		"type": "resize",
		"cols": 167,
		"rows": 22
	},
	{
		"type": "output",
		"data": "\u001b[?9001h\u001b[?1004h"
	},
	{
		"type": "input",
		"data": "\u001b[I"
	},
	{
		"type": "output",
		"data": "\u001b[?25l\u001b[2J\u001b[m\u001b[H\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\u001b[H\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\u0007\u001b[?25h"
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
		"type": "command",
		"id": "_setContext"
	},
	{
		"type": "output",
		"data": "\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\pwsh.exe \u0007\u001b]0;xterm.js [master] - PowerShell 7.5 (24772)\u0007\u001b]633;A\u0007\u001b]633;P;Cwd=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js\u0007\u001b]633;EnvJson;{\"PATH\":\"C:\\x5c\\x5cProgram Files\\x5c\\x5cWindowsApps\\x5c\\x5cMicrosoft.PowerShell_7.5.2.0_x64__8wekyb3d8bbwe\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cMicrosoft SDKs\\x5c\\x5cAzure\\x5c\\x5cCLI2\\x5c\\x5cwbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cEclipse Adoptium\\x5c\\x5cjdk-8.0.345.1-hotspot\\x5c\\x5cbin\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cPhysX\\x5c\\x5cCommon\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit LFS\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnu\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cstarship\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5csystem32\\x3bC:\\x5c\\x5cWINDOWS\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWbem\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cWindowsPowerShell\\x5c\\x5cv1.0\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cNVIDIA Corporation\\x5c\\x5cNVIDIA NvDLISR\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGitHub CLI\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cWindows Kits\\x5c\\x5c10\\x5c\\x5cWindows Performance Toolkit\\x5c\\x5c\\x3bC:\\x5c\\x5cProgramData\\x5c\\x5cchocolatey\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cdotnet\\x5c\\x5c\\x3bC:\\x5c\\x5cWINDOWS\\x5c\\x5cSystem32\\x5c\\x5cOpenSSH\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cGpg4win\\x5c\\x5c..\\x5c\\x5cGnuPG\\x5c\\x5cbin\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cnodejs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files\\x5c\\x5cGit\\x5c\\x5ccmd\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython312\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.cargo\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cPython\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5cScripts\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cPython\\x5c\\x5cPython310\\x5c\\x5c\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5coh-my-posh\\x5c\\x5cthemes\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-cli\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWindowsApps\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cJetBrains\\x5c\\x5cToolbox\\x5c\\x5cscripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cnvs\\x5c\\x5c\\x3bC:\\x5c\\x5cProgram Files (x86)\\x5c\\x5cMicrosoft Visual Studio\\x5c\\x5c2017\\x5c\\x5cBuildTools\\x5c\\x5cMSBuild\\x5c\\x5c15.0\\x5c\\x5cBin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cBurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\x5c\\x5cripgrep-13.0.0-x86_64-pc-windows-msvc\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cMicrosoft\\x5c\\x5cWinGet\\x5c\\x5cPackages\\x5c\\x5cSchniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\\x3bc:\\x5c\\x5cusers\\x5c\\x5cdaniel\\x5c\\x5c.local\\x5c\\x5cbin\\x3bC:\\x5c\\x5cTools\\x5c\\x5cHandle\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code Insiders\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cJulia-1.11.1\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cMicrosoft VS Code\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPackages\\x5c\\x5cPythonSoftwareFoundation.Python.3.9_qbz5n2kfra8p0\\x5c\\x5cLocalCache\\x5c\\x5clocal-packages\\x5c\\x5cPython39\\x5c\\x5cScripts\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5cWindsurf\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cLocal\\x5c\\x5cPrograms\\x5c\\x5ccursor\\x5c\\x5cresources\\x5c\\x5capp\\x5c\\x5cbin\\x3bC:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5cAppData\\x5c\\x5cRoaming\\x5c\\x5cnpm\\x3bc:\\x5c\\x5cUsers\\x5c\\x5cDaniel\\x5c\\x5c.vscode-oss-dev\\x5c\\x5cUser\\x5c\\x5cglobalStorage\\x5c\\x5cgithub.copilot-chat\\x5c\\x5cdebugCommand\"};4638516d-26e2-4016-9298-62b0ddca0bd6\u0007C:\\Github\\Tyriar\\xterm.js \u001b[93m[\u001b[92mmaster ↑2\u001b[93m]\u001b[m> \u001b]633;P;Prompt=C:\\x5cGithub\\x5cTyriar\\x5cxterm.js \\x1b[93m[\\x1b[39m\\x1b[92mmaster\\x1b[39m\\x1b[92m ↑2\\x1b[39m\\x1b[93m]\\x1b[39m> \u0007\u001b]633;B\u0007"
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
		"data": "f"
	},
	{
		"type": "output",
		"data": "\u001b[?25l"
	},
	{
		"type": "output",
		"data": "\u001b[93mf\u001b[97m\u001b[2m\u001b[3mor ($i=40; $i -le 101; $i++) { $branch = \"origin/release/1.$i\"; if (git rev-parse --verify $branch 2>$null) { $count = git rev-list --count --first-parent $branch \"^main\" 2>$null; if ($count) { Write-Host \"release/1.$i : $count first-parent commits\" } else { Write-Host \"release/1.$i : 0 first-parent commits\" } } else { Write-Host \"release/1.$i : branch not found\" } }\u001b[1;41H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "f|or ($i=40; $i -le 101; $i++) { $branch = \"origin/release/1.$i\"; if (git rev-parse --verify $branch 2>$null) { $count = git rev-list --count --first-parent $branch \"^main\" 2>$null; if ($count) { Write-Host \"release/1.$i : $count first-parent commits\" } else { Write-Host \"release/1.$i : 0 first-parent commits\" } } else { Write-Host \"release/1.$i : branch not found\" } }"
	},
	{
		"type": "promptInputChange",
		"data": "f|[or ($i=40; $i -le 101; $i++) { $branch = \"origin/release/1.$i\"; if (git rev-parse --verify $branch 2>$null) { $count = git rev-list --count --first-parent $branch \"^main\" 2>$null; if ($count) { Write-Host \"release/1.$i : $count first-parent commits\" } else { Write-Host \"release/1.$i : 0 first-parent commits\" } } else { Write-Host \"release/1.$i : branch not found\" } }]"
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
		"data": "\u001b[93m\bfo\u001b[97m\u001b[2m\u001b[3mr ($i=40; $i -le 101; $i++) { $branch = \"origin/release/1.$i\"; if (git rev-parse --verify $branch 2>$null) { $count = git rev-list --count --first-parent $branch \"^main\" 2>$null; if ($count) { Write-Host \"release/1.$i : $count first-parent commits\" } else { Write-Host \"release/1.$i : 0 first-parent commits\" } } else { Write-Host \"release/1.$i : branch not found\" } }\u001b[1;42H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "fo|[r ($i=40; $i -le 101; $i++) { $branch = \"origin/release/1.$i\"; if (git rev-parse --verify $branch 2>$null) { $count = git rev-list --count --first-parent $branch \"^main\" 2>$null; if ($count) { Write-Host \"release/1.$i : $count first-parent commits\" } else { Write-Host \"release/1.$i : 0 first-parent commits\" } } else { Write-Host \"release/1.$i : branch not found\" } }]"
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
		"data": "\u001b[93m\u001b[1;40Hfoo                                                                                                                             \u001b[m                                                                                                                                                                       \r\n\u001b[75X\u001b[1;43H\u001b[?25h"
	},
	{
		"type": "promptInputChange",
		"data": "foo|"
	}
]
