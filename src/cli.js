/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const product = require('../product.json');
const appRoot = path.dirname(__dirname);
const bootstrap = require('./bootstrap-shared');

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
	if (process.env['VSCODE_PORTABLE']) {
		return process.env['VSCODE_PORTABLE'];
	}

	if (process.platform === 'win32' || process.platform === 'linux') {
		return path.join(getApplicationPath(), 'data');
	} else {
		const portableDataName = product.portable || `${product.applicationName}-portable-data`;
		return path.join(path.dirname(getApplicationPath()), portableDataName);
	}
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

bootstrap.enableASARSupport();

require('./bootstrap-amd').bootstrap('vs/code/node/cli');