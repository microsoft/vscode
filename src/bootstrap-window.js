/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="typings/require.d.ts" />

//@ts-check
'use strict';

// ESM-comment-begin
const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// const isESM = true;
// ESM-uncomment-end

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


		if (isESM) {
			// Signal before require()
			if (typeof options?.beforeRequire === 'function') {
				options.beforeRequire();
			}

			const fileRoot = `${configuration.appRoot}/out`;
			globalThis._VSCODE_FILE_ROOT = fileRoot;


			// DEV ---------------------------------------------------------------------------------------
			// DEV: This is for development and enables loading CSS via import-statements via import-maps.
			// DEV: For each CSS modules that we have we define an entry in the import map that maps to
			// DEV: a blob URL that loads the CSS via a dynamic @import-rule.
			// DEV ---------------------------------------------------------------------------------------
			const cssDataBase64 = new URLSearchParams(window.location.search).get('_devCssData');
			if (cssDataBase64) {

				const style = document.createElement('style');
				style.type = 'text/css';
				style.media = 'screen';
				style.id = 'vscode-css-loading';
				document.head.appendChild(style);

				globalThis._VSCODE_CSS_LOAD = function (url) {
					// @ts-ignore
					style.sheet.insertRule(`@import url(${url});`);
				};

				const baseUrl = new URL(`vscode-file://vscode-app${fileRoot}/`);
				const importMap = { imports: {} };
				const cssData = Uint8Array.from(atob(cssDataBase64), c => c.charCodeAt(0));
				await new Response(new Blob([cssData], { type: 'application/octet-binary' }).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(value => {
					const cssModules = value.split(',');
					for (const cssModule of cssModules) {
						const cssUrl = new URL(cssModule, baseUrl).href;
						const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');\n`;
						const blob = new Blob([jsSrc], { type: 'application/javascript' });
						importMap.imports[cssUrl] = URL.createObjectURL(blob);
					}
				});

				const ttp = window.trustedTypes?.createPolicy('vscode-bootstrapImportMap', { createScript(value) { return value; }, });
				const importMapSrc = JSON.stringify(importMap, undefined, 2);
				const importMapScript = document.createElement('script');
				importMapScript.type = 'importmap';
				importMapScript.setAttribute('nonce', '0c6a828f1297');
				// @ts-ignore
				importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
				document.head.appendChild(importMapScript);
			}

			const filePaths = modulePaths.map((modulePath) => (`${configuration.appRoot}/out/${modulePath}.js`));
			const result = Promise.all(filePaths.map((filePath) => import(filePath)));
			result.then((res) => invokeResult(res[0]), onUnexpectedError);
		} else {
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
			require(modulePaths, invokeResult, onUnexpectedError);
		}

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
