/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(async function () {

	// Add a perf entry right from the top
	performance.mark('code/didStartRenderer');

	type ISandboxConfiguration = import('../../../base/parts/sandbox/common/sandboxTypes.js').ISandboxConfiguration;
	type INativeWindowConfiguration = import('../../../platform/window/common/window.ts').INativeWindowConfiguration;
	type IMainWindowSandboxGlobals = import('../../../base/parts/sandbox/electron-browser/globals.js').IMainWindowSandboxGlobals;
	type IAgentMain = import('../../../workbench/workbench.agent.desktop.main.js').IAgentMain;

	const preloadGlobals = (window as unknown as { vscode: IMainWindowSandboxGlobals }).vscode;
	const safeProcess = preloadGlobals.process;

	//#region Window Helpers

	async function resolveWindowConfiguration<T extends ISandboxConfiguration>() {
		const timeout = setTimeout(() => { console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`); }, 10000);
		performance.mark('code/willWaitForWindowConfig');

		const configuration = await preloadGlobals.context.resolveConfiguration() as T;
		performance.mark('code/didWaitForWindowConfig');

		clearTimeout(timeout);

		return configuration;
	}

	function setupNLS<T extends ISandboxConfiguration>(configuration: T): void {
		globalThis._VSCODE_NLS_MESSAGES = configuration.nls.messages;
		globalThis._VSCODE_NLS_LANGUAGE = configuration.nls.language;

		let language = configuration.nls.language || 'en';
		if (language === 'zh-tw') {
			language = 'zh-Hant';
		} else if (language === 'zh-cn') {
			language = 'zh-Hans';
		}

		window.document.documentElement.setAttribute('lang', language);
	}

	function fileUriFromPath(path: string, config: { isWindows?: boolean; scheme?: string; fallbackAuthority?: string }): string {
		let pathName = path.replace(/\\/g, '/');
		if (pathName.length > 0 && pathName.charAt(0) !== '/') {
			pathName = `/${pathName}`;
		}

		let uri: string;
		if (config.isWindows && pathName.startsWith('//')) {
			uri = encodeURI(`${config.scheme || 'file'}:${pathName}`);
		} else {
			uri = encodeURI(`${config.scheme || 'file'}://${config.fallbackAuthority || ''}${pathName}`);
		}

		return uri.replace(/#/g, '%23');
	}

	function registerDeveloperKeybindings(): () => void {
		const ipcRenderer = preloadGlobals.ipcRenderer;

		const extractKey = function (e: KeyboardEvent) {
			return [
				e.ctrlKey ? 'ctrl-' : '',
				e.metaKey ? 'meta-' : '',
				e.altKey ? 'alt-' : '',
				e.shiftKey ? 'shift-' : '',
				e.keyCode
			].join('');
		};

		const TOGGLE_DEV_TOOLS_KB = (safeProcess.platform === 'darwin' ? 'meta-alt-73' : 'ctrl-shift-73');
		const TOGGLE_DEV_TOOLS_KB_ALT = '123';
		const RELOAD_KB = (safeProcess.platform === 'darwin' ? 'meta-82' : 'ctrl-82');

		let listener: ((e: KeyboardEvent) => void) | undefined = function (e) {
			const key = extractKey(e);
			if (key === TOGGLE_DEV_TOOLS_KB || key === TOGGLE_DEV_TOOLS_KB_ALT) {
				ipcRenderer.send('vscode:toggleDevTools');
			} else if (key === RELOAD_KB) {
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

	function onUnexpectedError(error: string | Error): void {
		const ipcRenderer = preloadGlobals.ipcRenderer;
		ipcRenderer.send('vscode:openDevTools');

		console.error(`[uncaught exception]: ${error}`);

		if (error && typeof error !== 'string' && error.stack) {
			console.error(error.stack);
		}
	}

	function setupCSSImportMaps<T extends ISandboxConfiguration>(configuration: T, baseUrl: URL) {
		// DEV: This is for development and enables loading CSS via import-statements via import-maps.
		// For each CSS module, we define an entry in the import map that maps to
		// a blob URL that loads the CSS via a dynamic stylesheet link.

		if (globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP) {
			return;
		}

		if (Array.isArray(configuration.cssModules) && configuration.cssModules.length > 0) {
			performance.mark('code/willAddCssLoader');

			globalThis._VSCODE_CSS_LOAD = function (url: string) {
				const link = document.createElement('link');
				link.setAttribute('rel', 'stylesheet');
				link.setAttribute('type', 'text/css');
				link.setAttribute('href', url);
				window.document.head.appendChild(link);
			};

			const importMap: { imports: Record<string, string> } = { imports: {} };
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
			// @ts-expect-error
			importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
			window.document.head.appendChild(importMapScript);

			performance.mark('code/didAddCssLoader');
		}
	}

	//#endregion

	// Window Configuration
	const configuration = await resolveWindowConfiguration<INativeWindowConfiguration>();

	// NLS
	setupNLS(configuration);

	// Developer keybindings
	const isDev = !!safeProcess.env['VSCODE_DEV'];
	if (isDev) {
		registerDeveloperKeybindings();
	}

	// Compute base URL
	const baseUrl = new URL(`${fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out/`);
	globalThis._VSCODE_FILE_ROOT = baseUrl.toString();

	// Setup CSS import maps for development
	setupCSSImportMaps(configuration, baseUrl);

	// Code windows have a `vscodeWindowId` property to identify them
	Object.defineProperty(window, 'vscodeWindowId', {
		get: () => configuration.windowId
	});

	// Track import() perf
	performance.mark('code/willLoadAgentMain');

	// Import agent main module
	try {
		let agentUrl: string;
		if (isDev && globalThis._VSCODE_USE_RELATIVE_IMPORTS) {
			agentUrl = '../../../workbench/workbench.agent.desktop.main.js';
		} else {
			agentUrl = new URL('vs/workbench/workbench.agent.desktop.main.js', baseUrl).href;
		}

		const result: IAgentMain = await import(agentUrl);

		performance.mark('code/didLoadAgentMain');

		// Start agent
		result.main(configuration);
	} catch (error) {
		onUnexpectedError(error as Error);
		throw error;
	}
}());
