/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// TODO@bpasero this file can no longer be used from a non-node.js context and thus should
// move into bootstrap-node.js and remaining usages (if any) in browser context be replaced.

// ESM-uncomment-begin
// import * as path from 'path';
// import { createRequire } from 'node:module';
// import { fileURLToPath } from 'url';
//
// const require = createRequire(import.meta.url);
// const module = { exports: {} };
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

// Simple module style to support node.js and browser environments
(function (factory) {

	// Node.js
	if (typeof module === 'object' && typeof module.exports === 'object') {
		module.exports = factory();
	}

	// Browser
	else {
		// @ts-ignore
		globalThis.MonacoBootstrap = factory();
	}
}(function () {
	const Module = typeof require === 'function' ? require('module') : undefined;
	const path = typeof require === 'function' ? require('path') : undefined;

	//#region global bootstrapping

	// increase number of stack frames(from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
	Error.stackTraceLimit = 100;

	if (typeof process !== 'undefined' && !process.env['VSCODE_HANDLES_SIGPIPE']) {
		// Workaround for Electron not installing a handler to ignore SIGPIPE
		// (https://github.com/electron/electron/issues/13254)
		let didLogAboutSIGPIPE = false;
		process.on('SIGPIPE', () => {
			// See https://github.com/microsoft/vscode-remote-release/issues/6543
			// We would normally install a SIGPIPE listener in bootstrap.js
			// But in certain situations, the console itself can be in a broken pipe state
			// so logging SIGPIPE to the console will cause an infinite async loop
			if (!didLogAboutSIGPIPE) {
				didLogAboutSIGPIPE = true;
				console.error(new Error(`Unexpected SIGPIPE`));
			}
		});
	}

	//#endregion


	//#region Add support for using node_modules.asar

	function enableASARSupport() {
		if (!path || !Module || typeof process === 'undefined') {
			console.warn('enableASARSupport() is only available in node.js environments');
			return;
		}

		const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
		const NODE_MODULES_ASAR_PATH = `${NODE_MODULES_PATH}.asar`;

		// @ts-ignore
		const originalResolveLookupPaths = Module._resolveLookupPaths;

		// @ts-ignore
		Module._resolveLookupPaths = function (request, parent) {
			const paths = originalResolveLookupPaths(request, parent);
			if (Array.isArray(paths)) {
				for (let i = 0, len = paths.length; i < len; i++) {
					if (paths[i] === NODE_MODULES_PATH) {
						paths.splice(i, 0, NODE_MODULES_ASAR_PATH);
						break;
					}
				}
			}

			return paths;
		};
	}

	//#endregion


	//#region URI helpers

	/**
	 * @param {string} path
	 * @param {{ isWindows?: boolean, scheme?: string, fallbackAuthority?: string }} config
	 * @returns {string}
	 */
	function fileUriFromPath(path, config) {

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
	}

	//#endregion

	return {
		enableASARSupport,
		fileUriFromPath
	};
}));

// ESM-uncomment-begin
// export const enableASARSupport = module.exports.enableASARSupport;
// export const fileUriFromPath = module.exports.fileUriFromPath;
// ESM-uncomment-end
