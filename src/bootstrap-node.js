/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// ESM-comment-begin
const path = require('path');
const fs = require('fs');

const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// import * as path from 'path';
// import * as fs from 'fs';
// import { fileURLToPath } from 'url';
// import { createRequire } from 'node:module';
//
// const require = createRequire(import.meta.url);
// const isESM = true;
// const module = { exports: {} };
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

// Setup current working directory in all our node & electron processes
// - Windows: call `process.chdir()` to always set application folder as cwd
// -  all OS: store the `process.cwd()` inside `VSCODE_CWD` for consistent lookups
function setupCurrentWorkingDirectory() {
	try {

		// Store the `process.cwd()` inside `VSCODE_CWD`
		// for consistent lookups, but make sure to only
		// do this once unless defined already from e.g.
		// a parent process.
		if (typeof process.env['VSCODE_CWD'] !== 'string') {
			process.env['VSCODE_CWD'] = process.cwd();
		}

		// Windows: always set application folder as current working dir
		if (process.platform === 'win32') {
			process.chdir(path.dirname(process.execPath));
		}
	} catch (err) {
		console.error(err);
	}
}

setupCurrentWorkingDirectory();

/**
 * Add support for redirecting the loading of node modules
 *
 * @param {string} injectPath
 */
module.exports.injectNodeModuleLookupPath = function (injectPath) {
	if (!injectPath) {
		throw new Error('Missing injectPath');
	}

	const Module = require('node:module');
	if (isESM) {
		// register a loader hook
		// ESM-uncomment-begin
		// Module.register('./server-loader.mjs', { parentURL: import.meta.url, data: injectPath });
		// ESM-uncomment-end
	} else {
		const nodeModulesPath = path.join(__dirname, '../node_modules');

		// @ts-ignore
		const originalResolveLookupPaths = Module._resolveLookupPaths;

		// @ts-ignore
		Module._resolveLookupPaths = function (moduleName, parent) {
			const paths = originalResolveLookupPaths(moduleName, parent);
			if (Array.isArray(paths)) {
				for (let i = 0, len = paths.length; i < len; i++) {
					if (paths[i] === nodeModulesPath) {
						paths.splice(i, 0, injectPath);
						break;
					}
				}
			}

			return paths;
		};
	}
};

module.exports.removeGlobalNodeModuleLookupPaths = function () {
	const Module = require('module');
	// @ts-ignore
	const globalPaths = Module.globalPaths;

	// @ts-ignore
	const originalResolveLookupPaths = Module._resolveLookupPaths;

	// @ts-ignore
	Module._resolveLookupPaths = function (moduleName, parent) {
		const paths = originalResolveLookupPaths(moduleName, parent);
		if (Array.isArray(paths)) {
			let commonSuffixLength = 0;
			while (commonSuffixLength < paths.length && paths[paths.length - 1 - commonSuffixLength] === globalPaths[globalPaths.length - 1 - commonSuffixLength]) {
				commonSuffixLength++;
			}
			return paths.slice(0, paths.length - commonSuffixLength);
		}
		return paths;
	};
};

/**
 * Helper to enable portable mode.
 *
 * @param {Partial<import('./vs/base/common/product').IProductConfiguration>} product
 * @returns {{ portableDataPath: string; isPortable: boolean; }}
 */
module.exports.configurePortable = function (product) {
	const appRoot = path.dirname(__dirname);

	/**
	 * @param {import('path')} path
	 */
	function getApplicationPath(path) {
		if (process.env['VSCODE_DEV']) {
			return appRoot;
		}

		if (process.platform === 'darwin') {
			return path.dirname(path.dirname(path.dirname(appRoot)));
		}

		return path.dirname(path.dirname(appRoot));
	}

	/**
	 * @param {import('path')} path
	 */
	function getPortableDataPath(path) {
		if (process.env['VSCODE_PORTABLE']) {
			return process.env['VSCODE_PORTABLE'];
		}

		if (process.platform === 'win32' || process.platform === 'linux') {
			return path.join(getApplicationPath(path), 'data');
		}

		// @ts-ignore
		const portableDataName = product.portable || `${product.applicationName}-portable-data`;
		return path.join(path.dirname(getApplicationPath(path)), portableDataName);
	}

	const portableDataPath = getPortableDataPath(path);
	const isPortable = !('target' in product) && fs.existsSync(portableDataPath);
	const portableTempPath = path.join(portableDataPath, 'tmp');
	const isTempPortable = isPortable && fs.existsSync(portableTempPath);

	if (isPortable) {
		process.env['VSCODE_PORTABLE'] = portableDataPath;
	} else {
		delete process.env['VSCODE_PORTABLE'];
	}

	if (isTempPortable) {
		if (process.platform === 'win32') {
			process.env['TMP'] = portableTempPath;
			process.env['TEMP'] = portableTempPath;
		} else {
			process.env['TMPDIR'] = portableTempPath;
		}
	}

	return {
		portableDataPath,
		isPortable
	};
};

// ESM-uncomment-begin
// export const injectNodeModuleLookupPath = module.exports.injectNodeModuleLookupPath;
// export const removeGlobalNodeModuleLookupPaths = module.exports.removeGlobalNodeModuleLookupPaths;
// export const configurePortable = module.exports.configurePortable;
// ESM-uncomment-end
