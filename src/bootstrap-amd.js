/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var loader = require('./vs/loader');

function uriFromPath(_path) {
	var pathName = path.resolve(_path).replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

var rawNlsConfig = process.env['VSCODE_NLS_CONFIG'];
var nlsConfig = rawNlsConfig ? JSON.parse(rawNlsConfig) : { availableLanguages: {} };

loader.config({
	baseUrl: uriFromPath(__dirname),
	catchError: true,
	nodeRequire: require,
	nodeMain: __filename,
	'vs/nls': nlsConfig,
	nodeCachedDataDir: process.env['VSCODE_NODE_CACHED_DATA_DIR_' + process.pid]
});

if (nlsConfig.pseudo) {
	loader(['vs/nls'], function (nlsPlugin) {
		nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
	});
}

exports.bootstrap = function (entrypoint) {
	if (!entrypoint) {
		return;
	}

	loader([entrypoint], function () { }, function (err) { console.error(err); });
};
