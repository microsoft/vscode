/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var fs = require('fs');
var app = require('electron').app;
var loader = require('./vs/loader');

function uriFromPath(_path) {
	var pathName = path.resolve(_path).replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

var rawNlsConfig = process.env['VSCODE_NLS_CONFIG'];
var nlsConfig = rawNlsConfig ? JSON.parse(rawNlsConfig) : { availableLanguages:{} };

loader.config({
	baseUrl: uriFromPath(path.join(__dirname)),
	catchError: true,
	nodeRequire: require,
	nodeMain: __filename,
	'vs/nls': nlsConfig
});

if (nlsConfig.pseudo) {
	loader(['vs/nls'], function(nlsPlugin) {
		nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
	});
}

var entrypoint = process.env['AMD_ENTRYPOINT'];
if (entrypoint) {
	loader([entrypoint], function () { }, function (err) { console.error(err); });
}
