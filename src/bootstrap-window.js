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
	const preloadGlobals = sandboxGlobals();
	const safeProcess = preloadGlobals.process;

	/**
	 * @typedef {import('./vs/base/parts/sandbox/common/sandboxTypes').ISandboxConfiguration} ISandboxConfiguration
	 *
	 * @param {string[]} modulePaths
	 * @param {(result: unknown, configuration: ISandboxConfiguration) => Promise<unknown> | undefined} resultCallback
	 * @param {{
	 *  configureDeveloperSettings?: (config: ISandboxConfiguration) => {
	 * 		forceDisableShowDevtoolsOnError?: boolean,
	 * 		forceEnableDeveloperKeybindings?: boolean,
	 * 		disallowReloadKeybinding?: boolean,
	 * 		removeDeveloperKeybindingsAfterLoad?: boolean
	 * 	},
	 * 	canModifyDOM?: (config: ISandboxConfiguration) => void,
	 * 	beforeLoaderConfig?: (loaderConfig: object) => void,
	 *  beforeRequire?: () => void
	 * }} [options]
	 */
	async function load(modulePaths, resultCallback, options) {

		// Await window configuration from preload
		const timeout = setTimeout(() => { console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`); }, 10000);
		performance.mark('code/willWaitForWindowConfig');
		/** @type {ISandboxConfiguration} */
		const configuration = await preloadGlobals.context.resolveConfiguration();
		performance.mark('code/didWaitForWindowConfig');
		clearTimeout(timeout);

		// Signal DOM modifications are now OK
		if (typeof options?.canModifyDOM === 'function') {
			options.canModifyDOM(configuration);
		}

		// Developer settings
		const {
			forceEnableDeveloperKeybindings,
			disallowReloadKeybinding,
			removeDeveloperKeybindingsAfterLoad
		} = typeof options?.configureDeveloperSettings === 'function' ? options.configureDeveloperSettings(configuration) : {
			forceEnableDeveloperKeybindings: false,
			disallowReloadKeybinding: false,
			removeDeveloperKeybindingsAfterLoad: false
		};
		const isDev = !!safeProcess.env['VSCODE_DEV'];
		const enableDeveloperKeybindings = isDev || forceEnableDeveloperKeybindings;
		let developerDeveloperKeybindingsDisposable;
		if (enableDeveloperKeybindings) {
			developerDeveloperKeybindingsDisposable = registerDeveloperKeybindings(disallowReloadKeybinding);
		}

		// Get the nls configuration into the process.env as early as possible
		const nlsConfig = globalThis.MonacoBootstrap.setupNLS();

		let locale = nlsConfig.availableLanguages['*'] || 'en';
		if (locale === 'zh-tw') {
			locale = 'zh-Hant';
		} else if (locale === 'zh-cn') {
			locale = 'zh-Hans';
		}

		window.document.documentElement.setAttribute('lang', locale);

		window['MonacoEnvironment'] = {};

		// VSCODE_GLOBALS: node_modules
		globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => (require.__$__nodeRequire ?? require)(String(mod)) });

		const loaderConfig = {
			baseUrl: `${bootstrapLib.fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out`,
			'vs/nls': nlsConfig,
			preferScriptTags: true
		};

		// use a trusted types policy when loading via script tags
		loaderConfig.trustedTypesPolicy = window.trustedTypes?.createPolicy('amdLoader', {
			createScriptURL(value) {
				if (value.startsWith(window.location.origin)) {
					return value;
				}
				throw new Error(`Invalid script url: ${value}`);
			}
		});

		// Teach the loader the location of the node modules we use in renderers
		// This will enable to load these modules via <script> tags instead of
		// using a fallback such as node.js require which does not exist in sandbox
		const baseNodeModulesPath = isDev ? '../node_modules' : '../node_modules.asar';
		loaderConfig.paths = {
			'vscode-textmate': `${baseNodeModulesPath}/vscode-textmate/release/main.js`,
			'vscode-oniguruma': `${baseNodeModulesPath}/vscode-oniguruma/release/main.js`,
			'vsda': `${baseNodeModulesPath}/vsda/index.js`,
			'xterm': `${baseNodeModulesPath}/xterm/lib/xterm.js`,
			'xterm-addon-canvas': `${baseNodeModulesPath}/xterm-addon-canvas/lib/xterm-addon-canvas.js`,
			'xterm-addon-image': `${baseNodeModulesPath}/xterm-addon-image/lib/xterm-addon-image.js`,
			'xterm-addon-search': `${baseNodeModulesPath}/xterm-addon-search/lib/xterm-addon-search.js`,
			'xterm-addon-serialize': `${baseNodeModulesPath}/xterm-addon-serialize/lib/xterm-addon-serialize.js`,
			'xterm-addon-unicode11': `${baseNodeModulesPath}/xterm-addon-unicode11/lib/xterm-addon-unicode11.js`,
			'xterm-addon-webgl': `${baseNodeModulesPath}/xterm-addon-webgl/lib/xterm-addon-webgl.js`,
			'@vscode/iconv-lite-umd': `${baseNodeModulesPath}/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js`,
			'jschardet': `${baseNodeModulesPath}/jschardet/dist/jschardet.min.js`,
			'@vscode/vscode-languagedetection': `${baseNodeModulesPath}/@vscode/vscode-languagedetection/dist/lib/index.js`,
			'vscode-regexp-languagedetection': `${baseNodeModulesPath}/vscode-regexp-languagedetection/dist/index.js`,
			'tas-client-umd': `${baseNodeModulesPath}/tas-client-umd/lib/tas-client-umd.js`
		};

		// Signal before require.config()
		if (typeof options?.beforeLoaderConfig === 'function') {
			options.beforeLoaderConfig(loaderConfig);
		}

		// Configure loader
		require.config(loaderConfig);

		// Handle pseudo NLS
		if (nlsConfig.pseudo) {
			require(['vs/nls'], function (nlsPlugin) {
				nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
			});
		}

		// Signal before require()
		if (typeof options?.beforeRequire === 'function') {
			options.beforeRequire();
		}

		// Actually require the main module as specified
		require(modulePaths, async firstModule => {
			try {

				// Callback only after process environment is resolved
				const callbackResult = resultCallback(firstModule, configuration);
				if (callbackResult instanceof Promise) {
					await callbackResult;

					if (developerDeveloperKeybindingsDisposable && removeDeveloperKeybindingsAfterLoad) {
						developerDeveloperKeybindingsDisposable();
					}
				}
			} catch (error) {
				onUnexpectedError(error, enableDeveloperKeybindings);
			}
		}, onUnexpectedError);
	}

	/**
	 * @param {boolean | undefined} disallowReloadKeybinding
	 * @returns {() => void}
	 */
	function registerDeveloperKeybindings(disallowReloadKeybinding) {
		const ipcRenderer = preloadGlobals.ipcRenderer;

		const extractKey =
			/**
			 * @param {KeyboardEvent} e
			 */
			function (e) {
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

		/** @type {((e: KeyboardEvent) => void) | undefined} */
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
	 * @param {boolean} [showDevtoolsOnError]
	 */
	function onUnexpectedError(error, showDevtoolsOnError) {
		if (showDevtoolsOnError) {
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
	function sandboxGlobals() {
		// @ts-ignore (defined in globals.js)
		return window.vscode;
	}

	return {
		load
	};
}));
