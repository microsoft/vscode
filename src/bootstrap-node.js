/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

/** @ts-ignore */
const require = createRequire(import.meta.url);
/** @type any */
const module = { exports: {} };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
	// register a loader hook
	Module.register('./bootstrap-import.js', { parentURL: import.meta.url, data: injectPath });
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

//#endregion

export const devInjectNodeModuleLookupPath = module.exports.devInjectNodeModuleLookupPath;
export const removeGlobalNodeJsModuleLookupPaths = module.exports.removeGlobalNodeJsModuleLookupPaths;
export const configurePortable = module.exports.configurePortable;
