/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var os = require('os');
var pkg = require('../package.json');

function getAppDataPath(platform) {
	const userPath = process.env['vscode_config_prefix'];
	switch (platform) {
		case 'win32': return userPath || process.env['APPDATA'] || path.join(process.env['USERPROFILE'], 'AppData', 'Roaming');
		case 'darwin': return userPath || path.join(os.homedir(), 'Library', 'Application Support');
		case 'linux': return userPath || process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
		default: throw new Error('Platform not supported');
	}
}

function getDefaultUserDataPath(platform) {

	return path.join(getAppDataPath(platform), pkg.name);
}
exports.getAppDataPath = getAppDataPath;
exports.getDefaultUserDataPath = getDefaultUserDataPath;
