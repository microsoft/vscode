/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const path = require('path');

// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];

// Set default remote native node modules path, if unset
process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', '..', '..', 'remote', 'node_modules');

require('../../bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
require('../../bootstrap-amd').load('vs/server/remoteCli');
