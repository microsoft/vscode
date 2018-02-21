/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import env = require('vs/base/common/platform');
import * as pfs from 'vs/base/node/pfs';
import { TPromise } from 'vs/base/common/winjs.base';

let _DEFAULT_TERMINAL_LINUX_READY: TPromise<string> = null;
export function getDefaultTerminalLinuxReady(): TPromise<string> {
	if (!_DEFAULT_TERMINAL_LINUX_READY) {
		_DEFAULT_TERMINAL_LINUX_READY = new TPromise<string>(c => {
			if (env.isLinux) {
				TPromise.join([pfs.exists('/etc/debian_version'), process.lazyEnv]).then(([isDebian]) => {
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

let _DEFAULT_TERMINAL_WINDOWS: string = null;
export function getDefaultTerminalWindows(): string {
	if (!_DEFAULT_TERMINAL_WINDOWS) {
		_DEFAULT_TERMINAL_WINDOWS = `${process.env.windir}\\${process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432') ? 'Sysnative' : 'System32'}\\cmd.exe`;
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
