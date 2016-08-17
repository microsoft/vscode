/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as path from 'path';
import * as os  from 'os';

interface IPaths {
	getAppDataPath(platform: string): string;
	getUserDataPath(platform: string, appName: string, args: string[]): string;
}

function defaultGetAppDataPath(platform) {
	switch (platform) {
		case 'win32': return process.env['APPDATA'];
		case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support');
		case 'linux': return process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
		default: throw new Error('Platform not supported');
	}
}

function defaultGetUserDataPath(platform, appName) {
	return path.join(getAppDataPath(platform), appName);
}

let _getAppDataPath: (platform: string) => string;
let _getUserDataPath: (platform: string, appName: string, args: string[]) => string;

try {
	const pathsPath = uri.parse(require.toUrl('paths')).fsPath;
	const paths = require.__$__nodeRequire<IPaths>(pathsPath);

	_getAppDataPath = paths.getAppDataPath;
	_getUserDataPath = paths.getUserDataPath;
} catch (error) {
	_getAppDataPath = (platform) => defaultGetAppDataPath(platform);
	_getUserDataPath = (platform: string, appName: string, args: string[]) => defaultGetUserDataPath(platform, appName);
}

export const getAppDataPath = _getAppDataPath;
export const getUserDataPath = _getUserDataPath;
