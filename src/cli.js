/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)

const fs = require('fs');
const path = require('path');
const product = require('../product.json');
const appRoot = path.dirname(__dirname);

function getApplicationPath() {
	if (process.env['VSCODE_DEV']) {
		return appRoot;
	} else if (process.platform === 'darwin') {
		return path.dirname(path.dirname(path.dirname(appRoot)));
	} else {
		return path.dirname(path.dirname(appRoot));
	}
}

function getPortableDataPath() {
	return path.join(path.dirname(getApplicationPath()), product.portable);
}

if (product.portable && product.portableTemp) {
	const portablePath = getPortableDataPath();
	try { fs.mkdirSync(portablePath); } catch (err) { if (err.code !== 'EEXIST') { throw err; } }

	const tmpdir = path.join(portablePath, 'tmp');
	try { fs.mkdirSync(tmpdir); } catch (err) { if (err.code !== 'EEXIST') { throw err; } }

	process.env[process.platform === 'win32' ? 'TEMP' : 'TMPDIR'] = tmpdir;
}

//#region Add support for using node_modules.asar
(function () {
	const path = require('path');
	const Module = require('module');
	const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
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
})();
//#endregion

require('./bootstrap-amd').bootstrap('vs/code/node/cli');