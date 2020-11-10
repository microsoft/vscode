/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="typings/require.d.ts" />

//@ts-check
'use strict';

// Simple module style to support node.js and browser environments
(function (globalThis, factory) {

	// Node.js
	if (typeof exports === 'object') {
		module.exports = factory();
	}

	// Browser
	else {
		globalThis.MonacoBootstrapWindow = factory();
	}
}(this, function () {
	const bootstrapLib = bootstrap();
	const preloadGlobals = globals();
	const sandbox = preloadGlobals.context.sandbox;
	const webFrame = preloadGlobals.webFrame;
	const safeProcess = sandbox ? preloadGlobals.process : process;

	/**
	 * @param {string[]} modulePaths
	 * @param {(result, configuration: object) => any} resultCallback
	 * @param {{ forceEnableDeveloperKeybindings?: boolean, disallowReloadKeybinding?: boolean, removeDeveloperKeybindingsAfterLoad?: boolean, canModifyDOM?: (config: object) => void, beforeLoaderConfig?: (config: object, loaderConfig: object) => void, beforeRequire?: () => void }=} options
	 */
	function load(modulePaths, resultCallback, options) {
		const args = parseURLQueryArgs();
		/**
		 * // configuration: INativeWindowConfiguration
		 * @type {{
		 * zoomLevel?: number,
		 * extensionDevelopmentPath?: string[],
		 * extensionTestsPath?: string,
		 * userEnv?: { [key: string]: string | undefined },
		 * appRoot: string,
		 * nodeCachedDataDir?: string
		 * }} */
		const configuration = JSON.parse(args['config'] || '{}') || {};

		// Apply zoom level early to avoid glitches
		const zoomLevel = configuration.zoomLevel;
		if (typeof zoomLevel === 'number' && zoomLevel !== 0) {
			webFrame.setZoomLevel(zoomLevel);
		}

		// Error handler
		safeProcess.on('uncaughtException', function (error) {
			onUnexpectedError(error, enableDeveloperTools);
		});

		// Developer tools
		const enableDeveloperTools = (safeProcess.env['VSCODE_DEV'] || !!configuration.extensionDevelopmentPath) && !configuration.extensionTestsPath;
		let developerToolsUnbind;
		if (enableDeveloperTools || (options && options.forceEnableDeveloperKeybindings)) {
			developerToolsUnbind = registerDeveloperKeybindings(options && options.disallowReloadKeybinding);
		}

		// Correctly inherit the parent's environment (TODO@sandbox non-sandboxed only)
		if (!sandbox) {
			Object.assign(safeProcess.env, configuration.userEnv);
		}

		// Enable ASAR support (TODO@sandbox non-sandboxed only)
		if (!sandbox) {
			globalThis.MonacoBootstrap.enableASARSupport(configuration.appRoot);
		}

		if (options && typeof options.canModifyDOM === 'function') {
			options.canModifyDOM(configuration);
		}

		// Get the nls configuration into the process.env as early as possible  (TODO@sandbox non-sandboxed only)
		const nlsConfig = sandbox ? { availableLanguages: {} } : globalThis.MonacoBootstrap.setupNLS();

		let locale = nlsConfig.availableLanguages['*'] || 'en';
		if (locale === 'zh-tw') {
			locale = 'zh-Hant';
		} else if (locale === 'zh-cn') {
			locale = 'zh-Hans';
		}

		window.document.documentElement.setAttribute('lang', locale);

		// do not advertise AMD to avoid confusing UMD modules loaded with nodejs
		if (!sandbox) {
			window['define'] = undefined;
		}

		// replace the patched electron fs with the original node fs for all AMD code (TODO@sandbox non-sandboxed only)
		if (!sandbox) {
			require.define('fs', ['original-fs'], function (originalFS) { return originalFS; });
		}

		window['MonacoEnvironment'] = {};

		const loaderConfig = {
			baseUrl: `${bootstrapLib.fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32' })}/out`,
			'vs/nls': nlsConfig
		};

		// Enable loading of node modules:
		// - sandbox: we list paths of webpacked modules to help the loader
		// - non-sandbox: we signal that any module that does not begin with
		//                `vs/` should be loaded using node.js require()
		if (sandbox) {
			loaderConfig.paths = {
				'vscode-textmate': `../node_modules/vscode-textmate/release/main`,
				'vscode-oniguruma': `../node_modules/vscode-oniguruma/release/main`,
				'xterm': `../node_modules/xterm/lib/xterm.js`,
				'xterm-addon-search': `../node_modules/xterm-addon-search/lib/xterm-addon-search.js`,
				'xterm-addon-unicode11': `../node_modules/xterm-addon-unicode11/lib/xterm-addon-unicode11.js`,
				'xterm-addon-webgl': `../node_modules/xterm-addon-webgl/lib/xterm-addon-webgl.js`,
				'iconv-lite-umd': `../node_modules/iconv-lite-umd/lib/iconv-lite-umd.js`,
				'jschardet': `../node_modules/jschardet/dist/jschardet.min.js`,
			};
		} else {
			loaderConfig.amdModulesPattern = /^vs\//;
		}

		// cached data config
		if (configuration.nodeCachedDataDir) {
			loaderConfig.nodeCachedData = {
				path: configuration.nodeCachedDataDir,
				seed: modulePaths.join('')
			};
		}

		if (options && typeof options.beforeLoaderConfig === 'function') {
			options.beforeLoaderConfig(configuration, loaderConfig);
		}

		require.config(loaderConfig);

		if (nlsConfig.pseudo) {
			require(['vs/nls'], function (nlsPlugin) {
				nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
			});
		}

		if (options && typeof options.beforeRequire === 'function') {
			options.beforeRequire();
		}

		require(modulePaths, result => {
			try {
				const callbackResult = resultCallback(result, configuration);
				if (callbackResult && typeof callbackResult.then === 'function') {
					callbackResult.then(() => {
						if (developerToolsUnbind && options && options.removeDeveloperKeybindingsAfterLoad) {
							developerToolsUnbind();
						}
					}, error => {
						onUnexpectedError(error, enableDeveloperTools);
					});
				}
			} catch (error) {
				onUnexpectedError(error, enableDeveloperTools);
			}
		}, onUnexpectedError);
	}

	/**
	 * @returns {{[param: string]: string }}
	 */
	function parseURLQueryArgs() {
		const search = window.location.search || '';

		return search.split(/[?&]/)
			.filter(function (param) { return !!param; })
			.map(function (param) { return param.split('='); })
			.filter(function (param) { return param.length === 2; })
			.reduce(function (r, param) { r[param[0]] = decodeURIComponent(param[1]); return r; }, {});
	}

	/**
	 * @param {boolean | undefined} disallowReloadKeybinding
	 * @returns {() => void}
	 */
	function registerDeveloperKeybindings(disallowReloadKeybinding) {
		const ipcRenderer = preloadGlobals.ipcRenderer;

		const extractKey = function (e) {
			return [
				e.ctrlKey ? 'ctrl-' : '',
				e.metaKey ? 'meta-' : '',
				e.altKey ? 'alt-' : '',
				e.shiftKey ? 'shift-' : '',
				e.keyCode
			].join('');
		};

		// Devtools & reload support
		const TOGGLE_DEV_TOOLS_KB = (safeProcess.platform === 'darwin' ? 'meta-alt-73' : 'ctrl-shift-73'); // mac: Cmd-Alt-I, rest: Ctrl-Shift-I
		const TOGGLE_DEV_TOOLS_KB_ALT = '123'; // F12
		const RELOAD_KB = (safeProcess.platform === 'darwin' ? 'meta-82' : 'ctrl-82'); // mac: Cmd-R, rest: Ctrl-R

		/** @type {((e: any) => void) | undefined} */
		let listener = function (e) {
			const key = extractKey(e);
			if (key === TOGGLE_DEV_TOOLS_KB || key === TOGGLE_DEV_TOOLS_KB_ALT) {
				ipcRenderer.send('vscode:toggleDevTools');
			} else if (key === RELOAD_KB && !disallowReloadKeybinding) {
				ipcRenderer.send('vscode:reloadWindow');
			}
		};

		window.addEventListener('keydown', listener);

		return function () {
			if (listener) {
				window.removeEventListener('keydown', listener);
				listener = undefined;
			}
		};
	}

	/**
	 * @param {string | Error} error
	 * @param {boolean} [enableDeveloperTools]
	 */
	function onUnexpectedError(error, enableDeveloperTools) {
		if (enableDeveloperTools) {
			const ipcRenderer = preloadGlobals.ipcRenderer;
			ipcRenderer.send('vscode:openDevTools');
		}

		console.error(`[uncaught exception]: ${error}`);

		if (error && typeof error !== 'string' && error.stack) {
			console.error(error.stack);
		}
	}

	/**
	 * @return {{ fileUriFromPath: (path: string, config: { isWindows?: boolean, scheme?: string, fallbackAuthority?: string }) => string; }}
	 */
	function bootstrap() {
		// @ts-ignore (defined in bootstrap.js)
		return window.MonacoBootstrap;
	}

	/**
	 * @return {typeof import('./vs/base/parts/sandbox/electron-sandbox/globals')}
	 */
	function globals() {
		// @ts-ignore (defined in globals.js)
		return window.vscode;
	}

	return {
		load,
		globals
	};
}));
