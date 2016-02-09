/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var path = require('path');
var loader = require('./vs/loader');

// Duplicated in ../index.html for the renderes.
function getNLSConfiguration() {
	if (process.env['VSCODE_NLS_CONFIG']) {
		return JSON.parse(process.env['VSCODE_NLS_CONFIG']);
	}

	var locale = undefined;
	var localeOpts = '--locale';
	for (var i = 0; i < process.argv.length; i++) {
		var arg = process.argv[i];
		if (arg.slice(0, localeOpts.length) == localeOpts) {
			var segments = arg.split('=');
			locale = segments[1];
			break;
		}
	}

	if (locale === 'pseudo') {
		return { availableLanguages: {}, pseudo: true }
	}
	if (process.env.VSCODE_DEV) {
		return { availableLanguages: {} };
	}
	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.
	locale = locale || app.getLocale();
	while (locale) {
		var candidate = path.join(__dirname, 'main.nls.') + locale + '.js';
		if (fs.existsSync(candidate)) {
			return { availableLanguages: { '*': locale } };
		} else {
			var index = locale.lastIndexOf('-');
			if (index > 0) {
				locale = locale.substring(0, index);
			} else {
				locale = null;
			}
		}
	}

	return { availableLanguages: {} };
}

function uriFromPath(_path) {
	var pathName = path.resolve(_path).replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

var nlsConfig = getNLSConfiguration();
process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);

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
