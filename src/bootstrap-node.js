/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// ESM-comment-begin
// const path = require('path');
// const fs = require('fs');
// const Module = require('module');
// ESM-comment-end
// ESM-uncomment-begin
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

/** @ts-ignore */
const require = createRequire(import.meta.url);
/** @type any */
const module = { exports: {} };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

// increase number of stack frames(from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
Error.stackTraceLimit = 100;

if (!process.env['VSCODE_HANDLES_SIGPIPE']) {
	// Workaround for Electron not installing a handler to ignore SIGPIPE
	// (https://github.com/electron/electron/issues/13254)
	let didLogAboutSIGPIPE = false;
	process.on('SIGPIPE', () => {
		// See https://github.com/microsoft/vscode-remote-release/issues/6543
		// In certain situations, the console itself can be in a broken pipe state
		// so logging SIGPIPE to the console will cause an infinite async loop
		if (!didLogAboutSIGPIPE) {
			didLogAboutSIGPIPE = true;
			console.error(new Error(`Unexpected SIGPIPE`));
		}
	});
}

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
 * Note: only applies when running out of sources.
 *
 * @param {string} injectPath
 */
module.exports.devInjectNodeModuleLookupPath = function (injectPath) {
	if (!process.env['VSCODE_DEV']) {
		return; // only applies running out of sources
	}

	if (!injectPath) {
		throw new Error('Missing injectPath');
	}

	const Module = require('node:module');
	// ESM-uncomment-begin
	// register a loader hook
	Module.register('./bootstrap-import.js', { parentURL: import.meta.url, data: injectPath });
	// ESM-uncomment-end
	// ESM-comment-begin
	// const nodeModulesPath = path.join(__dirname, '../node_modules');
	//
	// // @ts-ignore
	// const originalResolveLookupPaths = Module._resolveLookupPaths;
	//
	// // @ts-ignore
	// Module._resolveLookupPaths = function (moduleName, parent) {
	// const paths = originalResolveLookupPaths(moduleName, parent);
	// if (Array.isArray(paths)) {
	// for (let i = 0, len = paths.length; i < len; i++) {
	// if (paths[i] === nodeModulesPath) {
	// paths.splice(i, 0, injectPath);
	// break;
	// }
	// }
	// }
	//
	// return paths;
	// };
	// ESM-comment-end
};

module.exports.removeGlobalNodeJsModuleLookupPaths = function () {
	if (typeof process?.versions?.electron === 'string') {
		return; // Electron disables global search paths in https://github.com/electron/electron/blob/3186c2f0efa92d275dc3d57b5a14a60ed3846b0e/shell/common/node_bindings.cc#L653
	}

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

/**
 * Helper to enable ASAR support.
 */
module.exports.enableASARSupport = function () {
	// ESM-comment-begin
	// const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
	// const NODE_MODULES_ASAR_PATH = `${NODE_MODULES_PATH}.asar`;
	//
	// // @ts-ignore
	// const originalResolveLookupPaths = Module._resolveLookupPaths;
	//
	// // @ts-ignore
	// Module._resolveLookupPaths = function (request, parent) {
	// const paths = originalResolveLookupPaths(request, parent);
	// if (Array.isArray(paths)) {
	// for (let i = 0, len = paths.length; i < len; i++) {
	// if (paths[i] === NODE_MODULES_PATH) {
	// paths.splice(i, 0, NODE_MODULES_ASAR_PATH);
	// break;
	// }
	// }
	// }
	//
	// return paths;
	// };
	// ESM-comment-end
};

/**
 * Helper to convert a file path to a URI.
 *
 * TODO@bpasero TODO@esm check for removal once ESM has landed.
 *
 * @param {string} path
 * @param {{ isWindows?: boolean, scheme?: string, fallbackAuthority?: string }} config
 * @returns {string}
 */
module.exports.fileUriFromPath = function (path, config) {

	// Since we are building a URI, we normalize any backslash
	// to slashes and we ensure that the path begins with a '/'.
	let pathName = path.replace(/\\/g, '/');
	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = `/${pathName}`;
	}

	/** @type {string} */
	let uri;

	// Windows: in order to support UNC paths (which start with '//')
	// that have their own authority, we do not use the provided authority
	// but rather preserve it.
	if (config.isWindows && pathName.startsWith('//')) {
		uri = encodeURI(`${config.scheme || 'file'}:${pathName}`);
	}

	// Otherwise we optionally add the provided authority if specified
	else {
		uri = encodeURI(`${config.scheme || 'file'}://${config.fallbackAuthority || ''}${pathName}`);
	}

	return uri.replace(/#/g, '%23');
};

//#endregion

// ESM-uncomment-begin
export const devInjectNodeModuleLookupPath = module.exports.devInjectNodeModuleLookupPath;
export const removeGlobalNodeJsModuleLookupPaths = module.exports.removeGlobalNodeJsModuleLookupPaths;
export const configurePortable = module.exports.configurePortable;
export const enableASARSupport = module.exports.enableASARSupport;
export const fileUriFromPath = module.exports.fileUriFromPath;
// ESM-uncomment-end
