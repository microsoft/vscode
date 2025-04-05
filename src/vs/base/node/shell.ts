/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { userInfo } from 'os';
import * as platform from '../common/platform.js';
import { getFirstAvailablePowerShellInstallation } from './powershell.js';
import * as processes from './processes.js';

/**
 * Gets the detected default shell for the _system_, not to be confused with VS Code's _default_
 * shell that the terminal uses by default.
 * @param os The platform to detect the shell of.
 */
export async function getSystemShell(os: platform.OperatingSystem, env: platform.IProcessEnvironment): Promise<string> {
	if (os === platform.OperatingSystem.Windows) {
		if (platform.isWindows) {
			return getSystemShellWindows();
		}
		// Don't detect Windows shell when not on Windows
		return processes.getWindowsShell(env);
	}

	return getSystemShellUnixLike(os, env);
}

let _TERMINAL_DEFAULT_SHELL_UNIX_LIKE: string | null = null;
function getSystemShellUnixLike(os: platform.OperatingSystem, env: platform.IProcessEnvironment): string {
	// Only use $SHELL for the current OS
	if (platform.isLinux && os === platform.OperatingSystem.Macintosh || platform.isMacintosh && os === platform.OperatingSystem.Linux) {
		return '/bin/bash';
	}

	if (!_TERMINAL_DEFAULT_SHELL_UNIX_LIKE) {
		let unixLikeTerminal: string | undefined | null;
		if (platform.isWindows) {
			unixLikeTerminal = '/bin/bash'; // for WSL
		} else {
			unixLikeTerminal = env['SHELL'];

			if (!unixLikeTerminal) {
				try {
					// It's possible for $SHELL to be unset, this API reads /etc/passwd. See https://github.com/github/codespaces/issues/1639
					// Node docs: "Throws a SystemError if a user has no username or homedir."
					unixLikeTerminal = userInfo().shell;
				} catch (err) { }
			}

			if (!unixLikeTerminal) {
				unixLikeTerminal = 'sh';
			}

			// Some systems have $SHELL set to /bin/false which breaks the terminal
			if (unixLikeTerminal === '/bin/false') {
				unixLikeTerminal = '/bin/bash';
			}
		}
		_TERMINAL_DEFAULT_SHELL_UNIX_LIKE = unixLikeTerminal;
	}
	return _TERMINAL_DEFAULT_SHELL_UNIX_LIKE;
}

let _TERMINAL_DEFAULT_SHELL_WINDOWS: string | null = null;
async function getSystemShellWindows(): Promise<string> {
	if (!_TERMINAL_DEFAULT_SHELL_WINDOWS) {
		_TERMINAL_DEFAULT_SHELL_WINDOWS = (await getFirstAvailablePowerShellInstallation())!.exePath;
	}
	return _TERMINAL_DEFAULT_SHELL_WINDOWS;
}
