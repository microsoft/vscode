/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var minimist = require('minimist');
var path = require('path');
var os = require('os');

function getAppDataPath(platform) {
	switch (platform) {
		case 'win32': return process.env['APPDATA'];
		case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support');
		case 'linux': return process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
		default: throw new Error('Platform not supported');
	}
}

function getUserDataPath(platform, appName, args) {
	var argv = minimist(args, { string: ['user-data-dir'] });
	var userDataDir = argv['user-data-dir'];
	var appData = getAppDataPath(platform);

	if (userDataDir) {
		return userDataDir;
	}

	return path.join(appData, appName);
}

exports.getAppDataPath = getAppDataPath;
exports.getUserDataPath = getUserDataPath;