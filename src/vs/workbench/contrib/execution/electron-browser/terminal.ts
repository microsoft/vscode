/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as env from 'vs/base/common/platform';
import * as pfs from 'vs/base/node/pfs';

let _DEFAULT_TERMINAL_LINUX_READY: Promise<string> | null = null;
export function getDefaultTerminalLinuxReady(): Promise<string> {
	if (!_DEFAULT_TERMINAL_LINUX_READY) {
		_DEFAULT_TERMINAL_LINUX_READY = new Promise<string>(c => {
			if (env.isLinux) {
				Promise.all([pfs.exists('/etc/debian_version'), process.lazyEnv || Promise.resolve(undefined)]).then(([isDebian]) => {
					if (isDebian) {
						c('x-terminal-emulator');
					} else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
						c('gnome-terminal');
					} else if (process.env.DESKTOP_SESSION === 'kde-plasma') {
						c('konsole');
					} else if (process.env.COLORTERM) {
						c(process.env.COLORTERM);
					} else if (process.env.TERM) {
						c(process.env.TERM);
					} else {
						c('xterm');
					}
				});
				return;
			}

			c('xterm');
		});
	}
	return _DEFAULT_TERMINAL_LINUX_READY;
}

export const DEFAULT_TERMINAL_OSX = 'Terminal.app';

let _DEFAULT_TERMINAL_WINDOWS: string | null = null;
export function getDefaultTerminalWindows(): string {
	if (!_DEFAULT_TERMINAL_WINDOWS) {
		const isWoW64 = !!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		_DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : 'C:\\Windows'}\\${isWoW64 ? 'Sysnative' : 'System32'}\\cmd.exe`;
	}
	return _DEFAULT_TERMINAL_WINDOWS;
}

export interface ITerminalConfiguration {
	terminal: {
		explorerKind: 'integrated' | 'external',
		external: {
			linuxExec: string,
			osxExec: string,
			windowsExec: string
		}
	};
}
