/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { TerminalShellType, WindowsShellType } from 'vs/platform/terminal/common/terminal';

export function escapeNonWindowsPath(path: string): string {
	let newPath = path;
	if (newPath.indexOf('\\') !== 0) {
		newPath = newPath.replace(/\\/g, '\\\\');
	}
	const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<\"\']/g;
	newPath = newPath.replace(bannedChars, '');
	return `'${newPath}'`;
}

/**
 * Takes a path and returns the properly escaped path to send to a given shell. On Windows, this
 * included trying to prepare the path for WSL if needed.
 *
 * @param originalPath The path to be escaped and formatted.
 * @param executable The executable off the shellLaunchConfig.
 * @param title The terminal's title.
 * @param shellType The type of shell the path is being sent to.
 * @param getWslPath A callback to convert a path to its WSL version.
 * @returns An escaped version of the path to be execuded in the terminal.
 */
export async function preparePathForShell(originalPath: string, executable: string | undefined, title: string, shellType: TerminalShellType, getWslPath: ((original: string) => Promise<string> | undefined) | undefined): Promise<string> {
	return new Promise<string>(c => {
		if (!executable) {
			c(originalPath);
			return;
		}

		const hasSpace = originalPath.indexOf(' ') !== -1;
		const hasParens = originalPath.indexOf('(') !== -1 || originalPath.indexOf(')') !== -1;

		const pathBasename = basename(executable, '.exe');
		const isPowerShell = pathBasename === 'pwsh' ||
			title === 'pwsh' ||
			pathBasename === 'powershell' ||
			title === 'powershell';

		if (isPowerShell && (hasSpace || originalPath.indexOf('\'') !== -1)) {
			c(`& '${originalPath.replace(/'/g, '\'\'')}'`);
			return;
		}

		if (hasParens && isPowerShell) {
			c(`& '${originalPath}'`);
			return;
		}

		// TODO: This should use the process manager's OS, not the local OS
		if (isWindows) {
			// 17063 is the build number where wsl path was introduced.
			// Update Windows uriPath to be executed in WSL.
			if (shellType !== undefined) {
				if (shellType === WindowsShellType.GitBash) {
					c(originalPath.replace(/\\/g, '/'));
				}
				else if (shellType === WindowsShellType.Wsl) {
					c(getWslPath?.(originalPath) || originalPath);
				}

				else if (hasSpace) {
					c('"' + originalPath + '"');
				} else {
					c(originalPath);
				}
			} else {
				const lowerExecutable = executable.toLowerCase();
				if (lowerExecutable.indexOf('wsl') !== -1 || (lowerExecutable.indexOf('bash.exe') !== -1 && lowerExecutable.toLowerCase().indexOf('git') === -1)) {
					c(getWslPath?.(originalPath) || originalPath);
				} else if (hasSpace) {
					c('"' + originalPath + '"');
				} else {
					c(originalPath);
				}
			}

			return;
		}

		c(escapeNonWindowsPath(originalPath));
	});
}
