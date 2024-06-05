/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

// Import required modules
const path = require('path');
const fs = require('fs');
const bootstrap = require('./bootstrap');
const bootstrapNode = require('./bootstrap-node');
const product = require('../product.json');
const { logError, logInfo } = require('./logger'); // Assuming you have a logger module

// Delete `VSCODE_CWD` to prevent incorrect working directory issues
delete process.env['VSCODE_CWD'];
logInfo('Deleted VSCODE_CWD to prevent incorrect working directory issues');

try {
	// Enable portable support
	if (product) {
		bootstrapNode.configurePortable(product);
		logInfo('Enabled portable support');
	} else {
		throw new Error('Product configuration is missing');
	}

	// Enable ASAR support
	bootstrap.enableASARSupport();
	logInfo('Enabled ASAR support');

	// Signal processes that we got launched as CLI
	process.env['VSCODE_CLI'] = '1';
	logInfo('Set VSCODE_CLI environment variable');

	// Load CLI through AMD loader
	require('./bootstrap-amd').load('vs/code/node/cli', () => {
		logInfo('Successfully loaded CLI through AMD loader');
	});
} catch (error) {
	logError('An error occurred during initialization', error);
}

// Logger module to handle logging
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
