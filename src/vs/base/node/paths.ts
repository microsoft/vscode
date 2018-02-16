/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import pkg from 'vs/platform/node/package';

// TODO@snapshot: duplicated in paths.js
export function getAppDataPath(platform: string): string {
	switch (platform) {
		case 'win32': return process.env['VSCODE_APPDATA'] || process.env['APPDATA'] || path.join(process.env['USERPROFILE'], 'AppData', 'Roaming');
		case 'darwin': return process.env['VSCODE_APPDATA'] || path.join(os.homedir(), 'Library', 'Application Support');
		case 'linux': return process.env['VSCODE_APPDATA'] || process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
		default: throw new Error('Platform not supported');
	}
}

// TODO@snapshot: duplicated in paths.js
export function getDefaultUserDataPath(platform: string): string {
	return path.join(getAppDataPath(platform), pkg.name);
}
