/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

/**
 * @import { INLSConfiguration } from './vs/nls'
 * @import { IProductConfiguration } from './vs/base/common/product'
 */

// ESM-comment-begin
const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// import * as path from 'path';
// import * as fs from 'fs';
// import { fileURLToPath } from 'url';
// import { createRequire } from 'node:module';
// import { product, pkg } from './bootstrap-meta.js';
// import * as bootstrap from './bootstrap.js';
// import * as performance from './vs/base/common/performance.js';
//
// const require = createRequire(import.meta.url);
// const isESM = true;
// const module = { exports: {} };
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

// Store the node.js require function in a variable
// before loading our AMD loader to avoid issues
// when this file is bundled with other files.
const nodeRequire = require;

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });

// VSCODE_GLOBALS: package/product.json
/** @type Partial<IProductConfiguration> */
// ESM-comment-begin
globalThis._VSCODE_PRODUCT_JSON = require('./bootstrap-meta').product;
// ESM-comment-end
// ESM-uncomment-begin
// globalThis._VSCODE_PRODUCT_JSON = { ...product };
// ESM-uncomment-end
if (process.env['VSCODE_DEV']) {
	// Patch product overrides when running out of sources
	try {
		// @ts-ignore
		const overrides = require('../product.overrides.json');
		globalThis._VSCODE_PRODUCT_JSON = Object.assign(globalThis._VSCODE_PRODUCT_JSON, overrides);
	} catch (error) { /* ignore */ }
}
// ESM-comment-begin
globalThis._VSCODE_PACKAGE_JSON = require('./bootstrap-meta').pkg;
// ESM-comment-end
// ESM-uncomment-begin
// globalThis._VSCODE_PACKAGE_JSON = { ...pkg };
// ESM-uncomment-end

// VSCODE_GLOBALS: file root of all resources
globalThis._VSCODE_FILE_ROOT = __dirname;

// ESM-comment-begin
const bootstrap = require('./bootstrap');
const performance = require(`./vs/base/common/performance`);
const fs = require('fs');
// ESM-comment-end

//#region NLS helpers

/** @type {Promise<INLSConfiguration | undefined> | undefined} */
let setupNLSResult = undefined;

/**
 * @returns {Promise<INLSConfiguration | undefined>}
 */
function setupNLS() {
	if (!setupNLSResult) {
		setupNLSResult = doSetupNLS();
	}

	return setupNLSResult;
}

/**
 * @returns {Promise<INLSConfiguration | undefined>}
 */
async function doSetupNLS() {
	performance.mark('code/amd/willLoadNls');

	/** @type {INLSConfiguration | undefined} */
	let nlsConfig = undefined;

	/** @type {string | undefined} */
	let messagesFile;
	if (process.env['VSCODE_NLS_CONFIG']) {
		try {
			/** @type {INLSConfiguration} */
			nlsConfig = JSON.parse(process.env['VSCODE_NLS_CONFIG']);
			if (nlsConfig?.languagePack?.messagesFile) {
				messagesFile = nlsConfig.languagePack.messagesFile;
			} else if (nlsConfig?.defaultMessagesFile) {
				messagesFile = nlsConfig.defaultMessagesFile;
			}

			// VSCODE_GLOBALS: NLS
			globalThis._VSCODE_NLS_LANGUAGE = nlsConfig?.resolvedLanguage;
		} catch (e) {
			console.error(`Error reading VSCODE_NLS_CONFIG from environment: ${e}`);
		}
	}

	if (
		process.env['VSCODE_DEV'] ||	// no NLS support in dev mode
		!messagesFile					// no NLS messages file
	) {
		return undefined;
	}

	try {
		// VSCODE_GLOBALS: NLS
		globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(messagesFile)).toString());
	} catch (error) {
		console.error(`Error reading NLS messages file ${messagesFile}: ${error}`);

		// Mark as corrupt: this will re-create the language pack cache next startup
		if (nlsConfig?.languagePack?.corruptMarkerFile) {
			try {
				await fs.promises.writeFile(nlsConfig.languagePack.corruptMarkerFile, 'corrupted');
			} catch (error) {
				console.error(`Error writing corrupted NLS marker file: ${error}`);
			}
		}

		// Fallback to the default message file to ensure english translation at least
		if (nlsConfig?.defaultMessagesFile && nlsConfig.defaultMessagesFile !== messagesFile) {
			try {
				// VSCODE_GLOBALS: NLS
				globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(nlsConfig.defaultMessagesFile)).toString());
			} catch (error) {
				console.error(`Error reading default NLS messages file ${nlsConfig.defaultMessagesFile}: ${error}`);
			}
		}
	}

	performance.mark('code/amd/didLoadNls');

	return nlsConfig;
}

//#endregion

//#region Loader Config

if (isESM) {

	/**
	 * @param {string=} entrypoint
	 * @param {(value: any) => void} [onLoad]
	 * @param {(err: Error) => void} [onError]
	 */
	module.exports.load = function (entrypoint, onLoad, onError) {
		if (!entrypoint) {
			return;
		}

		entrypoint = `./${entrypoint}.js`;

		onLoad = onLoad || function () { };
		onError = onError || function (err) { console.error(err); };

		setupNLS().then(() => {
			performance.mark(`code/fork/willLoadCode`);
			import(entrypoint).then(onLoad, onError);
		});
	};
} else {

	// @ts-ignore
	const loader = require('./vs/loader');

	loader.config({
		baseUrl: bootstrap.fileUriFromPath(__dirname, { isWindows: process.platform === 'win32' }),
		catchError: true,
		nodeRequire,
		amdModulesPattern: /^vs\//,
		recordStats: true
	});

	// Running in Electron
	if (process.env['ELECTRON_RUN_AS_NODE'] || process.versions['electron']) {
		loader.define('fs', ['original-fs'], function (/** @type {import('fs')} */originalFS) {
			return originalFS;  // replace the patched electron fs with the original node fs for all AMD code
		});
	}

	/**
	 * @param {string=} entrypoint
	 * @param {(value: any) => void} [onLoad]
	 * @param {(err: Error) => void} [onError]
	 */
	module.exports.load = function (entrypoint, onLoad, onError) {
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

		setupNLS().then(() => {
			performance.mark('code/fork/willLoadCode');
			loader([entrypoint], onLoad, onError);
		});
	};
}

//#endregion

// ESM-uncomment-begin
// export const load = module.exports.load;
// ESM-uncomment-end
