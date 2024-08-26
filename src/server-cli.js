/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

// ESM-comment-begin
// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];
const path = require('path');
const bootstrapNode = require('./bootstrap-node');
const bootstrapAmd = require('./bootstrap-amd');
const { resolveNLSConfiguration } = require('./vs/base/node/nls');
const product = require('./bootstrap-meta').product;
// ESM-comment-end
// ESM-uncomment-begin
// import './bootstrap-server.js'; // this MUST come before other imports as it changes global state
// import * as path from 'path';
// import { fileURLToPath } from 'url';
// import * as bootstrapNode from './bootstrap-node.js';
// import * as bootstrapAmd from './bootstrap-amd.js';
// import { resolveNLSConfiguration } from './vs/base/node/nls.js';
// import { product } from './bootstrap-meta.js';
//
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

async function start() {

	// NLS
	const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, userDataPath: '', nlsMetadataPath: __dirname });
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration); // required for `bootstrap-amd` to pick up NLS messages

	if (process.env['VSCODE_DEV']) {
		// When running out of sources, we need to load node modules from remote/node_modules,
		// which are compiled against nodejs, not electron
		process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', 'remote', 'node_modules');
		bootstrapNode.devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
	} else {
		delete process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'];
	}
	bootstrapAmd.load('vs/server/node/server.cli');
}

start();
