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
    //#region Splash Screen Helpers
    function showSplash(configuration) {
        performance.mark('code/willShowPartsSplash');
        showDefaultSplash(configuration);
        performance.mark('code/didShowPartsSplash');
    }
    function showDefaultSplash(configuration) {
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
        // developing an extension -> ignore stored layouts
        if (data && configuration.extensionDevelopmentPath) {
            data.layoutInfo = undefined;
        }
        // minimal color configuration (works with or without persisted data)
        let baseTheme;
        let shellBackground;
        let shellForeground;
        if (data) {
            baseTheme = data.baseTheme;
            shellBackground = data.colorInfo.editorBackground;
            shellForeground = data.colorInfo.foreground;
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
        const style = document.createElement('style');
        style.className = 'initialShellColors';
        window.document.head.appendChild(style);
        style.textContent = `body {	background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }`;
        // set zoom level as soon as possible
        if (typeof data?.zoomLevel === 'number' && typeof preloadGlobals?.webFrame?.setZoomLevel === 'function') {
            preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
        }
        // restore parts if possible (we might not always store layout info)
        if (data?.layoutInfo) {
            const { layoutInfo, colorInfo } = data;
            const splash = document.createElement('div');
            splash.id = 'monaco-parts-splash';
            splash.className = baseTheme ?? 'vs-dark';
            if (layoutInfo.windowBorder && colorInfo.windowBorder) {
                const borderElement = document.createElement('div');
                borderElement.style.position = 'absolute';
                borderElement.style.width = 'calc(100vw - 2px)';
                borderElement.style.height = 'calc(100vh - 2px)';
                borderElement.style.zIndex = '1'; // allow border above other elements
                borderElement.style.border = `1px solid var(--window-border-color)`;
                borderElement.style.setProperty('--window-border-color', colorInfo.windowBorder);
                if (layoutInfo.windowBorderRadius) {
                    borderElement.style.borderRadius = layoutInfo.windowBorderRadius;
                }
                splash.appendChild(borderElement);
            }
            if (layoutInfo.auxiliaryBarWidth === Number.MAX_SAFE_INTEGER) {
                // if auxiliary bar is maximized, it goes as wide as the
                // window width but leaving room for activity bar
                layoutInfo.auxiliaryBarWidth = window.innerWidth - layoutInfo.activityBarWidth;
            }
            else {
                // otherwise adjust for other parts sizes if not maximized
                layoutInfo.auxiliaryBarWidth = Math.min(layoutInfo.auxiliaryBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.sideBarWidth));
            }
            layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.auxiliaryBarWidth));
            // part: title
            if (layoutInfo.titleBarHeight > 0) {
                const titleDiv = document.createElement('div');
                titleDiv.style.position = 'absolute';
                titleDiv.style.width = '100%';
                titleDiv.style.height = `${layoutInfo.titleBarHeight}px`;
                titleDiv.style.left = '0';
                titleDiv.style.top = '0';
                titleDiv.style.backgroundColor = `${colorInfo.titleBarBackground}`;
                titleDiv.style['-webkit-app-region'] = 'drag';
                splash.appendChild(titleDiv);
                if (colorInfo.titleBarBorder) {
                    const titleBorder = document.createElement('div');
                    titleBorder.style.position = 'absolute';
                    titleBorder.style.width = '100%';
                    titleBorder.style.height = '1px';
                    titleBorder.style.left = '0';
                    titleBorder.style.bottom = '0';
                    titleBorder.style.borderBottom = `1px solid ${colorInfo.titleBarBorder}`;
                    titleDiv.appendChild(titleBorder);
                }
            }
            // part: activity bar
            if (layoutInfo.activityBarWidth > 0) {
                const activityDiv = document.createElement('div');
                activityDiv.style.position = 'absolute';
                activityDiv.style.width = `${layoutInfo.activityBarWidth}px`;
                activityDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
                activityDiv.style.top = `${layoutInfo.titleBarHeight}px`;
                if (layoutInfo.sideBarSide === 'left') {
                    activityDiv.style.left = '0';
                }
                else {
                    activityDiv.style.right = '0';
                }
                activityDiv.style.backgroundColor = `${colorInfo.activityBarBackground}`;
                splash.appendChild(activityDiv);
                if (colorInfo.activityBarBorder) {
                    const activityBorderDiv = document.createElement('div');
                    activityBorderDiv.style.position = 'absolute';
                    activityBorderDiv.style.width = '1px';
                    activityBorderDiv.style.height = '100%';
                    activityBorderDiv.style.top = '0';
                    if (layoutInfo.sideBarSide === 'left') {
                        activityBorderDiv.style.right = '0';
                        activityBorderDiv.style.borderRight = `1px solid ${colorInfo.activityBarBorder}`;
                    }
                    else {
                        activityBorderDiv.style.left = '0';
                        activityBorderDiv.style.borderLeft = `1px solid ${colorInfo.activityBarBorder}`;
                    }
                    activityDiv.appendChild(activityBorderDiv);
                }
            }
            // part: side bar
            if (layoutInfo.sideBarWidth > 0) {
                const sideDiv = document.createElement('div');
                sideDiv.style.position = 'absolute';
                sideDiv.style.width = `${layoutInfo.sideBarWidth}px`;
                sideDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
                sideDiv.style.top = `${layoutInfo.titleBarHeight}px`;
                if (layoutInfo.sideBarSide === 'left') {
                    sideDiv.style.left = `${layoutInfo.activityBarWidth}px`;
                }
                else {
                    sideDiv.style.right = `${layoutInfo.activityBarWidth}px`;
                }
                sideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
                splash.appendChild(sideDiv);
                if (colorInfo.sideBarBorder) {
                    const sideBorderDiv = document.createElement('div');
                    sideBorderDiv.style.position = 'absolute';
                    sideBorderDiv.style.width = '1px';
                    sideBorderDiv.style.height = '100%';
                    sideBorderDiv.style.top = '0';
                    sideBorderDiv.style.right = '0';
                    if (layoutInfo.sideBarSide === 'left') {
                        sideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
                    }
                    else {
                        sideBorderDiv.style.left = '0';
                        sideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
                    }
                    sideDiv.appendChild(sideBorderDiv);
                }
            }
            // part: auxiliary sidebar
            if (layoutInfo.auxiliaryBarWidth > 0) {
                const auxSideDiv = document.createElement('div');
                auxSideDiv.style.position = 'absolute';
                auxSideDiv.style.width = `${layoutInfo.auxiliaryBarWidth}px`;
                auxSideDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
                auxSideDiv.style.top = `${layoutInfo.titleBarHeight}px`;
                if (layoutInfo.sideBarSide === 'left') {
                    auxSideDiv.style.right = '0';
                }
                else {
                    auxSideDiv.style.left = '0';
                }
                auxSideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
                splash.appendChild(auxSideDiv);
                if (colorInfo.sideBarBorder) {
                    const auxSideBorderDiv = document.createElement('div');
                    auxSideBorderDiv.style.position = 'absolute';
                    auxSideBorderDiv.style.width = '1px';
                    auxSideBorderDiv.style.height = '100%';
                    auxSideBorderDiv.style.top = '0';
                    if (layoutInfo.sideBarSide === 'left') {
                        auxSideBorderDiv.style.left = '0';
                        auxSideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
                    }
                    else {
                        auxSideBorderDiv.style.right = '0';
                        auxSideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
                    }
                    auxSideDiv.appendChild(auxSideBorderDiv);
                }
            }
            // part: statusbar
            if (layoutInfo.statusBarHeight > 0) {
                const statusDiv = document.createElement('div');
                statusDiv.style.position = 'absolute';
                statusDiv.style.width = '100%';
                statusDiv.style.height = `${layoutInfo.statusBarHeight}px`;
                statusDiv.style.bottom = '0';
                statusDiv.style.left = '0';
                if (configuration.workspace && colorInfo.statusBarBackground) {
                    statusDiv.style.backgroundColor = colorInfo.statusBarBackground;
                }
                else if (!configuration.workspace && colorInfo.statusBarNoFolderBackground) {
                    statusDiv.style.backgroundColor = colorInfo.statusBarNoFolderBackground;
                }
                splash.appendChild(statusDiv);
                if (colorInfo.statusBarBorder) {
                    const statusBorderDiv = document.createElement('div');
                    statusBorderDiv.style.position = 'absolute';
                    statusBorderDiv.style.width = '100%';
                    statusBorderDiv.style.height = '1px';
                    statusBorderDiv.style.top = '0';
                    statusBorderDiv.style.borderTop = `1px solid ${colorInfo.statusBarBorder}`;
                    statusDiv.appendChild(statusBorderDiv);
                }
            }
            window.document.body.appendChild(splash);
        }
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
        // ESM Import
        try {
            let workbenchUrl;
            if (!!safeProcess.env['VSCODE_DEV'] && globalThis._VSCODE_USE_RELATIVE_IMPORTS) {
                workbenchUrl = '../../../workbench/workbench.desktop.main.js'; // for dev purposes only
            }
            else {
                workbenchUrl = new URL(`vs/workbench/workbench.desktop.main.js`, baseUrl).href;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvY29kZS9lbGVjdHJvbi1icm93c2VyL3dvcmtiZW5jaC93b3JrYmVuY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHO0FBRWhHLDBDQUEwQztBQUUxQyxDQUFDLEtBQUs7SUFFTCxzQ0FBc0M7SUFDdEMsV0FBVyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBUzFDLE1BQU0sY0FBYyxHQUFJLE1BQTJELENBQUMsTUFBTSxDQUFDLENBQUMsd0JBQXdCO0lBQ3BILE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUM7SUFFM0MsK0JBQStCO0lBRS9CLFNBQVMsVUFBVSxDQUFDLGFBQXlDO1FBQzVELFdBQVcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUM3QyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqQyxXQUFXLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELFNBQVMsaUJBQWlCLENBQUMsYUFBeUM7UUFDbkUsSUFBSSxJQUFJLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQztRQUNyQyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsSUFBSSxhQUFhLENBQUMsc0JBQXNCLElBQUksYUFBYSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDcEYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDN0ksSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLG1GQUFt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