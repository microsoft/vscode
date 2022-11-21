/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// @ts-ignore
const performance = require('./vs/base/common/performance.cjs');

// SIDE-effect import
require('./bootstrap');

// VSCODE_GLOBALS: file root of all resources
globalThis._VSCODE_FILE_ROOT = __dirname;

// Store the node.js require function in a variable
// before loading our AMD loader to avoid issues
// when this file is bundled with other files.
const nodeRequire = require;

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });

// VSCODE_GLOBALS: package/product.json
globalThis._VSCODE_PRODUCT_JSON = require('../product.json');
globalThis._VSCODE_PACKAGE_JSON = require('../package.json');

// TODO@jrieken: merge vscode.context with _VSCODE etc...
globalThis.vscode = {};
globalThis.vscode.context = {
	configuration: () => {
		/** @type {any} */
		const product = require('../product.json');
		// Running out of sources
		if (process.env['VSCODE_DEV']) {
			Object.assign(product, {
				nameShort: `${product.nameShort} Dev`,
				nameLong: `${product.nameLong} Dev`,
				dataFolderName: `${product.dataFolderName}-dev`,
				serverDataFolderName: product.serverDataFolderName ? `${product.serverDataFolderName}-dev` : undefined
			});
		}
		// Version is added during built time, but we still
		// want to have it running out of sources so we
		// read it from package.json only when we need it.
		if (!product.version) {
			const pkg = require('../package.json');
			Object.assign(product, {
				version: pkg.version
			});
		}
		return { product };
	}
};


exports.load = function (entrypoint, onLoad, onError) {
	if (!entrypoint) {
		return;
	}

	onLoad = onLoad || function () { };
	onError = onError || function (err) { console.error(err); };

	performance.mark(`code/fork/willLoadCode`);
	import(entrypoint).then(onLoad, onError);
};
