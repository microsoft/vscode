/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

/**
 * @typedef {import('./vs/nls').INLSConfiguration} INLSConfiguration
 */

// Simple module style to support node.js and browser environments
(function (globalThis, factory) {

	// Node.js
	if (typeof exports === 'object') {
		module.exports = factory();
	}

	// Browser
	else {
		// @ts-ignore
		globalThis.MonacoBootstrap = factory();
	}
}(this, function () {
	const Module = typeof require === 'function' ? require('module') : undefined;
	const path = typeof require === 'function' ? require('path') : undefined;
	const fs = typeof require === 'function' ? require('fs') : undefined;

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
		const process = safeProcess();

		/** @type {INLSConfiguration | undefined} */
		let nlsConfig = undefined;

		/** @type {string | undefined} */
		let messagesFile;
		if (process?.env['VSCODE_NLS_CONFIG']) {
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
			process?.env['VSCODE_DEV'] ||	// no NLS support in dev mode
			!messagesFile					// no NLS messages file
		) {
			return undefined;
		}

		try {
			// VSCODE_GLOBALS: NLS
			globalThis._VSCODE_NLS_MESSAGES = JSON.parse(await safeReadNlsFile(messagesFile));
		} catch (error) {
			console.error(`Error reading NLS messages file ${messagesFile}: ${error}`);

			// Mark as corrupt: this will re-create the language pack cache next startup
			if (nlsConfig?.languagePack?.corruptMarkerFile) {
				try {
					await safeWriteNlsFile(nlsConfig.languagePack.corruptMarkerFile, 'corrupted');
				} catch (error) {
					console.error(`Error writing corrupted NLS marker file: ${error}`);
				}
			}

			// Fallback to the default message file to ensure english translation at least
			if (nlsConfig?.defaultMessagesFile) {
				try {
					// VSCODE_GLOBALS: NLS
					globalThis._VSCODE_NLS_MESSAGES = JSON.parse(await safeReadNlsFile(nlsConfig.defaultMessagesFile));
				} catch (error) {
					console.error(`Error reading default NLS messages file ${nlsConfig.defaultMessagesFile}: ${error}`);
				}
			}
		}

		return nlsConfig;
	}

	/**
	 * @returns {typeof import('./vs/base/parts/sandbox/electron-sandbox/globals') | undefined}
	 */
	function safeSandboxGlobals() {
		const globals = (typeof self === 'object' ? self : typeof global === 'object' ? global : {});

		// @ts-ignore
		return globals.vscode;
	}

	/**
	 * @returns {import('./vs/base/parts/sandbox/electron-sandbox/globals').ISandboxNodeProcess | NodeJS.Process | undefined}
	 */
	function safeProcess() {
		const sandboxGlobals = safeSandboxGlobals();
		if (sandboxGlobals) {
			return sandboxGlobals.process; // Native environment (sandboxed)
		}

		if (typeof process !== 'undefined') {
			return process; // Native environment (non-sandboxed)
		}

		return undefined;
	}

	/**
	 * @param {string} messagesFile
	 * @returns {Promise<string>}
	 */
	async function safeReadNlsFile(messagesFile) {
		if (fs) {
			return (await fs.promises.readFile(messagesFile)).toString();
		}

		throw new Error('Unsupported operation (read NLS files)');
	}

	/**
	 * @param {string} nlsFile
	 * @param {string} content
	 * @returns {Promise<void>}
	 */
	function safeWriteNlsFile(nlsFile, content) {
		if (fs) {
			return fs.promises.writeFile(nlsFile, content);
		}

		throw new Error('Unsupported operation (write NLS files)');
	}

	//#endregion

	return {
		enableASARSupport,
		setupNLS,
		fileUriFromPath
	};
}));
