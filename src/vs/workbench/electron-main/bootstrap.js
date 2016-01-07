/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* global __filename, __dirname, global, process */

// Perf measurements
global.vscodeStart = Date.now();

var app = require('electron').app;
var path = require('path');

// Change cwd if given via env variable
try {
	process.env.VSCODE_CWD && process.chdir(process.env.VSCODE_CWD);
} catch (err) {
	// noop
}

// Set path according to being built or not
if (!!process.env.VSCODE_DEV) {
	var appData = app.getPath('appData');
	app.setPath('userData', path.join(appData, 'Code-Development'));
}

// Mac: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
// the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
global.macOpenFiles = [];
app.on('open-file', function(event, path) {
	global.macOpenFiles.push(path);
});

// TODO: Duplicated in:
// * src\bootstrap.js
// * src\vs\workbench\electron-main\bootstrap.js
// * src\vs\platform\plugins\common\nativePluginService.ts
function uriFromPath(_path) {
	var pathName = path.resolve(_path).replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

// Load our code once ready
app.once('ready', function() {
	var loader = require('../../loader');

	loader.config({
		nodeRequire: require,
		nodeMain: __filename,
		baseUrl: uriFromPath(path.dirname(path.dirname(path.dirname((__dirname)))))
	});

	loader(['vs/workbench/electron-main/main'], function(main) {
		// Loading done
	}, function (err) { console.error(err); });
});