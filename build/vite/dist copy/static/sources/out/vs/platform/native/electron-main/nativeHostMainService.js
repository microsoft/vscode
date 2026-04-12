/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as fs from 'fs';
import { exec } from 'child_process';
import { app, BrowserWindow, clipboard, contentTracing, Menu, Notification, powerMonitor, powerSaveBlocker, screen, shell, webContents } from 'electron';
import { arch, cpus, freemem, loadavg, platform, release, totalmem, type } from 'os';
import { promisify } from 'util';
import { memoize } from '../../../base/common/decorators.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { dirname, join, posix, resolve, win32 } from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { virtualMachineHint } from '../../../base/node/id.js';
import { Promises, SymlinkSupport } from '../../../base/node/pfs.js';
import { findFreePort, isPortFree } from '../../../base/node/ports.js';
import { localize } from '../../../nls.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { defaultWindowState } from '../../window/electron-main/window.js';
import { defaultBrowserWindowOptions, IWindowsMainService } from '../../windows/electron-main/windows.js';
import { isWorkspaceIdentifier, toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { hasWSLFeatureInstalled } from '../../remote/node/wsl.js';
import { WindowProfiler } from '../../profiling/electron-main/windowProfiling.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { CancellationError } from '../../../base/common/errors.js';
import { zip } from '../../../base/node/zip.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IProxyAuthService } from './auth.js';
import { IRequestService } from '../../request/common/request.js';
import { randomPath } from '../../../base/common/extpath.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
export const INativeHostMainService = createDecorator('nativeHostMainService');
let NativeHostMainService = class NativeHostMainService extends Disposable {
    constructor(windowsMainService, auxiliaryWindowsMainService, dialogMainService, lifecycleMainService, environmentMainService, logService, productService, themeMainService, workspacesManagementMainService, configurationService, requestService, proxyAuthService, instantiationService) {
        super();
        this.windowsMainService = windowsMainService;
        this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
        this.dialogMainService = dialogMainService;
        this.lifecycleMainService = lifecycleMainService;
        this.environmentMainService = environmentMainService;
        this.logService = logService;
        this.productService = productService;
        this.themeMainService = themeMainService;
        this.workspacesManagementMainService = workspacesManagementMainService;
        this.configurationService = configurationService;
        this.requestService = requestService;
        this.proxyAuthService = proxyAuthService;
        this.instantiationService = instantiationService;
        this._onDidChangePassword = this._register(new Emitter());
        this.onDidChangePassword = this._onDidChangePassword.event;
        this._isTracing = false;
        // #endregion
        //#region Toast Notifications
        this.activeToasts = this._register(new DisposableMap());
        // Events
        {
            this.onDidOpenMainWindow = Event.map(this.windowsMainService.onDidOpenWindow, window => window.id);
            this.onDidTriggerWindowSystemContextMenu = Event.any(Event.map(this.windowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y })), Event.map(this.auxiliaryWindowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y })));
            this.onDidMaximizeWindow = Event.any(Event.map(this.windowsMainService.onDidMaximizeWindow, window => window.id), Event.map(this.auxiliaryWindowsMainService.onDidMaximizeWindow, window => window.id));
            this.onDidUnmaximizeWindow = Event.any(Event.map(this.windowsMainService.onDidUnmaximizeWindow, window => window.id), Event.map(this.auxiliaryWindowsMainService.onDidUnmaximizeWindow, window => window.id));
            this.onDidChangeWindowFullScreen = Event.any(Event.map(this.windowsMainService.onDidChangeFullScreen, e => ({ windowId: e.window.id, fullscreen: e.fullscreen })), Event.map(this.auxiliaryWindowsMainService.onDidChangeFullScreen, e => ({ windowId: e.window.id, fullscreen: e.fullscreen })));
            this.onDidChangeWindowAlwaysOnTop = Event.any(Event.None, // always on top is unsupported in main windows currently
            Event.map(this.auxiliaryWindowsMainService.onDidChangeAlwaysOnTop, e => ({ windowId: e.window.id, alwaysOnTop: e.alwaysOnTop })));
            this.onDidBlurMainWindow = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (event, window) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));
            this.onDidFocusMainWindow = Event.any(Event.map(Event.filter(Event.map(this.windowsMainService.onDidChangeWindowsCount, () => this.windowsMainService.getLastActiveWindow()), window => !!window), window => window.id), Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (event, window) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId)));
            this.onDidBlurMainOrAuxiliaryWindow = Event.any(this.onDidBlurMainWindow, Event.map(Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), window => !!window), window => window.id));
            this.onDidFocusMainOrAuxiliaryWindow = Event.any(this.onDidFocusMainWindow, Event.map(Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), window => !!window), window => window.id));
            this.onDidSuspendOS = Event.fromNodeEventEmitter(powerMonitor, 'suspend');
            this.onDidResumeOS = Event.fromNodeEventEmitter(powerMonitor, 'resume');
            // Battery power events (macOS and Windows only)
            this.onDidChangeOnBatteryPower = Event.any(Event.map(Event.fromNodeEventEmitter(powerMonitor, 'on-ac'), () => false), Event.map(Event.fromNodeEventEmitter(powerMonitor, 'on-battery'), () => true));
            // Thermal state events (macOS only)
            this.onDidChangeThermalState = Event.map(Event.fromNodeEventEmitter(powerMonitor, 'thermal-state-change'), e => e.state);
            // Speed limit events (macOS and Windows only)
            this.onDidChangeSpeedLimit = Event.map(Event.fromNodeEventEmitter(powerMonitor, 'speed-limit-change'), e => e.limit);
            // Shutdown event (Linux and macOS only)
            this.onWillShutdownOS = Event.fromNodeEventEmitter(powerMonitor, 'shutdown');
            // Screen lock events (macOS and Windows only)
            this.onDidLockScreen = Event.fromNodeEventEmitter(powerMonitor, 'lock-screen');
            this.onDidUnlockScreen = Event.fromNodeEventEmitter(powerMonitor, 'unlock-screen');
            this.onDidChangeColorScheme = this.themeMainService.onDidChangeColorScheme;
            this.onDidChangeDisplay = Event.debounce(Event.any(Event.filter(Event.fromNodeEventEmitter(screen, 'display-metrics-changed', (event, display, changedMetrics) => changedMetrics), changedMetrics => {
                // Electron will emit 'display-metrics-changed' events even when actually
                // going fullscreen, because the dock hides. However, we do not want to
                // react on this event as there is no change in display bounds.
                return !(Array.isArray(changedMetrics) && changedMetrics.length === 1 && changedMetrics[0] === 'workArea');
            }), Event.fromNodeEventEmitter(screen, 'display-added'), Event.fromNodeEventEmitter(screen, 'display-removed')), () => { }, 100);
        }
    }
    //#region Properties
    get windowId() { throw new Error('Not implemented in electron-main'); }
    async getWindows(windowId, options) {
        const mainWindows = this.windowsMainService.getWindows().map(window => ({
            id: window.id,
            workspace: window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost),
            title: window.win?.getTitle() ?? '',
            filename: window.getRepresentedFilename(),
            dirty: window.isDocumentEdited()
        }));
        const auxiliaryWindows = [];
        if (options.includeAuxiliaryWindows) {
            auxiliaryWindows.push(...this.auxiliaryWindowsMainService.getWindows().map(window => ({
                id: window.id,
                parentId: window.parentId,
                title: window.win?.getTitle() ?? '',
                filename: window.getRepresentedFilename()
            })));
        }
        return [...mainWindows, ...auxiliaryWindows];
    }
    async getWindowCount(windowId) {
        return this.windowsMainService.getWindowCount();
    }
    async getActiveWindowId(windowId) {
        const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
        if (activeWindow) {
            return activeWindow.id;
        }
        return undefined;
    }
    async getActiveWindowPosition() {
        const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
        if (activeWindow) {
            return activeWindow.getBounds();
        }
        return undefined;
    }
    async getNativeWindowHandle(fallbackWindowId, windowId) {
        const window = this.windowById(windowId, fallbackWindowId);
        if (window?.win) {
            return VSBuffer.wrap(window.win.getNativeWindowHandle());
        }
        return undefined;
    }
    openWindow(windowId, arg1, arg2) {
        if (Array.isArray(arg1)) {
            return this.doOpenWindow(windowId, arg1, arg2);
        }
        return this.doOpenEmptyWindow(windowId, arg1);
    }
    async doOpenWindow(windowId, toOpen, options = Object.create(null)) {
        if (toOpen.length > 0) {
            await this.windowsMainService.open({
                context: 5 /* OpenContext.API */,
                contextWindowId: windowId,
                urisToOpen: toOpen,
                cli: this.environmentMainService.args,
                forceNewWindow: options.forceNewWindow,
                forceReuseWindow: options.forceReuseWindow,
                preferNewWindow: options.preferNewWindow,
                diffMode: options.diffMode,
                mergeMode: options.mergeMode,
                addMode: options.addMode,
                removeMode: options.removeMode,
                gotoLineMode: options.gotoLineMode,
                noRecentEntry: options.noRecentEntry,
                waitMarkerFileURI: options.waitMarkerFileURI,
                remoteAuthority: options.remoteAuthority || undefined,
                forceProfile: options.forceProfile,
                forceTempProfile: options.forceTempProfile,
            });
        }
    }
    async doOpenEmptyWindow(windowId, options) {
        await this.windowsMainService.openEmptyWindow({
            context: 5 /* OpenContext.API */,
            contextWindowId: windowId
        }, options);
    }
    async openAgentsWindow(windowId) {
        await this.windowsMainService.openAgentsWindow({
            context: 5 /* OpenContext.API */,
            contextWindowId: windowId,
            cli: this.environmentMainService.args
        });
    }
    async isFullScreen(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return window?.isFullScreen ?? false;
    }
    async toggleFullScreen(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.toggleFullScreen();
    }
    async getCursorScreenPoint(windowId) {
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        return { point, display: display.bounds };
    }
    async isMaximized(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return window?.win?.isMaximized() ?? false;
    }
    async maximizeWindow(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.maximize();
    }
    async unmaximizeWindow(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.unmaximize();
    }
    async minimizeWindow(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.minimize();
    }
    async moveWindowTop(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.moveTop();
    }
    async isWindowAlwaysOnTop(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return window?.win?.isAlwaysOnTop() ?? false;
    }
    async toggleWindowAlwaysOnTop(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.setAlwaysOnTop(!window.win.isAlwaysOnTop());
    }
    async setWindowAlwaysOnTop(windowId, alwaysOnTop, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.setAlwaysOnTop(alwaysOnTop);
    }
    async positionWindow(windowId, position, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        if (window?.win) {
            if (window.win.isFullScreen()) {
                const fullscreenLeftFuture = Event.toPromise(Event.once(Event.fromNodeEventEmitter(window.win, 'leave-full-screen')));
                window.win.setFullScreen(false);
                await fullscreenLeftFuture;
            }
            window.win.setBounds(position);
        }
    }
    async updateWindowControls(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.updateWindowControls(options);
    }
    async updateWindowAccentColor(windowId, color, inactiveColor) {
        if (!isWindows) {
            return; // windows only
        }
        const window = this.windowById(windowId);
        if (!window) {
            return;
        }
        let activeWindowAccentColor;
        let inactiveWindowAccentColor;
        if (color === 'default') {
            activeWindowAccentColor = null;
            inactiveWindowAccentColor = null;
        }
        else if (color === 'off') {
            activeWindowAccentColor = false;
            inactiveWindowAccentColor = false;
        }
        else {
            activeWindowAccentColor = color;
            inactiveWindowAccentColor = inactiveColor ?? color;
        }
        const windows = [window];
        for (const auxiliaryWindow of this.auxiliaryWindowsMainService.getWindows()) {
            if (auxiliaryWindow.parentId === windowId) {
                windows.push(auxiliaryWindow);
            }
        }
        for (const window of windows) {
            window.win?.setAccentColor(window.win.isFocused() ? activeWindowAccentColor : inactiveWindowAccentColor);
        }
    }
    async focusWindow(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.focus({ mode: options?.mode ?? 0 /* FocusMode.Transfer */ });
    }
    async setMinimumSize(windowId, width, height) {
        const window = this.codeWindowById(windowId);
        if (window?.win) {
            const [windowWidth, windowHeight] = window.win.getSize();
            const [minWindowWidth, minWindowHeight] = window.win.getMinimumSize();
            const [newMinWindowWidth, newMinWindowHeight] = [width ?? minWindowWidth, height ?? minWindowHeight];
            const [newWindowWidth, newWindowHeight] = [Math.max(windowWidth, newMinWindowWidth), Math.max(windowHeight, newMinWindowHeight)];
            if (minWindowWidth !== newMinWindowWidth || minWindowHeight !== newMinWindowHeight) {
                window.win.setMinimumSize(newMinWindowWidth, newMinWindowHeight);
            }
            if (windowWidth !== newWindowWidth || windowHeight !== newWindowHeight) {
                window.win.setSize(newWindowWidth, newWindowHeight);
            }
        }
    }
    async saveWindowSplash(windowId, splash) {
        const window = this.codeWindowById(windowId);
        this.themeMainService.saveWindowSplash(windowId, window?.openedWorkspace, splash);
    }
    async setBackgroundThrottling(windowId, allowed) {
        const window = this.codeWindowById(windowId);
        this.logService.trace(`Setting background throttling for window ${windowId} to '${allowed}'`);
        window?.win?.webContents?.setBackgroundThrottling(allowed);
    }
    //#endregion
    //#region macOS Shell Command
    async installShellCommand(windowId) {
        const { source, target } = await this.getShellCommandLink();
        // Only install unless already existing
        try {
            const { symbolicLink } = await SymlinkSupport.stat(source);
            if (symbolicLink && !symbolicLink.dangling) {
                const linkTargetRealPath = await Promises.realpath(source);
                if (target === linkTargetRealPath) {
                    return;
                }
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error; // throw on any error but file not found
            }
        }
        await this.installShellCommandWithPrivileges(windowId, source, target);
    }
    async installShellCommandWithPrivileges(windowId, source, target) {
        const { response } = await this.showMessageBox(windowId, {
            type: 'info',
            message: localize('warnEscalation', "{0} will now prompt with 'osascript' for Administrator privileges to install the shell command.", this.productService.nameShort),
            buttons: [
                localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
                localize('cancel', "Cancel")
            ]
        });
        if (response === 1 /* Cancel */) {
            throw new CancellationError();
        }
        try {
            const command = `osascript -e "do shell script \\"mkdir -p /usr/local/bin && ln -sf \'${target}\' \'${source}\'\\" with administrator privileges"`;
            await promisify(exec)(command);
        }
        catch (error) {
            throw new Error(localize('cantCreateBinFolder', "Unable to install the shell command '{0}'.", source));
        }
    }
    async uninstallShellCommand(windowId) {
        const { source } = await this.getShellCommandLink();
        try {
            await fs.promises.unlink(source);
        }
        catch (error) {
            switch (error.code) {
                case 'EACCES': {
                    const { response } = await this.showMessageBox(windowId, {
                        type: 'info',
                        message: localize('warnEscalationUninstall', "{0} will now prompt with 'osascript' for Administrator privileges to uninstall the shell command.", this.productService.nameShort),
                        buttons: [
                            localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
                            localize('cancel', "Cancel")
                        ]
                    });
                    if (response === 1 /* Cancel */) {
                        throw new CancellationError();
                    }
                    try {
                        const command = `osascript -e "do shell script \\"rm \'${source}\'\\" with administrator privileges"`;
                        await promisify(exec)(command);
                    }
                    catch (error) {
                        throw new Error(localize('cantUninstall', "Unable to uninstall the shell command '{0}'.", source));
                    }
                    break;
                }
                case 'ENOENT':
                    break; // ignore file not found
                default:
                    throw error;
            }
        }
    }
    async getShellCommandLink() {
        const target = resolve(this.environmentMainService.appRoot, 'bin', 'code');
        const source = `/usr/local/bin/${this.productService.applicationName}`;
        // Ensure source exists
        const sourceExists = await Promises.exists(target);
        if (!sourceExists) {
            throw new Error(localize('sourceMissing', "Unable to find shell script in '{0}'", target));
        }
        return { source, target };
    }
    //#endregion
    //#region Dialog
    async showMessageBox(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return this.dialogMainService.showMessageBox(options, window?.win ?? undefined);
    }
    async showSaveDialog(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return this.dialogMainService.showSaveDialog(options, window?.win ?? undefined);
    }
    async showOpenDialog(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return this.dialogMainService.showOpenDialog(options, window?.win ?? undefined);
    }
    async pickFileFolderAndOpen(windowId, options) {
        const paths = await this.dialogMainService.pickFileFolder(options);
        if (paths) {
            await this.doOpenPicked(await Promise.all(paths.map(async (path) => (await SymlinkSupport.existsDirectory(path)) ? { folderUri: URI.file(path) } : { fileUri: URI.file(path) })), options, windowId);
        }
    }
    async pickFolderAndOpen(windowId, options) {
        const paths = await this.dialogMainService.pickFolder(options);
        if (paths) {
            await this.doOpenPicked(paths.map(path => ({ folderUri: URI.file(path) })), options, windowId);
        }
    }
    async pickFileAndOpen(windowId, options) {
        const paths = await this.dialogMainService.pickFile(options);
        if (paths) {
            await this.doOpenPicked(paths.map(path => ({ fileUri: URI.file(path) })), options, windowId);
        }
    }
    async pickWorkspaceAndOpen(windowId, options) {
        const paths = await this.dialogMainService.pickWorkspace(options);
        if (paths) {
            await this.doOpenPicked(paths.map(path => ({ workspaceUri: URI.file(path) })), options, windowId);
        }
    }
    async doOpenPicked(openable, options, windowId) {
        await this.windowsMainService.open({
            context: 3 /* OpenContext.DIALOG */,
            contextWindowId: windowId,
            cli: this.environmentMainService.args,
            urisToOpen: openable,
            forceNewWindow: options.forceNewWindow,
            /* remoteAuthority will be determined based on openable */
        });
    }
    //#endregion
    //#region OS
    async showItemInFolder(windowId, path) {
        shell.showItemInFolder(path);
    }
    async setRepresentedFilename(windowId, path, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.setRepresentedFilename(path);
    }
    async setDocumentEdited(windowId, edited, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.setDocumentEdited(edited);
    }
    async openExternal(windowId, url, defaultApplication) {
        this.environmentMainService.unsetSnapExportedVariables();
        try {
            if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
                this.openExternalBrowser(windowId, url, defaultApplication);
            }
            else {
                this.doOpenShellExternal(windowId, url);
            }
        }
        finally {
            this.environmentMainService.restoreSnapExportedVariables();
        }
        return true;
    }
    async openExternalBrowser(windowId, url, defaultApplication) {
        const configuredBrowser = defaultApplication ?? this.configurationService.getValue('workbench.externalBrowser');
        if (!configuredBrowser) {
            return this.doOpenShellExternal(windowId, url);
        }
        if (configuredBrowser.includes(posix.sep) || configuredBrowser.includes(win32.sep)) {
            const browserPathExists = await Promises.exists(configuredBrowser);
            if (!browserPathExists) {
                this.logService.error(`Configured external browser path does not exist: ${configuredBrowser}`);
                return this.doOpenShellExternal(windowId, url);
            }
        }
        try {
            const { default: open, apps } = await import('open');
            const res = await open(url, {
                app: {
                    // Use `open.apps` helper to allow cross-platform browser
                    // aliases to be looked up properly. Fallback to the
                    // configured value if not found.
                    name: Object.hasOwn(apps, configuredBrowser) ? apps[configuredBrowser] : configuredBrowser
                }
            });
            if (!isWindows) {
                // On Linux/macOS, listen to stderr and treat that as failure
                // for opening the browser to fallback to the default.
                // On Windows, unfortunately PowerShell seems to always write
                // to stderr so we cannot use it there
                // (see also https://github.com/microsoft/vscode/issues/230636)
                res.stderr?.once('data', (data) => {
                    this.logService.error(`Error openening external URL '${url}' using browser '${configuredBrowser}': ${data.toString()}`);
                    return this.doOpenShellExternal(windowId, url);
                });
            }
        }
        catch (error) {
            this.logService.error(`Unable to open external URL '${url}' using browser '${configuredBrowser}' due to ${error}.`);
            return this.doOpenShellExternal(windowId, url);
        }
    }
    async doOpenShellExternal(windowId, url) {
        try {
            await shell.openExternal(url);
        }
        catch (error) {
            let isLink;
            let message;
            if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
                isLink = true;
                message = localize('openExternalErrorLinkMessage', "An error occurred opening a link in your default browser.");
            }
            else {
                isLink = false;
                message = localize('openExternalProgramErrorMessage', "An error occurred opening an external program.");
            }
            const { response } = await this.dialogMainService.showMessageBox({
                type: 'error',
                message,
                detail: error.message,
                buttons: isLink ? [
                    localize({ key: 'copyLink', comment: ['&& denotes a mnemonic'] }, "&&Copy Link"),
                    localize('cancel', "Cancel")
                ] : [
                    localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")
                ]
            }, this.windowById(windowId)?.win ?? undefined);
            if (response === 1 /* Cancel */) {
                return;
            }
            this.writeClipboardText(windowId, url);
        }
    }
    moveItemToTrash(windowId, fullPath) {
        return shell.trashItem(fullPath);
    }
    async isAdmin() {
        let isAdmin;
        if (isWindows) {
            isAdmin = (await import('native-is-elevated')).default();
        }
        else {
            isAdmin = process.getuid?.() === 0;
        }
        return isAdmin;
    }
    async writeElevated(windowId, source, target, options) {
        const sudoPrompt = await import('@vscode/sudo-prompt');
        const argsFile = randomPath(this.environmentMainService.userDataPath, 'code-elevated');
        await Promises.writeFile(argsFile, JSON.stringify({ source: source.fsPath, target: target.fsPath }));
        try {
            await new Promise((resolve, reject) => {
                const sudoCommand = [`"${this.cliPath}"`];
                if (options?.unlock) {
                    sudoCommand.push('--file-chmod');
                }
                sudoCommand.push('--file-write', `"${argsFile}"`);
                const promptOptions = {
                    name: this.productService.nameLong.replace('-', ''),
                    icns: (isMacintosh && this.environmentMainService.isBuilt) ? join(dirname(this.environmentMainService.appRoot), `${this.productService.nameShort}.icns`) : undefined
                };
                this.logService.trace(`[sudo-prompt] running command: ${sudoCommand.join(' ')}`);
                sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error, stdout, stderr) => {
                    if (stdout) {
                        this.logService.trace(`[sudo-prompt] received stdout: ${stdout}`);
                    }
                    if (stderr) {
                        this.logService.error(`[sudo-prompt] received stderr: ${stderr}`);
                    }
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(undefined);
                    }
                });
            });
        }
        finally {
            await fs.promises.unlink(argsFile);
        }
    }
    async isRunningUnderARM64Translation() {
        if (isLinux || isWindows) {
            return false;
        }
        return app.runningUnderARM64Translation;
    }
    get cliPath() {
        // Windows
        if (isWindows) {
            if (this.environmentMainService.isBuilt) {
                return join(dirname(process.execPath), 'bin', `${this.productService.applicationName}.cmd`);
            }
            return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.bat');
        }
        // Linux
        if (isLinux) {
            if (this.environmentMainService.isBuilt) {
                return join(dirname(process.execPath), 'bin', `${this.productService.applicationName}`);
            }
            return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.sh');
        }
        // macOS
        if (this.environmentMainService.isBuilt) {
            return join(this.environmentMainService.appRoot, 'bin', 'code');
        }
        return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.sh');
    }
    async getOSStatistics() {
        return {
            totalmem: totalmem(),
            freemem: freemem(),
            loadavg: loadavg()
        };
    }
    async getOSProperties() {
        return {
            arch: arch(),
            platform: platform(),
            release: release(),
            type: type(),
            cpus: cpus()
        };
    }
    async getOSVirtualMachineHint() {
        return virtualMachineHint.value();
    }
    async getOSColorScheme() {
        return this.themeMainService.getColorScheme();
    }
    // WSL
    async hasWSLFeatureInstalled() {
        return isWindows && hasWSLFeatureInstalled();
    }
    //#endregion
    //#region Screenshots
    async getScreenshot(windowId, rect, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        const captured = await window?.win?.webContents.capturePage(rect);
        const buf = captured?.toJPEG(95);
        return buf && VSBuffer.wrap(buf);
    }
    //#endregion
    //#region Process
    async getProcessId(windowId) {
        const window = this.windowById(undefined, windowId);
        return window?.win?.webContents.getOSProcessId();
    }
    async killProcess(windowId, pid, code) {
        process.kill(pid, code);
    }
    //#endregion
    //#region Clipboard
    async readClipboardText(windowId, type) {
        this.logService.trace(`readClipboardText in window ${windowId} with type:`, type);
        const clipboardText = clipboard.readText(type);
        this.logService.trace(`clipboardText.length :`, clipboardText.length);
        return clipboardText;
    }
    async triggerPaste(windowId, options) {
        this.logService.trace(`Triggering paste in window ${windowId} with options:`, options);
        const window = this.windowById(options?.targetWindowId, windowId);
        return window?.win?.webContents.paste() ?? Promise.resolve();
    }
    async readImage() {
        return clipboard.readImage().toPNG();
    }
    async writeClipboardText(windowId, text, type) {
        return clipboard.writeText(text, type);
    }
    async readClipboardFindText(windowId) {
        return clipboard.readFindText();
    }
    async writeClipboardFindText(windowId, text) {
        return clipboard.writeFindText(text);
    }
    async writeClipboardBuffer(windowId, format, buffer, type) {
        return clipboard.writeBuffer(format, Buffer.from(buffer.buffer), type);
    }
    async readClipboardBuffer(windowId, format) {
        return VSBuffer.wrap(clipboard.readBuffer(format));
    }
    async hasClipboard(windowId, format, type) {
        return clipboard.has(format, type);
    }
    //#endregion
    //#region macOS Touchbar
    async newWindowTab() {
        await this.windowsMainService.open({
            context: 5 /* OpenContext.API */,
            cli: this.environmentMainService.args,
            forceNewTabbedWindow: true,
            forceEmpty: true,
            remoteAuthority: this.environmentMainService.args.remote || undefined
        });
    }
    async showPreviousWindowTab() {
        Menu.sendActionToFirstResponder('selectPreviousTab:');
    }
    async showNextWindowTab() {
        Menu.sendActionToFirstResponder('selectNextTab:');
    }
    async moveWindowTabToNewWindow() {
        Menu.sendActionToFirstResponder('moveTabToNewWindow:');
    }
    async mergeAllWindowTabs() {
        Menu.sendActionToFirstResponder('mergeAllWindows:');
    }
    async toggleWindowTabsBar() {
        Menu.sendActionToFirstResponder('toggleTabBar:');
    }
    async updateTouchBar(windowId, items) {
        const window = this.codeWindowById(windowId);
        window?.updateTouchBar(items);
    }
    //#endregion
    //#region Lifecycle
    async notifyReady(windowId) {
        const window = this.codeWindowById(windowId);
        window?.setReady();
    }
    async relaunch(windowId, options) {
        return this.lifecycleMainService.relaunch(options);
    }
    async reload(windowId, options) {
        const window = this.codeWindowById(windowId);
        if (window) {
            // Special case: support `transient` workspaces by preventing
            // the reload and rather go back to an empty window. Transient
            // workspaces should never restore, even when the user wants
            // to reload.
            // For: https://github.com/microsoft/vscode/issues/119695
            if (isWorkspaceIdentifier(window.openedWorkspace)) {
                const configPath = window.openedWorkspace.configPath;
                if (configPath.scheme === Schemas.file) {
                    const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(configPath);
                    if (workspace?.transient) {
                        return this.openWindow(window.id, { forceReuseWindow: true });
                    }
                }
            }
            // Proceed normally to reload the window
            return this.lifecycleMainService.reload(window, options?.disableExtensions !== undefined ? { _: [], 'disable-extensions': options.disableExtensions } : undefined);
        }
    }
    async closeWindow(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        return window?.win?.close();
    }
    async quit(windowId) {
        // If the user selected to exit from an extension development host window, do not quit, but just
        // close the window unless this is the last window that is opened.
        const window = this.windowsMainService.getLastActiveWindow();
        if (window?.isExtensionDevelopmentHost && this.windowsMainService.getWindowCount() > 1 && window.win) {
            window.win.close();
        }
        // Otherwise: normal quit
        else {
            this.lifecycleMainService.quit();
        }
    }
    async exit(windowId, code) {
        await this.lifecycleMainService.kill(code);
    }
    //#endregion
    //#region Connectivity
    async resolveProxy(windowId, url) {
        const window = this.codeWindowById(windowId);
        const session = window?.win?.webContents?.session;
        return session?.resolveProxy(url);
    }
    async lookupAuthorization(_windowId, authInfo) {
        return this.proxyAuthService.lookupAuthorization(authInfo);
    }
    async lookupKerberosAuthorization(_windowId, url) {
        return this.requestService.lookupKerberosAuthorization(url);
    }
    async loadCertificates(_windowId) {
        return this.requestService.loadCertificates();
    }
    isPortFree(windowId, port) {
        return isPortFree(port, 1_000);
    }
    findFreePort(windowId, startPort, giveUpAfter, timeout, stride = 1) {
        return findFreePort(startPort, giveUpAfter, timeout, stride);
    }
    async openDevTools(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.webContents.openDevTools(options?.mode ? { mode: options.mode, activate: options.activate } : undefined);
    }
    async toggleDevTools(windowId, options) {
        const window = this.windowById(options?.targetWindowId, windowId);
        window?.win?.webContents.toggleDevTools();
    }
    async openDevToolsWindow(windowId, url) {
        const parentWindow = this.codeWindowById(windowId);
        if (!parentWindow) {
            return;
        }
        this.openChildWindow(parentWindow.win, url);
    }
    openChildWindow(parentWindow, url, overrideWindowOptions = {}) {
        const options = this.instantiationService.invokeFunction(defaultBrowserWindowOptions, defaultWindowState(), { forceNativeTitlebar: true });
        const windowOptions = {
            ...options,
            parent: parentWindow ?? undefined,
            ...overrideWindowOptions
        };
        const window = new BrowserWindow(windowOptions);
        window.setMenuBarVisibility(false);
        window.loadURL(url);
        window.once('ready-to-show', () => window.show());
        return window;
    }
    async openGPUInfoWindow(windowId) {
        const parentWindow = this.codeWindowById(windowId);
        if (!parentWindow) {
            return;
        }
        if (typeof this.gpuInfoWindowId !== 'number') {
            const gpuInfoWindow = this.openChildWindow(parentWindow.win, 'chrome://gpu');
            gpuInfoWindow.once('close', () => this.gpuInfoWindowId = undefined);
            this.gpuInfoWindowId = gpuInfoWindow.id;
        }
        if (typeof this.gpuInfoWindowId === 'number') {
            const window = BrowserWindow.fromId(this.gpuInfoWindowId);
            if (window?.isMinimized()) {
                window?.restore();
            }
            window?.focus();
        }
    }
    async openContentTracingWindow() {
        if (typeof this.contentTracingWindowId !== 'number') {
            // Disable ready-to-show event with paintWhenInitiallyHidden to
            // customize content tracing window below.
            const contentTracingWindow = this.openChildWindow(null, 'chrome://tracing', {
                paintWhenInitiallyHidden: false,
                webPreferences: {
                    backgroundThrottling: false
                }
            });
            contentTracingWindow.webContents.once('did-finish-load', async () => {
                // Mock window.prompt to support save action from the tracing UI
                // since Electron by default doesn't provide the api.
                // See requestFilename_ implementation under
                // https://source.chromium.org/chromium/chromium/src/+/main:third_party/catapult/tracing/tracing/ui/extras/about_tracing/profiling_view.html;l=334-379
                await contentTracingWindow.webContents.executeJavaScript(`
					window.prompt = () => '';
					null
				`);
                contentTracingWindow.show();
            });
            contentTracingWindow.once('close', () => this.contentTracingWindowId = undefined);
            this.contentTracingWindowId = contentTracingWindow.id;
        }
        if (typeof this.contentTracingWindowId === 'number') {
            const window = BrowserWindow.fromId(this.contentTracingWindowId);
            if (window?.isMinimized()) {
                window?.restore();
            }
            window?.focus();
        }
    }
    async startTracing(windowId, categories) {
        if (this._isTracing) {
            throw new Error(localize('tracing.alreadyInProgress', 'A tracing session is already in progress. Use command `"{0}"` to stop it first.', 'workbench.action.stopTracing'));
        }
        const traceOptions = ['record-until-full', 'enable-sampling'];
        await contentTracing.startRecording({
            categoryFilter: categories,
            traceOptions: traceOptions.join(',')
        });
        this._isTracing = true;
    }
    async stopTracing(windowId) {
        if (!this._isTracing && !this.environmentMainService.args.trace) {
            return; // no tracing in progress
        }
        this._isTracing = false;
        const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);
        // Inform user to report an issue
        await this.dialogMainService.showMessageBox({
            type: 'info',
            message: localize('trace.message', "Successfully created the trace file"),
            detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
            buttons: [localize({ key: 'trace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
        }, BrowserWindow.getFocusedWindow() ?? undefined);
        // Show item in explorer
        this.showItemInFolder(undefined, path);
    }
    //#endregion
    // #region Performance
    async profileRenderer(windowId, session, duration) {
        const window = this.codeWindowById(windowId);
        if (!window?.win) {
            throw new Error();
        }
        const profiler = new WindowProfiler(window.win, session, this.logService);
        const result = await profiler.inspect(duration);
        return result;
    }
    async showToast(windowId, options) {
        if (!Notification.isSupported()) {
            return { supported: false, clicked: false };
        }
        const toast = new Notification({
            title: options.title,
            body: options.body,
            silent: options.silent,
            actions: options.actions?.map(action => ({
                type: 'button',
                text: action
            }))
        });
        const disposables = new DisposableStore();
        this.activeToasts.set(options.id, disposables);
        const cts = new CancellationTokenSource();
        disposables.add(toDisposable(() => {
            this.activeToasts.deleteAndDispose(options.id);
            toast.removeAllListeners();
            toast.close();
            cts.dispose(true);
        }));
        return new Promise(r => {
            const resolve = (result) => {
                r(result); // first return the result before...
                disposables.dispose(); // ...disposing which would invalidate the result object
            };
            disposables.add(cts.token.onCancellationRequested(() => resolve({ supported: true, clicked: false })));
            toast.on('click', () => resolve({ supported: true, clicked: true }));
            toast.on('action', (_event, actionIndex) => resolve({ supported: true, clicked: true, actionIndex }));
            toast.on('close', () => resolve({ supported: true, clicked: false }));
            toast.on('failed', () => resolve({ supported: false, clicked: false }));
            toast.show();
        });
    }
    async clearToast(windowId, toastId) {
        this.activeToasts.deleteAndDispose(toastId);
    }
    async clearToasts() {
        this.activeToasts.clearAndDisposeAll();
    }
    //#endregion
    //#region Registry (windows)
    async windowsGetStringRegKey(windowId, hive, path, name) {
        if (!isWindows) {
            return undefined;
        }
        const Registry = await import('@vscode/windows-registry');
        try {
            return Registry.GetStringRegKey(hive, path, name);
        }
        catch {
            return undefined;
        }
    }
    //#endregion
    //#region Zip
    async createZipFile(windowId, zipPath, files) {
        await zip(zipPath.fsPath, files);
    }
    //#endregion
    //#region Power
    async getSystemIdleState(windowId, idleThreshold) {
        return powerMonitor.getSystemIdleState(idleThreshold);
    }
    async getSystemIdleTime(windowId) {
        return powerMonitor.getSystemIdleTime();
    }
    async getCurrentThermalState(windowId) {
        return powerMonitor.getCurrentThermalState();
    }
    async isOnBatteryPower(windowId) {
        return powerMonitor.isOnBatteryPower();
    }
    async startPowerSaveBlocker(windowId, type) {
        return powerSaveBlocker.start(type);
    }
    async stopPowerSaveBlocker(windowId, id) {
        return powerSaveBlocker.stop(id);
    }
    async isPowerSaveBlockerStarted(windowId, id) {
        return powerSaveBlocker.isStarted(id);
    }
    //#endregion
    windowById(windowId, fallbackCodeWindowId) {
        return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
    }
    codeWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        return this.windowsMainService.getWindowById(windowId);
    }
    auxiliaryWindowById(windowId) {
        if (typeof windowId !== 'number') {
            return undefined;
        }
        const contents = webContents.fromId(windowId);
        if (!contents) {
            return undefined;
        }
        return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
    }
};
__decorate([
    memoize
], NativeHostMainService.prototype, "cliPath", null);
NativeHostMainService = __decorate([
    __param(0, IWindowsMainService),
    __param(1, IAuxiliaryWindowsMainService),
    __param(2, IDialogMainService),
    __param(3, ILifecycleMainService),
    __param(4, IEnvironmentMainService),
    __param(5, ILogService),
    __param(6, IProductService),
    __param(7, IThemeMainService),
    __param(8, IWorkspacesManagementMainService),
    __param(9, IConfigurationService),
    __param(10, IRequestService),
    __param(11, IProxyAuthService),
    __param(12, IInstantiationService)
], NativeHostMainService);
export { NativeHostMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlSG9zdE1haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbmF0aXZlL2VsZWN0cm9uLW1haW4vbmF0aXZlSG9zdE1haW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDckMsT0FBTyxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBVyxJQUFJLEVBQTRDLFlBQVksRUFBaUUsWUFBWSxFQUFFLGdCQUFnQixFQUE0QyxNQUFNLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNyVCxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLElBQUksQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FB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