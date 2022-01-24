/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const path = require('path');

// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];

if (process.env['VSCODE_DEV']) {
	// When running out of sources, we need to load node modules from remote/node_modules,
	// which are compiled against nodejs, not electron
	process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', 'remote', 'node_modules');
	require('./bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
} else {
	delete process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'];
}
require('./bootstrap-amd').load('vs/server/node/remoteCli');
