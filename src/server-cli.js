/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

/**
 * @import { IProductConfiguration } from './vs/base/common/product'
 */

const path = require('path');
/** @type {Partial<IProductConfiguration>} */
// @ts-ignore
const product = require('../product.json');
const { resolveNLSConfiguration } = require('./vs/base/node/nls');

async function start() {

	// Keep bootstrap-amd.js from redefining 'fs'.
	delete process.env['ELECTRON_RUN_AS_NODE'];

	// NLS
	const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, userDataPath: '', nlsMetadataPath: __dirname });
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration); // required for `bootstrap-amd` to pick up NLS messages

	if (process.env['VSCODE_DEV']) {
		// When running out of sources, we need to load node modules from remote/node_modules,
		// which are compiled against nodejs, not electron
		process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', 'remote', 'node_modules');
		require('./bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
	} else {
		delete process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'];
	}
	require('./bootstrap-amd').load('vs/server/node/server.cli');
}

start();
