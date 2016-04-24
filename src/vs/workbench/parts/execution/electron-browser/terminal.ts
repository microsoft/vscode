/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs = require('fs');
import env = require('vs/base/common/platform');

// If the system is not debian but is on gnome, use gnome-terminal
export const DEFAULT_TERMINAL_LINUX = (env.isLinux && !fs.existsSync('/etc/debian_version') && process.env.DESKTOP_SESSION === 'gnome') ? 'gnome-terminal' : 'x-terminal-emulator';

export const DEFAULT_TERMINAL_WINDOWS = 'cmd';

export interface ITerminalConfiguration {
	externalTerminal: {
		linuxExec: string,
		windowsExec: string
	};
}
