/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import { ILogService } from 'vs/platform/log/common/log';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';

export function escapeNonWindowsPath(path: string): string {
	let newPath = path;
	if (newPath.indexOf('\\') !== 0) {
		newPath = newPath.replace(/\\/g, '\\\\');
	}
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<\"\']/g;
	newPath = newPath.replace(bannedChars, '');
	return `'${newPath}'`;
}

export function injectShellIntegrationArgs(logService: ILogService, enableShellIntegration: boolean, shellLaunchConfig: IShellLaunchConfig, isBackendWindows?: boolean): { args: string | string[] | undefined, enableShellIntegration: boolean } {
	// Shell integration arg injection is disabled when:
	// - The global setting is disabled
	// - There is no executable (not sure what script to run)
	// - The terminal is used by a feature like tasks or debugging
	if (!enableShellIntegration || !shellLaunchConfig.executable || shellLaunchConfig.isFeatureTerminal) {
		return { args: shellLaunchConfig.args, enableShellIntegration: false };
	}
	const loginArgs = ['-login', '-l'];
	const pwshImpliedArgs = ['-nol', '-nologo'];
	const originalArgs = shellLaunchConfig.args;
	const shell = basename(shellLaunchConfig.executable);
	let newArgs: string | string[] | undefined;
	if (isBackendWindows) {
		if (shell === 'pwsh' && !originalArgs || originalArgs === [] || (originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase()))) {
			newArgs = [
				'-noexit',
				'-command',
				'. \"${execInstallFolder}\\out\\vs\\workbench\\contrib\\terminal\\browser\\media\\shellIntegration.ps1\"'
			];
		} else if (originalArgs?.length === 1 && loginArgs.includes(originalArgs[0].toLowerCase())) {
			newArgs = [
				originalArgs[0],
				'-noexit',
				'-command',
				'. \"${execInstallFolder}\\out\\vs\\workbench\\contrib\\terminal\\browser\\media\\shellIntegration.ps1\"'
			];
		} else {
			logService.warn(`Shell integration cannot be enabled with custom args ${originalArgs} are provided for ${shell} on Windows.`);
		}
	} else {
		switch (shell) {
			case 'bash':
				if (!originalArgs || originalArgs === []) {
					//TODO: support login args
					newArgs = ['--init-file', '${execInstallFolder}/out/vs/workbench/contrib/terminal/browser/media/ShellIntegration-bash.sh'];
				}
				break;
			case 'pwsh':
				if (!originalArgs || originalArgs === [] || (originalArgs.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase()))) {
					newArgs = ['-noexit', '-command', '. "${execInstallFolder}/out/vs/workbench/contrib/terminal/browser/media/shellIntegration.ps1"'];
				} else if (originalArgs.length === 1 && loginArgs.includes(originalArgs[0].toLowerCase())) {
					newArgs = [originalArgs[0], '-noexit', '-command', '. "${execInstallFolder}/out/vs/workbench/contrib/terminal/browser/media/shellIntegration.ps1"'];
				}
				break;
			case 'zsh':
				if (!originalArgs || originalArgs === []) {
					newArgs = ['-c', '"${execInstallFolder}/out/vs/workbench/contrib/terminal/browser/media/ShellIntegration-zsh.sh"; zsh -i'];
				} else if (originalArgs.length === 1 && loginArgs.includes(originalArgs[0].toLowerCase())) {
					newArgs = ['-c', '"${execInstallFolder}/out/vs/workbench/contrib/terminal/browser/media/ShellIntegration-zsh.sh"; zsh -il'];
				}
				break;
		}
		if (!newArgs) {
			logService.warn(`Shell integration cannot be enabled when custom args ${originalArgs} are provided for ${shell}.`);
		}
	}
	return { args: newArgs || originalArgs, enableShellIntegration: newArgs !== undefined };
}
