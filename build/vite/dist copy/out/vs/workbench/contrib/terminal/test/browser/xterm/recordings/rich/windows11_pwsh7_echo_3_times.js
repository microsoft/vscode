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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93czExX3B3c2g3X2VjaG9fM190aW1lcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9yZWNvcmRpbmdzL3JpY2gvd2luZG93czExX3B3c2g3X2VjaG9fM190aW1lcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxvQkFBb0I7QUFFcEIsZUFBZTtBQUNmLG1CQUFtQjtBQUNuQixTQUFTO0FBQ1Qsa0JBQWtCO0FBQ2xCLGdCQUFnQjtBQUNoQixnQkFBZ0I7QUFDaEIsZ0JBQWdCO0FBQ2hCLGdCQUFnQjtBQUNoQixnQkFBZ0I7QUFDaEIsZ0JBQWdCO0FBQ2hCLE1BQU0sQ0FBQyxNQUFNLE1BQU0sR0FBRztJQUNyQjtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO1FBQ1gsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLCtRQUErUTtLQUN2UjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsVUFBVTtLQUNsQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9TQUFvUztLQUM1UztJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHVGQUF1RjtLQUMvRjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLDRFQUE0RTtLQUNwRjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHV6TEFBdXpMO0tBQy96TDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUNBQW1DO0tBQzNDO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsU0FBUztRQUNqQixJQUFJLEVBQUUsYUFBYTtLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsYUFBYTtLQUNyQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFFQUFxRTtLQUM3RTtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsU0FBUztLQUNqQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUscUJBQXFCO0tBQzdCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsdUVBQXVFO0tBQy9FO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFCQUFxQjtLQUM3QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLGlGQUFpRjtLQUN6RjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsMEZBQTBGO0tBQ2xHO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxxQkFBcUI7S0FDN0I7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSw2RkFBNkY7S0FDckc7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLGFBQWE7S0FDckI7SUFDRDtRQUNDLE1BQU0sRUFBRSxVQUFVO1FBQ2xCLE1BQU0sRUFBRSxhQUFhO0tBQ3JCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsK0NBQStDO0tBQ3ZEO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxJQUFJO0tBQ1o7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxVQUFVO0tBQ2xCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxTQUFTO0tBQ2pCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsb0VBQW9FO0tBQzVFO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsb0JBQW9CO0tBQzVCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsRUFBRTtLQUNWO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxRQUFRO0tBQ2hCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsb0NBQW9DO1FBQzVDLGFBQWEsRUFBRSxRQUFRO0tBQ3ZCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsb0NBQW9DO1FBQzVDLGFBQWEsRUFBRSxRQUFRO0tBQ3ZCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsT0FBTztLQUNmO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsRUFBRTtLQUNWO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsc0JBQXNCO0tBQzlCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUscXBMQUFxcEw7S0FDN3BMO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsb0NBQW9DO1FBQzVDLGFBQWEsRUFBRSxRQUFRO0tBQ3ZCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQ0FBbUM7S0FDM0M7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLGFBQWE7S0FDckI7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxxRUFBcUU7S0FDN0U7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFNBQVM7S0FDakI7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFdBQVc7S0FDbkI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFCQUFxQjtLQUM3QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHVFQUF1RTtLQUMvRTtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUscUJBQXFCO0tBQzdCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsaUZBQWlGO0tBQ3pGO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxvR0FBb0c7S0FDNUc7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFdBQVc7S0FDbkI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLDBGQUEwRjtLQUNsRztJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsZ0hBQWdIO0tBQ3hIO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxhQUFhO0tBQ3JCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsVUFBVTtRQUNsQixNQUFNLEVBQUUsYUFBYTtLQUNyQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLCtDQUErQztLQUN2RDtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsSUFBSTtLQUNaO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsNEVBQTRFO0tBQ3BGO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxRQUFRO0tBQ2hCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsb0JBQW9CO0tBQzVCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsT0FBTztLQUNmO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsVUFBVTtRQUNsQixNQUFNLEVBQUUsYUFBYTtLQUNyQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsUUFBUTtLQUNoQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHNCQUFzQjtLQUM5QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLGlyTEFBaXJMO0tBQ3pyTDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUNBQW1DO0tBQzNDO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxhQUFhO0tBQ3JCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUscUVBQXFFO0tBQzdFO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxTQUFTO0tBQ2pCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxxQkFBcUI7S0FDN0I7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSx1RUFBdUU7S0FDL0U7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFdBQVc7S0FDbkI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFCQUFxQjtLQUM3QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLGlGQUFpRjtLQUN6RjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUscUJBQXFCO0tBQzdCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsaUZBQWlGO0tBQ3pGO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxXQUFXO0tBQ25CO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxxQkFBcUI7S0FDN0I7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSx1RUFBdUU7S0FDL0U7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFdBQVc7S0FDbkI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFCQUFxQjtLQUM3QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG1EQUFtRDtLQUMzRDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsU0FBUztLQUNqQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFVBQVU7UUFDbEIsTUFBTSxFQUFFLGFBQWE7S0FDckI7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSwrQ0FBK0M7S0FDdkQ7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9FQUFvRTtLQUM1RTtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsV0FBVztLQUNuQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9CQUFvQjtLQUM1QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsUUFBUTtLQUNoQjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLE9BQU87S0FDZjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHNCQUFzQjtLQUM5QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFwTEFBcXBMO0tBQzdwTDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG9DQUFvQztRQUM1QyxhQUFhLEVBQUUsUUFBUTtLQUN2QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUNBQW1DO0tBQzNDO0NBQ0QsQ0FBQyJ9