/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const path = require('path');
const fs = require('fs');
const { logError, logInfo } = require('./logger'); // Assuming you have a logger module

// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];

try {
	if (process.env['VSCODE_DEV']) {
		// When running out of sources, we need to load node modules from remote/node_modules,
		// which are compiled against nodejs, not electron
		const nodeModulesPath = path.join(__dirname, '..', 'remote', 'node_modules');
		process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || nodeModulesPath;

		require('./bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
		logInfo(`Injected Node Module Lookup Path: ${process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']}`);
	} else {
		delete process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'];
		logInfo('Deleted VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH as not in dev mode');
	}
} catch (error) {
	logError('Error during environment setup:', error);
}

try {
	require('./bootstrap-amd').load('vs/server/node/server.cli', () => {
		logInfo('Successfully loaded server CLI module');
	});
} catch (error) {
	logError('Error loading server CLI module:', error);
}

/**
 * Logger module to handle logging.
 */
module.exports = {
	logError: (message, error) => {
		console.error(`[ERROR] ${message}`, error);
		// Additional logging to a file can be added here
		fs.appendFileSync('error.log', `[${new Date().toISOString()}] [ERROR] ${message}\n${error.stack}\n`);
	},
	logInfo: (message) => {
		console.log(`[INFO] ${message}`);
		// Additional logging to a file can be added here
		fs.appendFileSync('info.log', `[${new Date().toISOString()}] [INFO] ${message}\n`);
	}
};
