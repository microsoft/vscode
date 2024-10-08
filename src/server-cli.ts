/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './bootstrap-server.js'; // this MUST come before other imports as it changes global state
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { devInjectNodeModuleLookupPath } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';
import { resolveNLSConfiguration } from './vs/base/node/nls.js';
import { product } from './bootstrap-meta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// NLS
const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, userDataPath: '', nlsMetadataPath: __dirname });
process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration); // required for `bootstrap-esm` to pick up NLS messages

if (process.env['VSCODE_DEV']) {
	// When running out of sources, we need to load node modules from remote/node_modules,
	// which are compiled against nodejs, not electron
	process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] || join(__dirname, '..', 'remote', 'node_modules');
	devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
} else {
	delete process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'];
}

// Bootstrap ESM
await bootstrapESM();

// Load Server
await import('./vs/server/node/server.cli');
