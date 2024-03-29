/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
import { createRequire } from 'module';

const require = createRequire(import.meta.url);


// Store the node.js require function in a variable
// before loading our AMD loader to avoid issues
// when this file is bundled with other files.
const nodeRequire = require;

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });

// VSCODE_GLOBALS: package/product.json
/** @type Record<string, any> */
globalThis._VSCODE_PRODUCT_JSON = require('../product.json');
if (process.env['VSCODE_DEV']) {
	// Patch product overrides when running out of sources
	try {
		// @ts-ignore
		const overrides = require('../product.overrides.json');
		globalThis._VSCODE_PRODUCT_JSON = Object.assign(globalThis._VSCODE_PRODUCT_JSON, overrides);
	} catch (error) { /* ignore */ }
}
globalThis._VSCODE_PACKAGE_JSON = require('../package.json');
