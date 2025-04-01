/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	type ISandboxConfiguration = import('./vs/base/parts/sandbox/common/sandboxTypes.js').ISandboxConfiguration;
	type ILoadResult<M, T extends ISandboxConfiguration> = import('./vs/platform/window/electron-sandbox/window.js').ILoadResult<M, T>;
	type ILoadOptions<T extends ISandboxConfiguration> = import('./vs/platform/window/electron-sandbox/window.js').ILoadOptions<T>;
	type IMainWindowSandboxGlobals = import('./vs/base/parts/sandbox/electron-sandbox/globals.js').IMainWindowSandboxGlobals;

	const preloadGlobals: IMainWindowSandboxGlobals = (window as any).vscode; // defined by preload.ts
	const safeProcess = preloadGlobals.process;

	async function load<M, T extends ISandboxConfiguration>(esModule: string, options: ILoadOptions<T>): Promise<ILoadResult<M, T>> {

		// Window Configuration from Preload Script
		const configuration = await resolveWindowConfiguration<T>();

		// Signal before import()
		options?.beforeImport?.(configuration);

		// Developer settings
		const { enableDeveloperKeybindings, removeDeveloperKeybindingsAfterLoad, developerDeveloperKeybindingsDisposable, forceDisableShowDevtoolsOnError } = setupDeveloperKeybindings(configuration, options);

		// NLS
		setupNLS<T>(configuration);

		// Compute base URL and set as global
		const baseUrl = new URL(`${fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out/`);
		globalThis._VSCODE_FILE_ROOT = baseUrl.toString();

		// Dev only: CSS import map tricks
		setupCSSImportMaps<T>(configuration, baseUrl);

		// ESM Import
		try {
			const result = await import(new URL(`${esModule}.js`, baseUrl).href);

			if (developerDeveloperKeybindingsDisposable && removeDeveloperKeybindingsAfterLoad) {
				developerDeveloperKeybindingsDisposable();
			}

			return { result, configuration };
		} catch (error) {
			onUnexpectedError(error, enableDeveloperKeybindings && !forceDisableShowDevtoolsOnError);

			throw error;
		}
	}

	async function resolveWindowConfiguration<T extends ISandboxConfiguration>() {
		const timeout = setTimeout(() => { console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`); }, 10000);
		performance.mark('code/willWaitForWindowConfig');

		const configuration = await preloadGlobals.context.resolveConfiguration() as T;
		performance.mark('code/didWaitForWindowConfig');

		clearTimeout(timeout);

		return configuration;
	}

	function setupDeveloperKeybindings<T extends ISandboxConfiguration>(configuration: T, options: ILoadOptions<T>) {
		const {
			forceEnableDeveloperKeybindings,
			disallowReloadKeybinding,
			removeDeveloperKeybindingsAfterLoad,
			forceDisableShowDevtoolsOnError
		} = typeof options?.configureDeveloperSettings === 'function' ? options.configureDeveloperSettings(configuration) : {
			forceEnableDeveloperKeybindings: false,
			disallowReloadKeybinding: false,
			removeDeveloperKeybindingsAfterLoad: false,
			forceDisableShowDevtoolsOnError: false
		};

		const isDev = !!safeProcess.env['VSCODE_DEV'];
		const enableDeveloperKeybindings = Boolean(isDev || forceEnableDeveloperKeybindings);
		let developerDeveloperKeybindingsDisposable: Function | undefined = undefined;
		if (enableDeveloperKeybindings) {
			developerDeveloperKeybindingsDisposable = registerDeveloperKeybindings(disallowReloadKeybinding);
		}

		return {
			enableDeveloperKeybindings,
			removeDeveloperKeybindingsAfterLoad,
			developerDeveloperKeybindingsDisposable,
			forceDisableShowDevtoolsOnError
		};
	}

	function registerDeveloperKeybindings(disallowReloadKeybinding: boolean | undefined): Function {
		const ipcRenderer = preloadGlobals.ipcRenderer;

		const extractKey =
			function (e: KeyboardEvent) {
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

		let listener: ((e: KeyboardEvent) => void) | undefined = function (e) {
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

	function onUnexpectedError(error: string | Error, showDevtoolsOnError: boolean): void {
		if (showDevtoolsOnError) {
			const ipcRenderer = preloadGlobals.ipcRenderer;
			ipcRenderer.send('vscode:openDevTools');
		}

		console.error(`[uncaught exception]: ${error}`);

		if (error && typeof error !== 'string' && error.stack) {
			console.error(error.stack);
		}
	}

	function fileUriFromPath(path: string, config: { isWindows?: boolean; scheme?: string; fallbackAuthority?: string }): string {

		// Since we are building a URI, we normalize any backslash
		// to slashes and we ensure that the path begins with a '/'.
		let pathName = path.replace(/\\/g, '/');
		if (pathName.length > 0 && pathName.charAt(0) !== '/') {
			pathName = `/${pathName}`;
		}

		let uri: string;

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

	function setupCSSImportMaps<T extends ISandboxConfiguration>(configuration: T, baseUrl: URL) {

		// DEV ---------------------------------------------------------------------------------------
		// DEV: This is for development and enables loading CSS via import-statements via import-maps.
		// DEV: For each CSS modules that we have we defined an entry in the import map that maps to
		// DEV: a blob URL that loads the CSS via a dynamic @import-rule.
		// DEV ---------------------------------------------------------------------------------------

		if (Array.isArray(configuration.cssModules) && configuration.cssModules.length > 0) {
			performance.mark('code/willAddCssLoader');

			const style = document.createElement('style');
			style.type = 'text/css';
			style.media = 'screen';
			style.id = 'vscode-css-loading';
			document.head.appendChild(style);

			globalThis._VSCODE_CSS_LOAD = function (url) {
				style.textContent += `@import url(${url});\n`;
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
			// @ts-ignore
			importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
			document.head.appendChild(importMapScript);

			performance.mark('code/didAddCssLoader');
		}
	}

	(globalThis as any).MonacoBootstrapWindow = { load };
}());
