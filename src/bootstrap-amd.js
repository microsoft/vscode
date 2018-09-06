/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs');
const loader = require('./vs/loader');
const bootstrap = require('./bootstrap');

function readFile(file) {
	return new Promise(function (resolve, reject) {
		fs.readFile(file, 'utf8', function (err, data) {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		});
	});
}

const writeFile = (file, content) => new Promise((c, e) => fs.writeFile(file, content, 'utf8', err => err ? e(err) : c()));

const rawNlsConfig = process.env['VSCODE_NLS_CONFIG'];
const nlsConfig = rawNlsConfig ? JSON.parse(rawNlsConfig) : { availableLanguages: {} };

// We have a special location of the nls files. They come from a language pack
if (nlsConfig._resolvedLanguagePackCoreLocation) {
	let bundles = Object.create(null);
	nlsConfig.loadBundle = function (bundle, language, cb) {
		let result = bundles[bundle];
		if (result) {
			cb(undefined, result);
			return;
		}
		let bundleFile = path.join(nlsConfig._resolvedLanguagePackCoreLocation, bundle.replace(/\//g, '!') + '.nls.json');
		readFile(bundleFile).then(function (content) {
			let json = JSON.parse(content);
			bundles[bundle] = json;
			cb(undefined, json);
		}).catch((error) => {
			try {
				if (nlsConfig._corruptedFile) {
					writeFile(nlsConfig._corruptedFile, 'corrupted').catch(function (error) { console.error(error); });
				}
			} finally {
				cb(error, undefined);
			}
		});
	};
}

loader.config({
	baseUrl: bootstrap.uriFromPath(__dirname),
	catchError: true,
	nodeRequire: require,
	nodeMain: __filename,
	'vs/nls': nlsConfig,
	nodeCachedDataDir: process.env['VSCODE_NODE_CACHED_DATA_DIR_' + process.pid]
});

if (process.env['ELECTRON_RUN_AS_NODE'] || process.versions.electron) {
	// running in Electron
	loader.define('fs', ['original-fs'], function (originalFS) { return originalFS; }); // replace the patched electron fs with the original node fs for all AMD code
}

if (nlsConfig.pseudo) {
	loader(['vs/nls'], function (nlsPlugin) {
		nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
	});
}

exports.bootstrap = function (entrypoint, onLoad, onError) {
	if (!entrypoint) {
		return;
	}

	onLoad = onLoad || function () { };
	onError = onError || function (err) { console.error(err); };

	loader([entrypoint], onLoad, onError);
};
