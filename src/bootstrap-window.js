/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="typings/require.d.ts" />

//@ts-check
'use strict';

/**
 * @import { ISandboxConfiguration } from './vs/base/parts/sandbox/common/sandboxTypes'
 * @typedef {any} LoaderConfig
 */

/* eslint-disable no-restricted-globals,  */

// ESM-comment-begin
const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// const isESM = true;
// ESM-uncomment-end

// Simple module style to support node.js and browser environments
(function (factory) {

	// Node.js
	if (typeof exports === 'object') {
		module.exports = factory();
	}

	// Browser
	else {
		// @ts-ignore
		globalThis.MonacoBootstrapWindow = factory();
	}
}(function () {
	const bootstrapLib = bootstrap();
	const preloadGlobals = sandboxGlobals();
	const safeProcess = preloadGlobals.process;

	/**
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
	 *  beforeRequire?: (config: ISandboxConfiguration) => void
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
		/**
		 * @type {() => void | undefined}
		 */
		let developerDeveloperKeybindingsDisposable;
		if (enableDeveloperKeybindings) {
			developerDeveloperKeybindingsDisposable = registerDeveloperKeybindings(disallowReloadKeybinding);
		}

		// VSCODE_GLOBALS: NLS
		globalThis._VSCODE_NLS_MESSAGES = configuration.nls.messages;
		globalThis._VSCODE_NLS_LANGUAGE = configuration.nls.language;
		let language = configuration.nls.language || 'en';
		if (language === 'zh-tw') {
			language = 'zh-Hant';
		} else if (language === 'zh-cn') {
			language = 'zh-Hans';
		}

		window.document.documentElement.setAttribute('lang', language);

		window['MonacoEnvironment'] = {};

		if (isESM) {

			// Signal before require()
			if (typeof options?.beforeRequire === 'function') {
				options.beforeRequire(configuration);
			}

			const fileRoot = `${configuration.appRoot}/out`;
			globalThis._VSCODE_FILE_ROOT = fileRoot;

			// DEV ---------------------------------------------------------------------------------------
			// DEV: This is for development and enables loading CSS via import-statements via import-maps.
			// DEV: For each CSS modules that we have we defined an entry in the import map that maps to
			// DEV: a blob URL that loads the CSS via a dynamic @import-rule.
			// DEV ---------------------------------------------------------------------------------------
			if (configuration.cssModules) {
				performance.mark('code/willAddCssLoader');

				const style = document.createElement('style');
				style.type = 'text/css';
				style.media = 'screen';
				style.id = 'vscode-css-loading';
				document.head.appendChild(style);

				globalThis._VSCODE_CSS_LOAD = function (url) {
					style.textContent += `@import url(${url});\n`;
				};

				const baseUrl = new URL(`vscode-file://vscode-app${fileRoot}/`);
				/**
				 * @type { { imports: Record<string, string> }}
				 */
				const importMap = { imports: {} };
				for (const cssModule of configuration.cssModules) {
					const cssUrl = new URL(cssModule, baseUrl).href;
					const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');\n`;
					const blob = new Blob([jsSrc], { type: 'application/javascript' });
					importMap.imports[cssUrl] = URL.createObjectURL(blob);
				}

				const ttp = window.trustedTypes?.createPolicy('vscode-bootstrapImportMap', { createScript(value) { return value; }, });
				const importMapSrc = JSON.stringify(importMap, undefined, 2);
				const importMapScript = document.createElement('script');
				importMapScript.type = 'importmap';
				importMapScript.setAttribute('nonce', '0c6a828f1297');
				// @ts-ignore
				importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
				document.head.appendChild(importMapScript);

				performance.mark('code/didAddCssLoader');
			}

			const result = Promise.all(modulePaths.map(modulePath => {
				if (modulePath.includes('vs/css!')) {
					// ESM/CSS when seeing the old `vs/css!` prefix we use that as a signal to
					// load CSS via a <link> tag
					const cssModule = modulePath.replace('vs/css!', '');
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = `${configuration.appRoot}/out/${cssModule}.css`;
					document.head.appendChild(link);
					return Promise.resolve();

				} else {
					// ESM/JS module loading
					return import(`${configuration.appRoot}/out/${modulePath}.js`);
				}
			}));

			result.then((res) => invokeResult(res[0]), onUnexpectedError);
		} else {

			/** @type {LoaderConfig} */
			const loaderConfig = {
				baseUrl: `${bootstrapLib.fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out`,
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
				'@xterm/xterm': `${baseNodeModulesPath}/@xterm/xterm/lib/xterm.js`,
				'@xterm/addon-clipboard': `${baseNodeModulesPath}/@xterm/addon-clipboard/lib/addon-clipboard.js`,
				'@xterm/addon-image': `${baseNodeModulesPath}/@xterm/addon-image/lib/addon-image.js`,
				'@xterm/addon-search': `${baseNodeModulesPath}/@xterm/addon-search/lib/addon-search.js`,
				'@xterm/addon-serialize': `${baseNodeModulesPath}/@xterm/addon-serialize/lib/addon-serialize.js`,
				'@xterm/addon-unicode11': `${baseNodeModulesPath}/@xterm/addon-unicode11/lib/addon-unicode11.js`,
				'@xterm/addon-webgl': `${baseNodeModulesPath}/@xterm/addon-webgl/lib/addon-webgl.js`,
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

			// Signal before require()
			if (typeof options?.beforeRequire === 'function') {
				options.beforeRequire(configuration);
			}

			// Actually require the main module as specified
			require(modulePaths, invokeResult, onUnexpectedError);
		}

		/**
		 * @param {any} firstModule
		 */
		async function invokeResult(firstModule) {
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
		}
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
