/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as processes from 'vs/base/node/processes';

/**
 * Gets the detected default shell for the _system_, not to be confused with VS Code's _default_
 * shell that the terminal uses by default.
 * @param p The platform to detect the shell of.
 */
export function getSystemShell(p: platform.Platform, env = process.env as platform.IProcessEnvironment): string {
	if (p === platform.Platform.Windows) {
		if (platform.isWindows) {
			return getSystemShellWindows(env);
		}
		// Don't detect Windows shell when not on Windows
		return processes.getWindowsShell(env);
	}
	// Only use $SHELL for the current OS
	if (platform.isLinux && p === platform.Platform.Mac || platform.isMacintosh && p === platform.Platform.Linux) {
		return '/bin/bash';
	}
	return getSystemShellUnixLike(env);
}

let _TERMINAL_DEFAULT_SHELL_UNIX_LIKE: string | null = null;
function getSystemShellUnixLike(env: platform.IProcessEnvironment): string {
	if (!_TERMINAL_DEFAULT_SHELL_UNIX_LIKE) {
		let unixLikeTerminal: string;
		if (platform.isWindows) {
			unixLikeTerminal = '/bin/bash'; // for WSL
		} else {
			unixLikeTerminal = env['SHELL'];

			if (!unixLikeTerminal) {
				try {
					// It's possible for $SHELL to be unset, this API reads /etc/passwd. See https://github.com/github/codespaces/issues/1639
					// Node docs: "Throws a SystemError if a user has no username or homedir."
					unixLikeTerminal = os.userInfo().shell;
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
function getSystemShellWindows(env: platform.IProcessEnvironment): string {
	if (!_TERMINAL_DEFAULT_SHELL_WINDOWS) {
		const isAtLeastWindows10 = platform.isWindows && parseFloat(os.release()) >= 10;
		const is32ProcessOn64Windows = env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const powerShellPath = `${env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}\\WindowsPowerShell\\v1.0\\powershell.exe`;
		_TERMINAL_DEFAULT_SHELL_WINDOWS = isAtLeastWindows10 ? powerShellPath : processes.getWindowsShell(env);
	}
	return _TERMINAL_DEFAULT_SHELL_WINDOWS;
}
