/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SettingsIds {
	SuggestPrefix = 'terminal.integrated.suggest',
	CachedWindowsExecutableExtensions = 'terminal.integrated.suggest.windowsExecutableExtensions',
	CachedWindowsExecutableExtensionsSuffixOnly = 'windowsExecutableExtensions',
}

export const enum TerminalShellType {
	Bash = 'bash',
	Fish = 'fish',
	Zsh = 'zsh',
	PowerShell = 'pwsh',
	WindowsPowerShell = 'powershell',
	GitBash = 'gitbash',
}
