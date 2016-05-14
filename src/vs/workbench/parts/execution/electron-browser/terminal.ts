/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs = require('fs');
import env = require('vs/base/common/platform');

let defaultTerminalLinux = 'xterm';
if (env.isLinux) {
	if (fs.existsSync('/etc/debian_version')) {
		defaultTerminalLinux = 'x-terminal-emulator';
	} else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
		defaultTerminalLinux = 'gnome-terminal';
	}
}

export const DEFAULT_TERMINAL_LINUX = defaultTerminalLinux;

export const DEFAULT_TERMINAL_WINDOWS = 'cmd';

export interface ITerminalConfiguration {
	externalTerminal: {
		linuxExec: string,
		windowsExec: string
	};
}
