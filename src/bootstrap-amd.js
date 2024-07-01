/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

/**
 * @typedef {import('./vs/nls').INLSConfiguration} INLSConfiguration
 */

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

// @ts-ignore
// VSCODE_GLOBALS: file root of all resources
globalThis._VSCODE_FILE_ROOT = __dirname;

const bootstrap = require('./bootstrap');
const performance = require(`./vs/base/common/performance${requireExtension}`);
const fs = require('fs');


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

/**
 * @param {string=} entrypoint
 * @param {(value: any) => void=} onLoad
 * @param {(err: Error) => void=} onError
 */
let load;

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
	load = function (entrypoint, onLoad, onError) {
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
	/**
	 * @param {string=} entrypoint
	 * @param {(value: any) => void=} onLoad
	 * @param {(err: Error) => void=} onError
	 */
	load = function (entrypoint, onLoad, onError) {
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

exports.load = load;
