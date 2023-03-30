/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// ESM-comment-begin
const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// const isESM = true;
// ESM-uncomment-end
const requireExtension = (isESM ? '.cjs' : '');

// Store the node.js require function in a variable
// before loading our AMD loader to avoid issues
// when this file is bundled with other files.
const nodeRequire = require;

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });

// VSCODE_GLOBALS: package/product.json
globalThis._VSCODE_PRODUCT_JSON = require('../product.json');
globalThis._VSCODE_PACKAGE_JSON = require('../package.json');

// @ts-ignore
// VSCODE_GLOBALS: file root of all resources
globalThis._VSCODE_FILE_ROOT = __dirname;

const bootstrap = require('./bootstrap');
const performance = require(`./vs/base/common/performance${requireExtension}`);

if (isESM) {

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

	/**
	 * @param {string} entrypoint
	 * @param {(value: any) => void} onLoad
	 * @param {(err: Error) => void} onError
	 */
	exports.load = function (entrypoint, onLoad, onError) {
		if (!entrypoint) {
			return;
		}

		entrypoint = `./${entrypoint}.js`;

		onLoad = onLoad || function () { };
		onError = onError || function (err) { console.error(err); };

		performance.mark(`code/fork/willLoadCode`);
		import(entrypoint).then(onLoad, onError);
	};


} else {

	// Bootstrap: NLS
	const nlsConfig = bootstrap.setupNLS();

	// @ts-ignore
	const loader = require('./vs/loader');
	// Bootstrap: Loader
	loader.config({
		baseUrl: bootstrap.fileUriFromPath(__dirname, { isWindows: process.platform === 'win32' }),
		catchError: true,
		nodeRequire,
		'vs/nls': nlsConfig,
		amdModulesPattern: /^vs\//,
		recordStats: true
	});

	// Running in Electron
	if (process.env['ELECTRON_RUN_AS_NODE'] || process.versions['electron']) {
		loader.define('fs', ['original-fs'], function (/** @type {import('fs')} */originalFS) {
			return originalFS;  // replace the patched electron fs with the original node fs for all AMD code
		});
	}

	// Pseudo NLS support
	if (nlsConfig && nlsConfig.pseudo) {
		loader(['vs/nls'], function (/** @type {import('vs/nls')} */nlsPlugin) {
			nlsPlugin.setPseudoTranslation(!!nlsConfig.pseudo);
		});
	}

	/**
	 * @param {string=} entrypoint
	 * @param {(value: any) => void=} onLoad
	 * @param {(err: Error) => void=} onError
	 */
	exports.load = function (entrypoint, onLoad, onError) {
		if (!entrypoint) {
			return;
		}

		// code cache config
		if (process.env['VSCODE_CODE_CACHE_PATH']) {
			loader.config({
				nodeCachedData: {
					path: process.env['VSCODE_CODE_CACHE_PATH'],
					seed: entrypoint
				}
			});
		}

		onLoad = onLoad || function () { };
		onError = onError || function (err) { console.error(err); };

		performance.mark('code/fork/willLoadCode');
		loader([entrypoint], onLoad, onError);
	};

}
