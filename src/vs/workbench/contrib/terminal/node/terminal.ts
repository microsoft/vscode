/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as processes from 'vs/base/node/processes';
import { readFile, fileExists } from 'vs/base/node/pfs';
import { LinuxDistro } from 'vs/workbench/contrib/terminal/common/terminal';

export function getDefaultShell(p: platform.Platform): string {
	if (p === platform.Platform.Windows) {
		if (platform.isWindows) {
			return getTerminalDefaultShellWindows();
		}
		// Don't detect Windows shell when not on Windows
		return processes.getWindowsShell();
	}
	// Only use $SHELL for the current OS
	if (platform.isLinux && p === platform.Platform.Mac || platform.isMacintosh && p === platform.Platform.Linux) {
		return '/bin/bash';
	}
	return getTerminalDefaultShellUnixLike();
}

let _TERMINAL_DEFAULT_SHELL_UNIX_LIKE: string | null = null;
function getTerminalDefaultShellUnixLike(): string {
	if (!_TERMINAL_DEFAULT_SHELL_UNIX_LIKE) {
		let unixLikeTerminal = 'sh';
		if (!platform.isWindows && process.env.SHELL) {
			unixLikeTerminal = process.env.SHELL;
			// Some systems have $SHELL set to /bin/false which breaks the terminal
			if (unixLikeTerminal === '/bin/false') {
				unixLikeTerminal = '/bin/bash';
			}
		}
		if (platform.isWindows) {
			unixLikeTerminal = '/bin/bash'; // for WSL
		}
		_TERMINAL_DEFAULT_SHELL_UNIX_LIKE = unixLikeTerminal;
	}
	return _TERMINAL_DEFAULT_SHELL_UNIX_LIKE;
}

let _TERMINAL_DEFAULT_SHELL_WINDOWS: string | null = null;
function getTerminalDefaultShellWindows(): string {
	if (!_TERMINAL_DEFAULT_SHELL_WINDOWS) {
		const isAtLeastWindows10 = platform.isWindows && parseFloat(os.release()) >= 10;
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const powerShellPath = `${process.env.windir}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}\\WindowsPowerShell\\v1.0\\powershell.exe`;
		_TERMINAL_DEFAULT_SHELL_WINDOWS = isAtLeastWindows10 ? powerShellPath : processes.getWindowsShell();
	}
	return _TERMINAL_DEFAULT_SHELL_WINDOWS;
}

let detectedDistro = LinuxDistro.Unknown;
if (platform.isLinux) {
	const file = '/etc/os-release';
	fileExists(file).then(exists => {
		if (!exists) {
			return;
		}
		readFile(file).then(b => {
			const contents = b.toString();
			if (/NAME="?Fedora"?/.test(contents)) {
				detectedDistro = LinuxDistro.Fedora;
			} else if (/NAME="?Ubuntu"?/.test(contents)) {
				detectedDistro = LinuxDistro.Ubuntu;
			}
		});
	});
}

export const linuxDistro = detectedDistro;

export function getWindowsBuildNumber(): number {
	const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
	let buildNumber: number = 0;
	if (osVersion && osVersion.length === 4) {
		buildNumber = parseInt(osVersion[3]);
	}
	return buildNumber;
}
