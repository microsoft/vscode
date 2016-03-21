/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs = require('fs');
import env = require('vs/base/common/platform');

export let defaultLinuxTerm = 'x-terminal-emulator';

// if we're not on debian and using gnome then
// set default to gnome-terminal
if (env.isLinux
	&& fs.existsSync('/etc/debian_version') === false
	&& process.env.DESKTOP_SESSION === 'gnome') {
	defaultLinuxTerm = 'gnome-terminal';
}

export const defaultWindowsTerm = 'cmd';