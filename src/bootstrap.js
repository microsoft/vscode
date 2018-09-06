/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
Error.stackTraceLimit = 100;
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

//#region Renderer helpers
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