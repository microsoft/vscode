/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as processes from 'vs/base/node/processes';
import { readFile, fileExists } from 'vs/base/node/pfs';
import { Event } from 'vs/base/common/event';

/**
 * An interface representing a raw terminal child process, this is a subset of the
 * child_process.ChildProcess node.js interface.
 */
export interface ITerminalChildProcess {
	onProcessData: Event<string>;
	onProcessExit: Event<number>;
	onProcessIdReady: Event<number>;
	onProcessTitleChanged: Event<string>;

	/**
	 * Shutdown the terminal process.
	 *
	 * @param immediate When true the process will be killed immediately, otherwise the process will
	 * be given some time to make sure no additional data comes through.
	 */
	shutdown(immediate: boolean): void;
	input(data: string): void;
	resize(cols: number, rows: number): void;
}

let _TERMINAL_DEFAULT_SHELL_UNIX_LIKE: string = null;
export function getTerminalDefaultShellUnixLike(): string {
	if (!_TERMINAL_DEFAULT_SHELL_UNIX_LIKE) {
		let unixLikeTerminal = 'sh';
		if (!platform.isWindows && process.env.SHELL) {
			unixLikeTerminal = process.env.SHELL;
			// Some systems have $SHELL set to /bin/false which breaks the terminal
			if (unixLikeTerminal === '/bin/false') {
				unixLikeTerminal = '/bin/bash';
			}
		}
		_TERMINAL_DEFAULT_SHELL_UNIX_LIKE = unixLikeTerminal;
	}
	return _TERMINAL_DEFAULT_SHELL_UNIX_LIKE;
}

let _TERMINAL_DEFAULT_SHELL_WINDOWS: string = null;
export function getTerminalDefaultShellWindows(): string {
	if (!_TERMINAL_DEFAULT_SHELL_WINDOWS) {
		const isAtLeastWindows10 = platform.isWindows && parseFloat(os.release()) >= 10;
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const powerShellPath = `${process.env.windir}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}\\WindowsPowerShell\\v1.0\\powershell.exe`;
		_TERMINAL_DEFAULT_SHELL_WINDOWS = isAtLeastWindows10 ? powerShellPath : processes.getWindowsShell();
	}
	return _TERMINAL_DEFAULT_SHELL_WINDOWS;
}

if (platform.isLinux) {
	const file = '/etc/os-release';
	fileExists(file).then(exists => {
		if (!exists) {
			return;
		}
		readFile(file).then(b => {
			const contents = b.toString();
			if (contents.indexOf('NAME=Fedora') >= 0) {
				isFedora = true;
			}
		});
	});
}

export let isFedora = false;