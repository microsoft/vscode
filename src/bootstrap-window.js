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

/* eslint-disable no-restricted-globals */

(function (factory) {
	// @ts-ignore
	globalThis.MonacoBootstrapWindow = factory();
}(function () {
	const preloadGlobals = sandboxGlobals();
	const safeProcess = preloadGlobals.process;

	// increase number of stack frames(from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
	Error.stackTraceLimit = 100;

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

		// ESM-uncomment-begin
		// // Signal before require()
		// if (typeof options?.beforeRequire === 'function') {
		// 	options.beforeRequire(configuration);
		// }

		// const baseUrl = new URL(`${fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out/`);
		// globalThis._VSCODE_FILE_ROOT = baseUrl.toString();

		// // DEV ---------------------------------------------------------------------------------------
		// // DEV: This is for development and enables loading CSS via import-statements via import-maps.
		// // DEV: For each CSS modules that we have we defined an entry in the import map that maps to
		// // DEV: a blob URL that loads the CSS via a dynamic @import-rule.
		// // DEV ---------------------------------------------------------------------------------------
		// if (Array.isArray(configuration.cssModules) && configuration.cssModules.length > 0) {
		// 	performance.mark('code/willAddCssLoader');

		// 	const style = document.createElement('style');
		// 	style.type = 'text/css';
		// 	style.media = 'screen';
		// 	style.id = 'vscode-css-loading';
		// 	document.head.appendChild(style);

		// 	globalThis._VSCODE_CSS_LOAD = function (url) {
		// 		style.textContent += `@import url(${url});\n`;
		// 	};

		// 	/**
		// 	 * @type { { imports: Record<string, string> }}
		// 	 */
		// 	const importMap = { imports: {} };
		// 	for (const cssModule of configuration.cssModules) {
		// 		const cssUrl = new URL(cssModule, baseUrl).href;
		// 		const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');\n`;
		// 		const blob = new Blob([jsSrc], { type: 'application/javascript' });
		// 		importMap.imports[cssUrl] = URL.createObjectURL(blob);
		// 	}

		// 	const ttp = window.trustedTypes?.createPolicy('vscode-bootstrapImportMap', { createScript(value) { return value; }, });
		// 	const importMapSrc = JSON.stringify(importMap, undefined, 2);
		// 	const importMapScript = document.createElement('script');
		// 	importMapScript.type = 'importmap';
		// 	importMapScript.setAttribute('nonce', '0c6a828f1297');
		// 	// @ts-ignore
		// 	importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
		// 	document.head.appendChild(importMapScript);

		// 	performance.mark('code/didAddCssLoader');
		// }

		// const result = Promise.all(modulePaths.map(modulePath => {
		// 	if (modulePath.includes('vs/css!')) {
		// 		// ESM/CSS when seeing the old `vs/css!` prefix we use that as a signal to
		// 		// load CSS via a <link> tag
		// 		const cssModule = modulePath.replace('vs/css!', '');
		// 		const link = document.createElement('link');
		// 		link.rel = 'stylesheet';
		// 		link.href = new URL(`${cssModule}.css`, baseUrl).href;
		// 		document.head.appendChild(link);
		// 		return Promise.resolve();

		// 	} else {
		// 		// ESM/JS module loading
		// 		return import(new URL(`${modulePath}.js`, baseUrl).href);
		// 	}
		// }));

		// result.then((res) => invokeResult(res[0]), onUnexpectedError);
		// ESM-uncomment-end

		// ESM-comment-begin
		/** @type {LoaderConfig} */
		const loaderConfig = {
			baseUrl: `${fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out`,
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
			'@vscode/tree-sitter-wasm': `${baseNodeModulesPath}/@vscode/tree-sitter-wasm/wasm/tree-sitter.js`,
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
		// ESM-comment-end

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
