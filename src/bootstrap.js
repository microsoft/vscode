/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region global bootstrapping

// increase number of stack frames(from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
Error.stackTraceLimit = 100;

// Workaround for Electron not installing a handler to ignore SIGPIPE
// (https://github.com/electron/electron/issues/13254)
process.on('SIGPIPE', () => {
	console.error(new Error('Unexpected SIGPIPE'));
});

//#endregion

//#region Add support for using node_modules.asar
exports.enableASARSupport = function () {
	const path = require('path');
	const Module = require('module');

	let NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
	if (process.platform === 'win32' && /[a-z]\:/.test(NODE_MODULES_PATH)) {
		NODE_MODULES_PATH = NODE_MODULES_PATH.charAt(0).toUpperCase() + NODE_MODULES_PATH.substr(1); // Make drive letter uppercase
	}

	const NODE_MODULES_ASAR_PATH = NODE_MODULES_PATH + '.asar';

	const originalResolveLookupPaths = Module._resolveLookupPaths;
	Module._resolveLookupPaths = function (request, parent, newReturn) {
		const result = originalResolveLookupPaths(request, parent, newReturn);

		const paths = newReturn ? result : result[1];
		for (let i = 0, len = paths.length; i < len; i++) {
			if (paths[i] === NODE_MODULES_PATH) {
				paths.splice(i, 0, NODE_MODULES_ASAR_PATH);
				break;
			}
		}

		return result;
	};
};
//#endregion

//#region URI helpers
exports.uriFromPath = function (_path) {
	const path = require('path');

	let pathName = path.resolve(_path).replace(/\\/g, '/');
	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName).replace(/#/g, '%23');
};
//#endregion

//#region FS helpers
exports.readFile = function (file) {
	const fs = require('fs');

	return new Promise(function (resolve, reject) {
		fs.readFile(file, 'utf8', function (err, data) {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		});
	});
};

exports.writeFile = function (file, content) {
	const fs = require('fs');

	return new Promise(function (resolve, reject) {
		fs.writeFile(file, content, 'utf8', function (err) {
			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
};
//#endregion

//#region NLS helpers
exports.setupNLS = function () {
	const path = require('path');

	// Get the nls configuration into the process.env as early as possible.
	let nlsConfig = { availableLanguages: {} };
	if (process.env['VSCODE_NLS_CONFIG']) {
		try {
			nlsConfig = JSON.parse(process.env['VSCODE_NLS_CONFIG']);
		} catch (e) {
			// Ignore
		}
	}

	if (nlsConfig._resolvedLanguagePackCoreLocation) {
		const bundles = Object.create(null);

		nlsConfig.loadBundle = function (bundle, language, cb) {
			let result = bundles[bundle];
			if (result) {
				cb(undefined, result);

				return;
			}

			const bundleFile = path.join(nlsConfig._resolvedLanguagePackCoreLocation, bundle.replace(/\//g, '!') + '.nls.json');
			exports.readFile(bundleFile).then(function (content) {
				let json = JSON.parse(content);
				bundles[bundle] = json;

				cb(undefined, json);
			}).catch((error) => {
				try {
					if (nlsConfig._corruptedFile) {
						exports.writeFile(nlsConfig._corruptedFile, 'corrupted').catch(function (error) { console.error(error); });
					}
				} finally {
					cb(error, undefined);
				}
			});
		};
	}

	return nlsConfig;
};
//#endregion

//#region Portable helpers
exports.configurePortable = function () {
	const path = require('path');
	const fs = require('fs');
	const product = require('../product.json');

	const appRoot = path.dirname(__dirname);

	function getApplicationPath() {
		if (process.env['VSCODE_DEV']) {
			return appRoot;
		}

		if (process.platform === 'darwin') {
			return path.dirname(path.dirname(path.dirname(appRoot)));
		}

		return path.dirname(path.dirname(appRoot));
	}

	function getPortableDataPath() {
		if (process.env['VSCODE_PORTABLE']) {
			return process.env['VSCODE_PORTABLE'];
		}

		if (process.platform === 'win32' || process.platform === 'linux') {
			return path.join(getApplicationPath(), 'data');
		}

		const portableDataName = product.portable || `${product.applicationName}-portable-data`;
		return path.join(path.dirname(getApplicationPath()), portableDataName);
	}

	const portableDataPath = getPortableDataPath();
	const isPortable = fs.existsSync(portableDataPath);
	const portableTempPath = path.join(portableDataPath, 'tmp');
	const isTempPortable = isPortable && fs.existsSync(portableTempPath);

	if (isPortable) {
		process.env['VSCODE_PORTABLE'] = portableDataPath;
	} else {
		delete process.env['VSCODE_PORTABLE'];
	}

	if (isTempPortable) {
		process.env[process.platform === 'win32' ? 'TEMP' : 'TMPDIR'] = portableTempPath;
	}

	return {
		portableDataPath,
		isPortable
	};
};
//#endregion