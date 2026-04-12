"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-restricted-globals */
(async function () {
    // Add a perf entry right from the top
    performance.mark('code/didStartRenderer');
    const preloadGlobals = window.vscode; // defined by preload.ts
    const safeProcess = preloadGlobals.process;
    //#region Splash Screen
    function showSplash(configuration) {
        performance.mark('code/willShowPartsSplash');
        let data = configuration.partsSplash;
        if (data) {
            if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
                if ((configuration.colorScheme.dark && data.baseTheme !== 'hc-black') || (!configuration.colorScheme.dark && data.baseTheme !== 'hc-light')) {
                    data = undefined; // high contrast mode has been turned by the OS -> ignore stored colors and layouts
                }
            }
            else if (configuration.autoDetectColorScheme) {
                if ((configuration.colorScheme.dark && data.baseTheme !== 'vs-dark') || (!configuration.colorScheme.dark && data.baseTheme !== 'vs')) {
                    data = undefined; // OS color scheme is tracked and has changed
                }
            }
        }
        // minimal color configuration (works with or without persisted data)
        let baseTheme = 'vs-dark';
        let shellBackground = '#1E1E1E';
        let shellForeground = '#CCCCCC';
        if (data) {
            baseTheme = data.baseTheme;
            shellBackground = data.colorInfo.editorBackground ?? data.colorInfo.background;
            shellForeground = data.colorInfo.foreground ?? shellForeground;
        }
        else if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
            if (configuration.colorScheme.dark) {
                baseTheme = 'hc-black';
                shellBackground = '#000000';
                shellForeground = '#FFFFFF';
            }
            else {
                baseTheme = 'hc-light';
                shellBackground = '#FFFFFF';
                shellForeground = '#000000';
            }
        }
        else if (configuration.autoDetectColorScheme) {
            if (configuration.colorScheme.dark) {
                baseTheme = 'vs-dark';
                shellBackground = '#1E1E1E';
                shellForeground = '#CCCCCC';
            }
            else {
                baseTheme = 'vs';
                shellBackground = '#FFFFFF';
                shellForeground = '#000000';
            }
        }
        // Apply base colors
        const style = document.createElement('style');
        style.className = 'initialShellColors';
        window.document.head.appendChild(style);
        style.textContent = `body { background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }`;
        // Set zoom level from splash data if available
        if (typeof data?.zoomLevel === 'number' && typeof preloadGlobals?.webFrame?.setZoomLevel === 'function') {
            preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
        }
        const splash = document.createElement('div');
        splash.id = 'monaco-parts-splash';
        splash.className = baseTheme ?? 'vs-dark';
        window.document.body.appendChild(splash);
        performance.mark('code/didShowPartsSplash');
    }
    //#endregion
    //#region Window Helpers
    async function load(options) {
        // Window Configuration from Preload Script
        const configuration = await resolveWindowConfiguration();
        // Signal before import()
        options?.beforeImport?.(configuration);
        // Developer settings
        const { enableDeveloperKeybindings, removeDeveloperKeybindingsAfterLoad, developerDeveloperKeybindingsDisposable, forceDisableShowDevtoolsOnError } = setupDeveloperKeybindings(configuration, options);
        // NLS
        setupNLS(configuration);
        // Compute base URL and set as global
        const baseUrl = new URL(`${fileUriFromPath(configuration.appRoot, { isWindows: safeProcess.platform === 'win32', scheme: 'vscode-file', fallbackAuthority: 'vscode-app' })}/out/`);
        globalThis._VSCODE_FILE_ROOT = baseUrl.toString();
        // Dev only: CSS import map tricks
        setupCSSImportMaps(configuration, baseUrl);
        // ESM Import - load the sessions workbench main module
        try {
            let workbenchUrl;
            if (!!safeProcess.env['VSCODE_DEV'] && globalThis._VSCODE_USE_RELATIVE_IMPORTS) {
                workbenchUrl = './sessions.desktop.main.js'; // for dev purposes only
            }
            else {
                workbenchUrl = new URL(`vs/sessions/sessions.desktop.main.js`, baseUrl).href;
            }
            const result = await import(workbenchUrl);
            if (developerDeveloperKeybindingsDisposable && removeDeveloperKeybindingsAfterLoad) {
                developerDeveloperKeybindingsDisposable();
            }
            return { result, configuration };
        }
        catch (error) {
            onUnexpectedError(error, enableDeveloperKeybindings && !forceDisableShowDevtoolsOnError);
            throw error;
        }
    }
    async function resolveWindowConfiguration() {
        const timeout = setTimeout(() => { console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`); }, 10000);
        performance.mark('code/willWaitForWindowConfig');
        const configuration = await preloadGlobals.context.resolveConfiguration();
        performance.mark('code/didWaitForWindowConfig');
        clearTimeout(timeout);
        return configuration;
    }
    function setupDeveloperKeybindings(configuration, options) {
        const { forceEnableDeveloperKeybindings, disallowReloadKeybinding, removeDeveloperKeybindingsAfterLoad, forceDisableShowDevtoolsOnError } = typeof options?.configureDeveloperSettings === 'function' ? options.configureDeveloperSettings(configuration) : {
            forceEnableDeveloperKeybindings: false,
            disallowReloadKeybinding: false,
            removeDeveloperKeybindingsAfterLoad: false,
            forceDisableShowDevtoolsOnError: false
        };
        const isDev = !!safeProcess.env['VSCODE_DEV'];
        const enableDeveloperKeybindings = Boolean(isDev || forceEnableDeveloperKeybindings);
        let developerDeveloperKeybindingsDisposable = undefined;
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
        let listener = function (e) {
            const key = extractKey(e);
            if (key === TOGGLE_DEV_TOOLS_KB || key === TOGGLE_DEV_TOOLS_KB_ALT) {
                ipcRenderer.send('vscode:toggleDevTools');
            }
            else if (key === RELOAD_KB && !disallowReloadKeybinding) {
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
    function setupNLS(configuration) {
        globalThis._VSCODE_NLS_MESSAGES = configuration.nls.messages;
        globalThis._VSCODE_NLS_LANGUAGE = configuration.nls.language;
        let language = configuration.nls.language || 'en';
        if (language === 'zh-tw') {
            language = 'zh-Hant';
        }
        else if (language === 'zh-cn') {
            language = 'zh-Hans';
        }
        window.document.documentElement.setAttribute('lang', language);
    }
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
    function fileUriFromPath(path, config) {
        // Since we are building a URI, we normalize any backslash
        // to slashes and we ensure that the path begins with a '/'.
        let pathName = path.replace(/\\/g, '/');
        if (pathName.length > 0 && pathName.charAt(0) !== '/') {
            pathName = `/${pathName}`;
        }
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
    function setupCSSImportMaps(configuration, baseUrl) {
        // DEV ---------------------------------------------------------------------------------------
        // DEV: This is for development and enables loading CSS via import-statements via import-maps.
        // DEV: For each CSS modules that we have we defined an entry in the import map that maps to
        // DEV: a blob URL that loads the CSS via a dynamic @import-rule.
        // DEV ---------------------------------------------------------------------------------------
        if (globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP) {
            return; // disabled in certain development setups
        }
        if (Array.isArray(configuration.cssModules) && configuration.cssModules.length > 0) {
            performance.mark('code/willAddCssLoader');
            globalThis._VSCODE_CSS_LOAD = function (url) {
                const link = document.createElement('link');
                link.setAttribute('rel', 'stylesheet');
                link.setAttribute('type', 'text/css');
                link.setAttribute('href', url);
                window.document.head.appendChild(link);
            };
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
            // @ts-expect-error
            importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
            window.document.head.appendChild(importMapScript);
            performance.mark('code/didAddCssLoader');
        }
    }
    //#endregion
    const { result, configuration } = await load({
        configureDeveloperSettings: function (windowConfig) {
            return {
                // disable automated devtools opening on error when running extension tests
                // as this can lead to nondeterministic test execution (devtools steals focus)
                forceDisableShowDevtoolsOnError: typeof windowConfig.extensionTestsPath === 'string' || windowConfig['enable-smoke-test-driver'] === true,
                // enable devtools keybindings in extension development window
                forceEnableDeveloperKeybindings: Array.isArray(windowConfig.extensionDevelopmentPath) && windowConfig.extensionDevelopmentPath.length > 0,
                removeDeveloperKeybindingsAfterLoad: true
            };
        },
        beforeImport: function (windowConfig) {
            // Show our splash as early as possible
            showSplash(windowConfig);
            // Code windows have a `vscodeWindowId` property to identify them
            Object.defineProperty(window, 'vscodeWindowId', {
                get: () => windowConfig.windowId
            });
            // It looks like browsers only lazily enable
            // the <canvas> element when needed. Since we
            // leverage canvas elements in our code in many
            // locations, we try to help the browser to
            // initialize canvas when it is idle, right
            // before we wait for the scripts to be loaded.
            window.requestIdleCallback(() => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context?.clearRect(0, 0, canvas.width, canvas.height);
                canvas.remove();
            }, { timeout: 50 });
            // Track import() perf
            performance.mark('code/willLoadWorkbenchMain');
        }
    });
    // Mark start of workbench
    performance.mark('code/didLoadWorkbenchMain');
    // Load workbench
    result.main(configuration);
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9lbGVjdHJvbi1icm93c2VyL3Nlc3Npb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRztBQUVoRywwQ0FBMEM7QUFFMUMsQ0FBQyxLQUFLO0lBRUwsc0NBQXNDO0lBQ3RDLFdBQVcsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQVMxQyxNQUFNLGNBQWMsR0FBSSxNQUEyRCxDQUFDLE1BQU0sQ0FBQyxDQUFDLHdCQUF3QjtJQUNwSCxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDO0lBRTNDLHVCQUF1QjtJQUV2QixTQUFTLFVBQVUsQ0FBQyxhQUF5QztRQUM1RCxXQUFXLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFFN0MsSUFBSSxJQUFJLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQztRQUNyQyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsSUFBSSxhQUFhLENBQUMsc0JBQXNCLElBQUksYUFBYSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDcEYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDN0ksSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLG1GQUFtRjtnQkFDdEcsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFT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