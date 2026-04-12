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
import electron, { screen } from 'electron';
import { DeferredPromise, RunOnceScheduler, timeout, Delayer } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { getMarks, mark } from '../../../base/common/performance.js';
import { isTahoeOrNewer, isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { release } from 'os';
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { isLaunchedFromCli } from '../../environment/node/argvHelper.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IProtocolMainService } from '../../protocol/electron-main/protocol.js';
import { resolveMarketplaceHeaders } from '../../externalServices/common/marketplace.js';
import { IApplicationStorageMainService, IStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { getMenuBarVisibility, hasNativeTitlebar, useNativeFullScreen, useWindowControlsOverlay, DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../window/common/window.js';
import { defaultBrowserWindowOptions, getAllWindowsExcludingOffscreen, IWindowsMainService, WindowStateValidator } from './windows.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { defaultWindowState } from '../../window/electron-main/window.js';
import { IPolicyService } from '../../policy/common/policy.js';
import { IStateService } from '../../state/node/state.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { ILoggerMainService } from '../../log/electron-main/loggerService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { errorHandler } from '../../../base/common/errors.js';
import { Color } from '../../../base/common/color.js';
var ReadyState;
(function (ReadyState) {
    /**
     * This window has not loaded anything yet
     * and this is the initial state of every
     * window.
     */
    ReadyState[ReadyState["NONE"] = 0] = "NONE";
    /**
     * This window is navigating, either for the
     * first time or subsequent times.
     */
    ReadyState[ReadyState["NAVIGATING"] = 1] = "NAVIGATING";
    /**
     * This window has finished loading and is ready
     * to forward IPC requests to the web contents.
     */
    ReadyState[ReadyState["READY"] = 2] = "READY";
})(ReadyState || (ReadyState = {}));
class DockBadgeManager {
    constructor() {
        this.windows = new Set();
    }
    static { this.INSTANCE = new DockBadgeManager(); }
    acquireBadge(window) {
        this.windows.add(window.id);
        electron.app.setBadgeCount(isLinux ? 1 /* only numbers supported */ : undefined /* generic dot */);
        return {
            dispose: () => {
                this.windows.delete(window.id);
                if (this.windows.size === 0) {
                    electron.app.setBadgeCount(0);
                }
            }
        };
    }
}
export class BaseWindow extends Disposable {
    get lastFocusTime() { return this._lastFocusTime; }
    get win() { return this._win; }
    setWin(win, options) {
        this._win = win;
        // Window Events
        this._register(Event.fromNodeEventEmitter(win, 'maximize')(() => {
            if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this._win) {
                const [x, y] = this._win.getPosition();
                const [width, height] = this._win.getSize();
                this.maximizedWindowState = { mode: 0 /* WindowMode.Maximized */, width, height, x, y };
                this.logService.debug(`Saved maximized window ${this.id} display state:`, this.maximizedWindowState);
            }
            this._onDidMaximize.fire();
        }));
        this._register(Event.fromNodeEventEmitter(win, 'unmaximize')(() => {
            if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this.maximizedWindowState) {
                this.maximizedWindowState = undefined;
                this.logService.debug(`Cleared maximized window ${this.id} state`);
            }
            this._onDidUnmaximize.fire();
        }));
        this._register(Event.fromNodeEventEmitter(win, 'closed')(() => {
            this._onDidClose.fire();
            this.dispose();
        }));
        this._register(Event.fromNodeEventEmitter(win, 'focus')(() => {
            this.clearNotifyFocus();
            this._lastFocusTime = Date.now();
        }));
        this._register(Event.fromNodeEventEmitter(this._win, 'enter-full-screen')(() => this._onDidEnterFullScreen.fire()));
        this._register(Event.fromNodeEventEmitter(this._win, 'leave-full-screen')(() => this._onDidLeaveFullScreen.fire()));
        this._register(Event.fromNodeEventEmitter(this._win, 'always-on-top-changed', (_, alwaysOnTop) => alwaysOnTop)(alwaysOnTop => this._onDidChangeAlwaysOnTop.fire(alwaysOnTop)));
        // Sheet Offsets
        const useCustomTitleStyle = !hasNativeTitlebar(this.configurationService, options?.titleBarStyle === 'hidden' ? "custom" /* TitlebarStyle.CUSTOM */ : undefined /* unknown */);
        if (isMacintosh && useCustomTitleStyle) {
            win.setSheetOffset(isTahoeOrNewer(release()) ? 32 : 28); // offset dialogs by the height of the custom title bar if we have any
        }
        // Update the window controls immediately based on cached or default values
        if (useCustomTitleStyle && useWindowControlsOverlay(this.configurationService)) {
            const cachedWindowControlHeight = this.stateService.getItem((BaseWindow.windowControlHeightStateStorageKey));
            if (cachedWindowControlHeight) {
                this.updateWindowControls({ height: cachedWindowControlHeight });
            }
            else {
                this.updateWindowControls({ height: DEFAULT_CUSTOM_TITLEBAR_HEIGHT });
            }
        }
        // Setup windows/linux system context menu so it only is allowed over the app icon
        if ((isWindows || isLinux) && useCustomTitleStyle) {
            this._register(Event.fromNodeEventEmitter(win, 'system-context-menu', (event, point) => ({ event, point }))(e => {
                const [x, y] = win.getPosition();
                const cursorPos = electron.screen.screenToDipPoint(e.point);
                const cx = Math.floor(cursorPos.x) - x;
                const cy = Math.floor(cursorPos.y) - y;
                // TODO@deepak1556 workaround for https://github.com/microsoft/vscode/issues/250626
                // where showing the custom menu seems broken on Windows
                if (isLinux) {
                    if (cx > 35 /* Cursor is beyond app icon in title bar */) {
                        e.event.preventDefault();
                        this._onDidTriggerSystemContextMenu.fire({ x: cx, y: cy });
                    }
                }
            }));
        }
        // Open devtools if instructed from command line args
        if (this.environmentMainService.args['open-devtools'] === true) {
            win.webContents.openDevTools();
        }
        // macOS: Window Fullscreen Transitions
        if (isMacintosh) {
            this._register(this.onDidEnterFullScreen(() => {
                this.joinNativeFullScreenTransition?.complete(true);
            }));
            this._register(this.onDidLeaveFullScreen(() => {
                this.joinNativeFullScreenTransition?.complete(true);
            }));
        }
        if (isWindows && this.environmentMainService.enableRDPDisplayTracking) {
            // Handles the display-added event on Windows RDP multi-monitor scenarios.
            // This helps restore maximized windows to their correct monitor after RDP reconnection.
            // Refs https://github.com/electron/electron/issues/47016
            this._register(Event.fromNodeEventEmitter(screen, 'display-added', (event, display) => ({ event, display }))((e) => {
                this.onDisplayAdded(e.display);
            }));
        }
    }
    onDisplayAdded(display) {
        const state = this.maximizedWindowState;
        if (state && this._win && WindowStateValidator.validateWindowStateOnDisplay(state, display)) {
            this.logService.debug(`Setting maximized window ${this.id} bounds to match newly added display`, state);
            this._win.setBounds(state);
        }
    }
    constructor(configurationService, stateService, environmentMainService, logService) {
        super();
        this.configurationService = configurationService;
        this.stateService = stateService;
        this.environmentMainService = environmentMainService;
        this.logService = logService;
        //#region Events
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        this._onDidMaximize = this._register(new Emitter());
        this.onDidMaximize = this._onDidMaximize.event;
        this._onDidUnmaximize = this._register(new Emitter());
        this.onDidUnmaximize = this._onDidUnmaximize.event;
        this._onDidTriggerSystemContextMenu = this._register(new Emitter());
        this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
        this._onDidEnterFullScreen = this._register(new Emitter());
        this.onDidEnterFullScreen = this._onDidEnterFullScreen.event;
        this._onDidLeaveFullScreen = this._register(new Emitter());
        this.onDidLeaveFullScreen = this._onDidLeaveFullScreen.event;
        this._onDidChangeAlwaysOnTop = this._register(new Emitter());
        this.onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;
        this._lastFocusTime = Date.now(); // window is shown on creation so take current time
        this._win = null;
        this.notifyFocusDisposable = this._register(new MutableDisposable());
        this.windowControlsDimmed = false;
        //#endregion
        //#region Fullscreen
        this.transientIsNativeFullScreen = undefined;
        this.joinNativeFullScreenTransition = undefined;
    }
    applyState(state, hasMultipleDisplays = electron.screen.getAllDisplays().length > 0) {
        // TODO@electron (Electron 4 regression): when running on multiple displays where the target display
        // to open the window has a larger resolution than the primary display, the window will not size
        // correctly unless we set the bounds again (https://github.com/microsoft/vscode/issues/74872)
        //
        // Extended to cover Windows as well as Mac (https://github.com/microsoft/vscode/issues/146499)
        //
        // However, when running with native tabs with multiple windows we cannot use this workaround
        // because there is a potential that the new window will be added as native tab instead of being
        // a window on its own. In that case calling setBounds() would cause https://github.com/microsoft/vscode/issues/75830
        const windowSettings = this.configurationService.getValue('window');
        const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
        if ((isMacintosh || isWindows) && hasMultipleDisplays && (!useNativeTabs || getAllWindowsExcludingOffscreen().length === 1)) {
            if ([state.width, state.height, state.x, state.y].every(value => typeof value === 'number')) {
                this._win?.setBounds({
                    width: state.width,
                    height: state.height,
                    x: state.x,
                    y: state.y
                });
            }
        }
        if (state.mode === 0 /* WindowMode.Maximized */ || state.mode === 3 /* WindowMode.Fullscreen */) {
            // this call may or may not show the window, depends
            // on the platform: currently on Windows and Linux will
            // show the window as active. To be on the safe side,
            // we show the window at the end of this block.
            this._win?.maximize();
            if (state.mode === 3 /* WindowMode.Fullscreen */) {
                this.setFullScreen(true, true);
            }
            // to reduce flicker from the default window size
            // to maximize or fullscreen, we only show after
            this._win?.show();
        }
    }
    setRepresentedFilename(filename) {
        if (isMacintosh) {
            this.win?.setRepresentedFilename(filename);
        }
        else {
            this.representedFilename = filename;
        }
    }
    getRepresentedFilename() {
        if (isMacintosh) {
            return this.win?.getRepresentedFilename();
        }
        return this.representedFilename;
    }
    setDocumentEdited(edited) {
        if (isMacintosh) {
            this.win?.setDocumentEdited(edited);
        }
        this.documentEdited = edited;
    }
    isDocumentEdited() {
        if (isMacintosh) {
            return Boolean(this.win?.isDocumentEdited());
        }
        return !!this.documentEdited;
    }
    focus(options) {
        switch (options?.mode ?? 0 /* FocusMode.Transfer */) {
            case 0 /* FocusMode.Transfer */:
                this.doFocusWindow();
                break;
            case 1 /* FocusMode.Notify */:
                this.showNotifyFocus();
                break;
            case 2 /* FocusMode.Force */:
                if (isMacintosh) {
                    electron.app.focus({ steal: true });
                }
                this.doFocusWindow();
                break;
        }
    }
    showNotifyFocus() {
        const disposables = new DisposableStore();
        this.notifyFocusDisposable.value = disposables;
        // Badge
        disposables.add(DockBadgeManager.INSTANCE.acquireBadge(this));
        // Flash/Bounce
        if (isWindows || isLinux) {
            this.win?.flashFrame(true);
            disposables.add(toDisposable(() => this.win?.flashFrame(false)));
        }
        else if (isMacintosh) {
            electron.app.dock?.bounce('informational');
        }
    }
    clearNotifyFocus() {
        this.notifyFocusDisposable.clear();
    }
    doFocusWindow() {
        const win = this.win;
        if (!win) {
            return;
        }
        if (win.isMinimized()) {
            win.restore();
        }
        win.focus();
        // When focusing the window, the workbench should always be the view that receives focus.
        // However, in scenarios where the window has multiple child views (e.g. browser WebContentsViews),
        // the last focused view in the window may not be the workbench.
        // So we explicitly focus the workbench web contents here to ensure it gets focus.
        win.webContents.focus();
    }
    //#region Window Control Overlays
    static { this.windowControlHeightStateStorageKey = 'windowControlHeight'; }
    updateWindowControls(options) {
        const win = this.win;
        if (!win) {
            return;
        }
        // Cache the height for speeds lookups on startup
        if (options.height) {
            this.stateService.setItem((CodeWindow.windowControlHeightStateStorageKey), options.height);
        }
        // Windows/Linux: update window controls via setTitleBarOverlay()
        if (!isMacintosh && useWindowControlsOverlay(this.configurationService)) {
            // Update dimmed state if explicitly provided
            if (options.dimmed !== undefined) {
                this.windowControlsDimmed = options.dimmed;
            }
            const backgroundColor = options.backgroundColor ?? this.lastWindowControlColors?.backgroundColor;
            const foregroundColor = options.foregroundColor ?? this.lastWindowControlColors?.foregroundColor;
            if (options.backgroundColor !== undefined || options.foregroundColor !== undefined) {
                this.lastWindowControlColors = { backgroundColor, foregroundColor };
            }
            const effectiveBackgroundColor = this.windowControlsDimmed && backgroundColor ? this.dimColor(backgroundColor) : backgroundColor;
            const effectiveForegroundColor = this.windowControlsDimmed && foregroundColor ? this.dimColor(foregroundColor) : foregroundColor;
            win.setTitleBarOverlay({
                color: effectiveBackgroundColor?.trim() === '' ? undefined : effectiveBackgroundColor,
                symbolColor: effectiveForegroundColor?.trim() === '' ? undefined : effectiveForegroundColor,
                height: options.height ? options.height - 1 : undefined // account for window border
            });
        }
        // macOS: update window controls via setWindowButtonPosition()
        else if (isMacintosh && options.height !== undefined) {
            // When the position is set, the horizontal margin is offset to ensure
            // the distance between the traffic lights and the window frame is equal
            // in both directions.
            const buttonHeight = isTahoeOrNewer(release()) ? 14 : 16;
            const offset = Math.floor((options.height - buttonHeight) / 2);
            if (!offset) {
                win.setWindowButtonPosition(null);
            }
            else {
                win.setWindowButtonPosition({ x: offset + 1, y: offset });
            }
        }
    }
    dimColor(color) {
        // Blend a CSS color with black at 30% opacity to match the
        // dimming overlay of `rgba(0, 0, 0, 0.3)` used by modals.
        const parsed = Color.Format.CSS.parse(color);
        if (!parsed) {
            return color;
        }
        const dimFactor = 0.7; // 1 - 0.3 opacity of black overlay
        const r = Math.round(parsed.rgba.r * dimFactor);
        const g = Math.round(parsed.rgba.g * dimFactor);
        const b = Math.round(parsed.rgba.b * dimFactor);
        return `rgb(${r}, ${g}, ${b})`;
    }
    toggleFullScreen() {
        this.setFullScreen(!this.isFullScreen, false);
    }
    setFullScreen(fullscreen, fromRestore) {
        // Set fullscreen state
        if (useNativeFullScreen(this.configurationService)) {
            this.setNativeFullScreen(fullscreen, fromRestore);
        }
        else {
            this.setSimpleFullScreen(fullscreen);
        }
    }
    get isFullScreen() {
        if (isMacintosh && typeof this.transientIsNativeFullScreen === 'boolean') {
            return this.transientIsNativeFullScreen;
        }
        const win = this.win;
        const isFullScreen = win?.isFullScreen();
        const isSimpleFullScreen = win?.isSimpleFullScreen();
        return Boolean(isFullScreen || isSimpleFullScreen);
    }
    setNativeFullScreen(fullscreen, fromRestore) {
        const win = this.win;
        if (win?.isSimpleFullScreen()) {
            win?.setSimpleFullScreen(false);
        }
        this.doSetNativeFullScreen(fullscreen, fromRestore);
    }
    doSetNativeFullScreen(fullscreen, fromRestore) {
        if (isMacintosh) {
            // macOS: Electron windows report `false` for `isFullScreen()` for as long
            // as the fullscreen transition animation takes place. As such, we need to
            // listen to the transition events and carry around an intermediate state
            // for knowing if we are in fullscreen or not
            // Refs: https://github.com/electron/electron/issues/35360
            this.transientIsNativeFullScreen = fullscreen;
            const joinNativeFullScreenTransition = this.joinNativeFullScreenTransition = new DeferredPromise();
            (async () => {
                const transitioned = await Promise.race([
                    joinNativeFullScreenTransition.p,
                    timeout(10000).then(() => false)
                ]);
                if (this.joinNativeFullScreenTransition !== joinNativeFullScreenTransition) {
                    return; // another transition was requested later
                }
                this.transientIsNativeFullScreen = undefined;
                this.joinNativeFullScreenTransition = undefined;
                // There is one interesting gotcha on macOS: when you are opening a new
                // window from a fullscreen window, that new window will immediately
                // open fullscreen and emit the `enter-full-screen` event even before we
                // reach this method. In that case, we actually will timeout after 10s
                // for detecting the transition and as such it is important that we only
                // signal to leave fullscreen if the window reports as not being in fullscreen.
                if (!transitioned && fullscreen && fromRestore && this.win && !this.win.isFullScreen()) {
                    // We have seen requests for fullscreen failing eventually after some
                    // time, for example when an OS update was performed and windows restore.
                    // In those cases a user would find a window that is not in fullscreen
                    // but also does not show any custom titlebar (and thus window controls)
                    // because we think the window is in fullscreen.
                    //
                    // As a workaround in that case we emit a warning and leave fullscreen
                    // so that at least the window controls are back.
                    this.logService.warn('window: native macOS fullscreen transition did not happen within 10s from restoring');
                    this._onDidLeaveFullScreen.fire();
                }
            })();
        }
        const win = this.win;
        win?.setFullScreen(fullscreen);
    }
    setSimpleFullScreen(fullscreen) {
        const win = this.win;
        if (win?.isFullScreen()) {
            this.doSetNativeFullScreen(false, false);
        }
        win?.setSimpleFullScreen(fullscreen);
        win?.webContents.focus(); // workaround issue where focus is not going into window
    }
    dispose() {
        super.dispose();
        this._win = null; // Important to dereference the window object to allow for GC
    }
}
let CodeWindow = class CodeWindow extends BaseWindow {
    get id() { return this._id; }
    get backupPath() { return this._config?.backupPath; }
    get openedWorkspace() { return this._config?.workspace; }
    get profile() {
        if (!this.config) {
            return undefined;
        }
        const profile = this.userDataProfilesService.profiles.find(profile => profile.id === this.config?.profiles.profile.id);
        if (this.isExtensionDevelopmentHost && profile) {
            return profile;
        }
        return this.userDataProfilesService.getProfileForWorkspace(this.config.workspace ?? toWorkspaceIdentifier(this.backupPath, this.isExtensionDevelopmentHost)) ?? this.userDataProfilesService.defaultProfile;
    }
    get remoteAuthority() { return this._config?.remoteAuthority; }
    get config() { return this._config; }
    get isExtensionDevelopmentHost() { return !!(this._config?.extensionDevelopmentPath); }
    get isExtensionTestHost() { return !!(this._config?.extensionTestsPath); }
    get isExtensionDevelopmentTestFromCli() { return this.isExtensionDevelopmentHost && this.isExtensionTestHost && !this._config?.debugId; }
    constructor(config, logService, loggerMainService, environmentMainService, policyService, userDataProfilesService, fileService, applicationStorageMainService, storageMainService, configurationService, themeMainService, workspacesManagementMainService, backupMainService, telemetryService, dialogMainService, lifecycleMainService, productService, protocolMainService, windowsMainService, stateService, instantiationService) {
        super(configurationService, stateService, environmentMainService, logService);
        this.loggerMainService = loggerMainService;
        this.policyService = policyService;
        this.userDataProfilesService = userDataProfilesService;
        this.fileService = fileService;
        this.applicationStorageMainService = applicationStorageMainService;
        this.storageMainService = storageMainService;
        this.themeMainService = themeMainService;
        this.workspacesManagementMainService = workspacesManagementMainService;
        this.backupMainService = backupMainService;
        this.telemetryService = telemetryService;
        this.dialogMainService = dialogMainService;
        this.lifecycleMainService = lifecycleMainService;
        this.productService = productService;
        this.windowsMainService = windowsMainService;
        //#region Events
        this._onWillLoad = this._register(new Emitter());
        this.onWillLoad = this._onWillLoad.event;
        this._onDidSignalReady = this._register(new Emitter());
        this.onDidSignalReady = this._onDidSignalReady.event;
        this._onDidDestroy = this._register(new Emitter());
        this.onDidDestroy = this._onDidDestroy.event;
        this.whenReadyCallbacks = [];
        this.touchBarGroups = [];
        this.currentHttpProxy = undefined;
        this.currentNoProxy = undefined;
        this.customZoomLevel = undefined;
        this.wasLoaded = false;
        this.readyState = 0 /* ReadyState.NONE */;
        this.swipeListenerDisposable = this._register(new MutableDisposable());
        //#region create browser window
        {
            this.configObjectUrl = this._register(protocolMainService.createIPCObjectUrl());
            // Load window state
            const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
            this.windowState = state;
            this.logService.trace('window#ctor: using window state', state);
            const webPreferences = {
                preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js').fsPath,
                additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
                v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none'
            };
            if (process.isEmbeddedApp) {
                webPreferences.backgroundThrottling = false; // disable for sub-app
            }
            const options = instantiationService.invokeFunction(defaultBrowserWindowOptions, this.windowState, undefined, webPreferences);
            // Create the browser window
            mark('code/willCreateCodeBrowserWindow');
            this._win = new electron.BrowserWindow(options);
            mark('code/didCreateCodeBrowserWindow');
            this._id = this._win.id;
            this.setWin(this._win, options);
            // Apply some state after window creation
            this.applyState(this.windowState, hasMultipleDisplays);
            this._lastFocusTime = Date.now(); // since we show directly, we need to set the last focus time too
        }
        //#endregion
        //#region JS Callstack Collector
        let sampleInterval = parseInt(this.environmentMainService.args['unresponsive-sample-interval'] || '1000');
        let samplePeriod = parseInt(this.environmentMainService.args['unresponsive-sample-period'] || '15000');
        if (sampleInterval <= 0 || samplePeriod <= 0 || sampleInterval > samplePeriod) {
            this.logService.warn(`Invalid unresponsive sample interval (${sampleInterval}ms) or period (${samplePeriod}ms), using defaults.`);
            sampleInterval = 1000;
            samplePeriod = 15000;
        }
        this.jsCallStackMap = new Map();
        this.jsCallStackEffectiveSampleCount = Math.round(samplePeriod / sampleInterval);
        this.jsCallStackCollector = this._register(new Delayer(sampleInterval));
        this.jsCallStackCollectorStopScheduler = this._register(new RunOnceScheduler(() => {
            this.stopCollectingJScallStacks(); // Stop collecting after 15s max
        }, samplePeriod));
        //#endregion
        // respect configured menu bar visibility
        this.onConfigurationUpdated();
        // macOS: touch bar support
        this.createTouchBar();
        // Eventing
        this.registerListeners();
    }
    setReady() {
        this.logService.trace(`window#load: window reported ready (id: ${this._id})`);
        this.readyState = 2 /* ReadyState.READY */;
        // inform all waiting promises that we are ready now
        while (this.whenReadyCallbacks.length) {
            this.whenReadyCallbacks.pop()(this);
        }
        // Events
        this._onDidSignalReady.fire();
    }
    ready() {
        return new Promise(resolve => {
            if (this.isReady) {
                return resolve(this);
            }
            // otherwise keep and call later when we are ready
            this.whenReadyCallbacks.push(resolve);
        });
    }
    get isReady() {
        return this.readyState === 2 /* ReadyState.READY */;
    }
    get whenClosedOrLoaded() {
        return new Promise(resolve => {
            function handle() {
                closeListener.dispose();
                loadListener.dispose();
                resolve();
            }
            const closeListener = this.onDidClose(() => handle());
            const loadListener = this.onWillLoad(() => handle());
        });
    }
    registerListeners() {
        // Window error conditions to handle
        this._register(Event.fromNodeEventEmitter(this._win, 'unresponsive')(() => this.onWindowError(1 /* WindowError.UNRESPONSIVE */)));
        this._register(Event.fromNodeEventEmitter(this._win, 'responsive')(() => this.onWindowError(4 /* WindowError.RESPONSIVE */)));
        this._register(Event.fromNodeEventEmitter(this._win.webContents, 'render-process-gone', (event, details) => details)(details => this.onWindowError(2 /* WindowError.PROCESS_GONE */, { ...details })));
        this._register(Event.fromNodeEventEmitter(this._win.webContents, 'did-fail-load', (event, exitCode, reason) => ({ exitCode, reason }))(({ exitCode, reason }) => this.onWindowError(3 /* WindowError.LOAD */, { reason, exitCode })));
        // Prevent windows/iframes from blocking the unload
        // through DOM events. We have our own logic for
        // unloading a window that should not be confused
        // with the DOM way.
        // (https://github.com/microsoft/vscode/issues/122736)
        this._register(Event.fromNodeEventEmitter(this._win.webContents, 'will-prevent-unload')(event => event.preventDefault()));
        // Remember that we loaded
        this._register(Event.fromNodeEventEmitter(this._win.webContents, 'did-finish-load')(() => {
            // Associate properties from the load request if provided
            if (this.pendingLoadConfig) {
                this._config = this.pendingLoadConfig;
                this.pendingLoadConfig = undefined;
            }
        }));
        // Window (Un)Maximize
        this._register(this.onDidMaximize(() => {
            if (this._config) {
                this._config.maximized = true;
            }
        }));
        this._register(this.onDidUnmaximize(() => {
            if (this._config) {
                this._config.maximized = false;
            }
        }));
        // Window Fullscreen
        this._register(this.onDidEnterFullScreen(() => {
            this.sendWhenReady('vscode:enterFullScreen', CancellationToken.None);
        }));
        this._register(this.onDidLeaveFullScreen(() => {
            this.sendWhenReady('vscode:leaveFullScreen', CancellationToken.None);
        }));
        // Handle configuration changes
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
        // Handle Workspace events
        this._register(this.workspacesManagementMainService.onDidDeleteUntitledWorkspace(e => this.onDidDeleteUntitledWorkspace(e)));
        // Inject headers when requests are incoming
        const urls = ['https://*.vsassets.io/*'];
        if (this.productService.extensionsGallery?.serviceUrl) {
            const serviceUrl = URI.parse(this.productService.extensionsGallery.serviceUrl);
            urls.push(`${serviceUrl.scheme}://${serviceUrl.authority}/*`);
        }
        this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, async (details, cb) => {
            const headers = await this.getMarketplaceHeaders();
            cb({ cancel: false, requestHeaders: Object.assign(details.requestHeaders, headers) });
        });
    }
    getMarketplaceHeaders() {
        if (!this.marketplaceHeadersPromise) {
            this.marketplaceHeadersPromise = resolveMarketplaceHeaders(this.productService.version, this.productService, this.environmentMainService, this.configurationService, this.fileService, this.applicationStorageMainService, this.telemetryService);
        }
        return this.marketplaceHeadersPromise;
    }
    async onWindowError(type, details) {
        switch (type) {
            case 2 /* WindowError.PROCESS_GONE */:
                this.logService.error(`CodeWindow: renderer process gone (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
                break;
            case 1 /* WindowError.UNRESPONSIVE */:
                this.logService.error('CodeWindow: detected unresponsive');
                break;
            case 4 /* WindowError.RESPONSIVE */:
                this.logService.error('CodeWindow: recovered from unresponsive');
                break;
            case 3 /* WindowError.LOAD */:
                this.logService.error(`CodeWindow: failed to load (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
                break;
        }
        this.telemetryService.publicLog2('windowerror', {
            type,
            reason: details?.reason,
            code: details?.exitCode
        });
        // Inform User if non-recoverable
        switch (type) {
            case 1 /* WindowError.UNRESPONSIVE */:
            case 2 /* WindowError.PROCESS_GONE */:
                // If we run extension tests from CLI, we want to signal
                // back this state to the test runner by exiting with a
                // non-zero exit code.
                if (this.isExtensionDevelopmentTestFromCli) {
                    this.lifecycleMainService.kill(1);
                    return;
                }
                // If we run smoke tests, want to proceed with an orderly
                // shutdown as much as possible by destroying the window
                // and then calling the normal `quit` routine.
                if (this.environmentMainService.args['enable-smoke-test-driver']) {
                    await this.destroyWindow(false, false);
                    this.lifecycleMainService.quit(); // still allow for an orderly shutdown
                    return;
                }
                // Unresponsive
                if (type === 1 /* WindowError.UNRESPONSIVE */) {
                    if (this.isExtensionDevelopmentHost || this.isExtensionTestHost || this._win?.webContents?.isDevToolsOpened()) {
                        // TODO@electron Workaround for https://github.com/microsoft/vscode/issues/56994
                        // In certain cases the window can report unresponsiveness because a breakpoint was hit
                        // and the process is stopped executing. The most typical cases are:
                        // - devtools are opened and debugging happens
                        // - window is an extensions development host that is being debugged
                        // - window is an extension test development host that is being debugged
                        return;
                    }
                    // Interrupt V8 and collect JavaScript stack
                    this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
                    // Stack collection will stop under any of the following conditions:
                    // - The window becomes responsive again
                    // - The window is destroyed i-e reopen or closed
                    // - sampling period is complete, default is 15s
                    this.jsCallStackCollectorStopScheduler.schedule();
                    // Show Dialog
                    const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
                        type: 'warning',
                        buttons: [
                            localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen"),
                            localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"),
                            localize({ key: 'wait', comment: ['&& denotes a mnemonic'] }, "&&Keep Waiting")
                        ],
                        message: localize('appStalled', "The window is not responding"),
                        detail: localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
                        checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
                    }, this._win);
                    // Handle choice
                    if (response !== 2 /* keep waiting */) {
                        const reopen = response === 0;
                        this.stopCollectingJScallStacks();
                        await this.destroyWindow(reopen, checkboxChecked);
                    }
                }
                // Process gone
                else if (type === 2 /* WindowError.PROCESS_GONE */) {
                    let message;
                    if (!details) {
                        message = localize('appGone', "The window terminated unexpectedly");
                    }
                    else {
                        message = localize('appGoneDetails', "The window terminated unexpectedly (reason: '{0}', code: '{1}')", details.reason, details.exitCode ?? '<unknown>');
                    }
                    // Show Dialog
                    const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
                        type: 'warning',
                        buttons: [
                            this._config?.workspace ? localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen") : localize({ key: 'newWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window"),
                            localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close")
                        ],
                        message,
                        detail: this._config?.workspace ?
                            localize('appGoneDetailWorkspace', "We are sorry for the inconvenience. You can reopen the window to continue where you left off.") :
                            localize('appGoneDetailEmptyWindow', "We are sorry for the inconvenience. You can open a new empty window to start again."),
                        checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
                    }, this._win);
                    // Handle choice
                    const reopen = response === 0;
                    await this.destroyWindow(reopen, checkboxChecked);
                }
                break;
            case 4 /* WindowError.RESPONSIVE */:
                this.stopCollectingJScallStacks();
                break;
        }
    }
    async destroyWindow(reopen, skipRestoreEditors) {
        const workspace = this._config?.workspace;
        // check to discard editor state first
        if (skipRestoreEditors && workspace) {
            try {
                const workspaceStorage = this.storageMainService.workspaceStorage(workspace);
                await workspaceStorage.init();
                workspaceStorage.delete('memento/workbench.parts.editor');
                await workspaceStorage.close();
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        // 'close' event will not be fired on destroy(), so signal crash via explicit event
        this._onDidDestroy.fire();
        try {
            // ask the windows service to open a new fresh window if specified
            if (reopen && this._config) {
                // We have to reconstruct a openable from the current workspace
                let uriToOpen = undefined;
                let forceEmpty = undefined;
                if (isSingleFolderWorkspaceIdentifier(workspace)) {
                    uriToOpen = { folderUri: workspace.uri };
                }
                else if (isWorkspaceIdentifier(workspace)) {
                    uriToOpen = { workspaceUri: workspace.configPath };
                }
                else {
                    forceEmpty = true;
                }
                // Delegate to windows service
                const window = (await this.windowsMainService.open({
                    context: 5 /* OpenContext.API */,
                    userEnv: this._config.userEnv,
                    cli: {
                        ...this.environmentMainService.args,
                        _: [] // we pass in the workspace to open explicitly via `urisToOpen`
                    },
                    urisToOpen: uriToOpen ? [uriToOpen] : undefined,
                    forceEmpty,
                    forceNewWindow: true,
                    remoteAuthority: this.remoteAuthority
                })).at(0);
                window?.focus();
            }
        }
        finally {
            // make sure to destroy the window as its renderer process is gone. do this
            // after the code for reopening the window, to prevent the entire application
            // from quitting when the last window closes as a result.
            this._win?.destroy();
        }
    }
    onDidDeleteUntitledWorkspace(workspace) {
        // Make sure to update our workspace config if we detect that it
        // was deleted
        if (this._config?.workspace?.id === workspace.id) {
            this._config.workspace = undefined;
        }
    }
    onConfigurationUpdated(e) {
        // Swipe command support (macOS)
        if (isMacintosh && (!e || e.affectsConfiguration('workbench.editor.swipeToNavigate'))) {
            const swipeToNavigate = this.configurationService.getValue('workbench.editor.swipeToNavigate');
            if (swipeToNavigate) {
                this.registerSwipeListener();
            }
            else {
                this.swipeListenerDisposable.clear();
            }
        }
        // Menubar
        if (!e || e.affectsConfiguration("window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */)) {
            const newMenuBarVisibility = this.getMenuBarVisibility();
            if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
                this.currentMenuBarVisibility = newMenuBarVisibility;
                this.setMenuBarVisibility(newMenuBarVisibility);
            }
        }
        // Proxy
        if (!e || e.affectsConfiguration('http.proxy') || e.affectsConfiguration('http.noProxy')) {
            const inspect = this.configurationService.inspect('http.proxy');
            let newHttpProxy = (inspect.userLocalValue || '').trim()
                || (process.env['https_proxy'] || process.env['HTTPS_PROXY'] || process.env['http_proxy'] || process.env['HTTP_PROXY'] || '').trim() // Not standardized.
                || undefined;
            if (newHttpProxy?.indexOf('@') !== -1) {
                const uri = URI.parse(newHttpProxy);
                const i = uri.authority.indexOf('@');
                if (i !== -1) {
                    newHttpProxy = uri.with({ authority: uri.authority.substring(i + 1) })
                        .toString();
                }
            }
            if (newHttpProxy?.endsWith('/')) {
                newHttpProxy = newHttpProxy.substr(0, newHttpProxy.length - 1);
            }
            const newNoProxy = (this.configurationService.getValue('http.noProxy') || []).map((item) => item.trim()).join(',')
                || (process.env['no_proxy'] || process.env['NO_PROXY'] || '').trim() || undefined; // Not standardized.
            if ((newHttpProxy || '').indexOf('@') === -1 && (newHttpProxy !== this.currentHttpProxy || newNoProxy !== this.currentNoProxy)) {
                this.currentHttpProxy = newHttpProxy;
                this.currentNoProxy = newNoProxy;
                const proxyRules = newHttpProxy || '';
                const proxyBypassRules = newNoProxy ? `${newNoProxy},<local>` : '<local>';
                this.logService.trace(`Setting proxy to '${proxyRules}', bypassing '${proxyBypassRules}'`);
                this._win.webContents.session.setProxy({ proxyRules, proxyBypassRules, pacScript: '' });
                electron.app.setProxy({ proxyRules, proxyBypassRules, pacScript: '' });
            }
        }
    }
    registerSwipeListener() {
        this.swipeListenerDisposable.value = Event.fromNodeEventEmitter(this._win, 'swipe', (event, cmd) => cmd)(cmd => {
            if (!this.isReady) {
                return; // window must be ready
            }
            if (cmd === 'left') {
                this.send('vscode:runAction', { id: 'workbench.action.openPreviousRecentlyUsedEditor', from: 'mouse' });
            }
            else if (cmd === 'right') {
                this.send('vscode:runAction', { id: 'workbench.action.openNextRecentlyUsedEditor', from: 'mouse' });
            }
        });
    }
    addTabbedWindow(window) {
        if (isMacintosh && window.win) {
            this._win.addTabbedWindow(window.win);
        }
    }
    load(configuration, options = Object.create(null)) {
        this.logService.trace(`window#load: attempt to load window (id: ${this._id})`);
        // Clear Document Edited if needed
        if (this.isDocumentEdited()) {
            if (!options.isReload || !this.backupMainService.isHotExitEnabled()) {
                this.setDocumentEdited(false);
            }
        }
        // Clear Title and Filename if needed
        if (!options.isReload) {
            if (this.getRepresentedFilename()) {
                this.setRepresentedFilename('');
            }
            this._win.setTitle(this.productService.nameLong);
        }
        // Update configuration values based on our window context
        // and set it into the config object URL for usage.
        this.updateConfiguration(configuration, options);
        // If this is the first time the window is loaded, we associate the paths
        // directly with the window because we assume the loading will just work
        if (this.readyState === 0 /* ReadyState.NONE */) {
            this._config = configuration;
        }
        // Otherwise, the window is currently showing a folder and if there is an
        // unload handler preventing the load, we cannot just associate the paths
        // because the loading might be vetoed. Instead we associate it later when
        // the window load event has fired.
        else {
            this.pendingLoadConfig = configuration;
        }
        // Indicate we are navigting now
        this.readyState = 1 /* ReadyState.NAVIGATING */;
        // Load URL
        let windowUrl;
        if (process.env.VSCODE_DEV && process.env.VSCODE_DEV_SERVER_URL) {
            windowUrl = process.env.VSCODE_DEV_SERVER_URL; // support URL override for development
        }
        else if (configuration.isSessionsWindow) {
            windowUrl = FileAccess.asBrowserUri(`vs/sessions/electron-browser/sessions${this.environmentMainService.isBuilt ? '' : '-dev'}.html`).toString(true);
        }
        else {
            windowUrl = FileAccess.asBrowserUri(`vs/code/electron-browser/workbench/workbench${this.environmentMainService.isBuilt ? '' : '-dev'}.html`).toString(true);
        }
        this._win.loadURL(windowUrl);
        // Remember that we did load
        const wasLoaded = this.wasLoaded;
        this.wasLoaded = true;
        // Make window visible if it did not open in N seconds because this indicates an error
        // Only do this when running out of sources and not when running tests
        if (!this.environmentMainService.isBuilt && !this.environmentMainService.extensionTestsLocationURI) {
            this._register(new RunOnceScheduler(() => {
                if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
                    this._win.show();
                    this.focus({ mode: 2 /* FocusMode.Force */ });
                    this._win.webContents.openDevTools();
                }
            }, 10000)).schedule();
        }
        // Event
        this._onWillLoad.fire({ workspace: configuration.workspace, reason: options.isReload ? 3 /* LoadReason.RELOAD */ : wasLoaded ? 2 /* LoadReason.LOAD */ : 1 /* LoadReason.INITIAL */ });
    }
    updateConfiguration(configuration, options) {
        // If this window was loaded before from the command line
        // (as indicated by VSCODE_CLI environment), make sure to
        // preserve that user environment in subsequent loads,
        // unless the new configuration context was also a CLI
        // (for https://github.com/microsoft/vscode/issues/108571)
        // Also, preserve the environment if we're loading from an
        // extension development host that had its environment set
        // (for https://github.com/microsoft/vscode/issues/123508)
        const currentUserEnv = (this._config ?? this.pendingLoadConfig)?.userEnv;
        if (currentUserEnv) {
            const shouldPreserveLaunchCliEnvironment = isLaunchedFromCli(currentUserEnv) && !isLaunchedFromCli(configuration.userEnv);
            const shouldPreserveDebugEnvironmnet = this.isExtensionDevelopmentHost;
            if (shouldPreserveLaunchCliEnvironment || shouldPreserveDebugEnvironmnet) {
                configuration.userEnv = { ...currentUserEnv, ...configuration.userEnv }; // still allow to override certain environment as passed in
            }
        }
        // If named pipe was instantiated for the crashpad_handler process, reuse the same
        // pipe for new app instances connecting to the original app instance.
        // Ref: https://github.com/microsoft/vscode/issues/115874
        if (process.env['CHROME_CRASHPAD_PIPE_NAME']) {
            Object.assign(configuration.userEnv, {
                CHROME_CRASHPAD_PIPE_NAME: process.env['CHROME_CRASHPAD_PIPE_NAME']
            });
        }
        // Add disable-extensions to the config, but do not preserve it on currentConfig or
        // pendingLoadConfig so that it is applied only on this load
        if (options.disableExtensions !== undefined) {
            configuration['disable-extensions'] = options.disableExtensions;
        }
        // Update window related properties
        try {
            configuration.handle = VSBuffer.wrap(this._win.getNativeWindowHandle());
        }
        catch (error) {
            this.logService.error(`Error getting native window handle: ${error}`);
        }
        configuration.fullscreen = this.isFullScreen;
        configuration.maximized = this._win.isMaximized();
        configuration.partsSplash = this.themeMainService.getWindowSplash(configuration.workspace);
        configuration.zoomLevel = this.getZoomLevel();
        configuration.isCustomZoomLevel = typeof this.customZoomLevel === 'number';
        if (configuration.isCustomZoomLevel && configuration.partsSplash) {
            configuration.partsSplash.zoomLevel = configuration.zoomLevel;
        }
        // Update with latest perf marks
        mark('code/willOpenNewWindow');
        configuration.perfMarks = getMarks();
        // Update in config object URL for usage in renderer
        this.configObjectUrl.update(configuration);
    }
    async reload(cli) {
        // Copy our current config for reuse
        const configuration = Object.assign({}, this._config);
        // Validate workspace
        configuration.workspace = await this.validateWorkspaceBeforeReload(configuration);
        // Delete some properties we do not want during reload
        delete configuration.filesToOpenOrCreate;
        delete configuration.filesToDiff;
        delete configuration.filesToMerge;
        delete configuration.filesToWait;
        // Some configuration things get inherited if the window is being reloaded and we are
        // in extension development mode. These options are all development related.
        if (this.isExtensionDevelopmentHost && cli) {
            configuration.verbose = cli.verbose;
            configuration.debugId = cli.debugId;
            configuration.extensionEnvironment = cli.extensionEnvironment;
            configuration['inspect-extensions'] = cli['inspect-extensions'];
            configuration['inspect-brk-extensions'] = cli['inspect-brk-extensions'];
            configuration['extensions-dir'] = cli['extensions-dir'];
        }
        configuration.accessibilitySupport = electron.app.isAccessibilitySupportEnabled();
        configuration.isInitialStartup = false; // since this is a reload
        configuration.policiesData = this.policyService.serialize(); // set policies data again
        configuration.continueOn = this.environmentMainService.continueOn;
        configuration.profiles = {
            all: this.userDataProfilesService.profiles,
            profile: this.profile || this.userDataProfilesService.defaultProfile,
            home: this.userDataProfilesService.profilesHome
        };
        configuration.logLevel = this.loggerMainService.getLogLevel();
        configuration.loggers = this.loggerMainService.getGlobalLoggers();
        // Load config
        this.load(configuration, { isReload: true, disableExtensions: cli?.['disable-extensions'] });
    }
    async validateWorkspaceBeforeReload(configuration) {
        // Multi folder
        if (isWorkspaceIdentifier(configuration.workspace)) {
            const configPath = configuration.workspace.configPath;
            if (configPath.scheme === Schemas.file) {
                const workspaceExists = await this.fileService.exists(configPath);
                if (!workspaceExists) {
                    return undefined;
                }
            }
        }
        // Single folder
        else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
            const uri = configuration.workspace.uri;
            if (uri.scheme === Schemas.file) {
                const folderExists = await this.fileService.exists(uri);
                if (!folderExists) {
                    return undefined;
                }
            }
        }
        // Workspace is valid
        return configuration.workspace;
    }
    serializeWindowState() {
        if (!this._win) {
            return defaultWindowState();
        }
        // fullscreen gets special treatment
        if (this.isFullScreen) {
            let display;
            try {
                display = electron.screen.getDisplayMatching(this.getBounds());
            }
            catch (error) {
                // Electron has weird conditions under which it throws errors
                // e.g. https://github.com/microsoft/vscode/issues/100334 when
                // large numbers are passed in
            }
            const defaultState = defaultWindowState();
            return {
                mode: 3 /* WindowMode.Fullscreen */,
                display: display ? display.id : undefined,
                // Still carry over window dimensions from previous sessions
                // if we can compute it in fullscreen state.
                // does not seem possible in all cases on Linux for example
                // (https://github.com/microsoft/vscode/issues/58218) so we
                // fallback to the defaults in that case.
                width: this.windowState.width || defaultState.width,
                height: this.windowState.height || defaultState.height,
                x: this.windowState.x || 0,
                y: this.windowState.y || 0,
                zoomLevel: this.customZoomLevel
            };
        }
        const state = Object.create(null);
        let mode;
        // get window mode
        if (!isMacintosh && this._win.isMaximized()) {
            mode = 0 /* WindowMode.Maximized */;
        }
        else {
            mode = 1 /* WindowMode.Normal */;
        }
        // we don't want to save minimized state, only maximized or normal
        if (mode === 0 /* WindowMode.Maximized */) {
            state.mode = 0 /* WindowMode.Maximized */;
        }
        else {
            state.mode = 1 /* WindowMode.Normal */;
        }
        // only consider non-minimized window states
        if (mode === 1 /* WindowMode.Normal */ || mode === 0 /* WindowMode.Maximized */) {
            let bounds;
            if (mode === 1 /* WindowMode.Normal */) {
                bounds = this.getBounds();
            }
            else {
                bounds = this._win.getNormalBounds(); // make sure to persist the normal bounds when maximized to be able to restore them
            }
            state.x = bounds.x;
            state.y = bounds.y;
            state.width = bounds.width;
            state.height = bounds.height;
        }
        state.zoomLevel = this.customZoomLevel;
        return state;
    }
    restoreWindowState(state) {
        mark('code/willRestoreCodeWindowState');
        let hasMultipleDisplays = false;
        if (state) {
            // Window zoom
            this.customZoomLevel = state.zoomLevel;
            // Window dimensions
            try {
                const displays = electron.screen.getAllDisplays();
                hasMultipleDisplays = displays.length > 1;
                state = WindowStateValidator.validateWindowState(this.logService, state, displays);
            }
            catch (err) {
                this.logService.warn(`Unexpected error validating window state: ${err}\n${err.stack}`); // somehow display API can be picky about the state to validate
            }
        }
        mark('code/didRestoreCodeWindowState');
        return [state || defaultWindowState(), hasMultipleDisplays];
    }
    getBounds() {
        const [x, y] = this._win.getPosition();
        const [width, height] = this._win.getSize();
        return { x, y, width, height };
    }
    setFullScreen(fullscreen, fromRestore) {
        super.setFullScreen(fullscreen, fromRestore);
        // Events
        this.sendWhenReady(fullscreen ? 'vscode:enterFullScreen' : 'vscode:leaveFullScreen', CancellationToken.None);
        // Respect configured menu bar visibility or default to toggle if not set
        if (this.currentMenuBarVisibility) {
            this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
        }
    }
    getMenuBarVisibility() {
        let menuBarVisibility = getMenuBarVisibility(this.configurationService);
        if (['visible', 'toggle', 'hidden'].indexOf(menuBarVisibility) < 0) {
            menuBarVisibility = 'classic';
        }
        return menuBarVisibility;
    }
    setMenuBarVisibility(visibility, notify = true) {
        if (isMacintosh) {
            return; // ignore for macOS platform
        }
        if (visibility === 'toggle') {
            if (notify) {
                this.send('vscode:showInfoMessage', localize('hiddenMenuBar', "You can still access the menu bar by pressing the Alt-key."));
            }
        }
        if (visibility === 'hidden') {
            // for some weird reason that I have no explanation for, the menu bar is not hiding when calling
            // this without timeout (see https://github.com/microsoft/vscode/issues/19777). there seems to be
            // a timing issue with us opening the first window and the menu bar getting created. somehow the
            // fact that we want to hide the menu without being able to bring it back via Alt key makes Electron
            // still show the menu. Unable to reproduce from a simple Hello World application though...
            setTimeout(() => {
                this.doSetMenuBarVisibility(visibility);
            });
        }
        else {
            this.doSetMenuBarVisibility(visibility);
        }
    }
    doSetMenuBarVisibility(visibility) {
        const isFullscreen = this.isFullScreen;
        switch (visibility) {
            case ('classic'):
                this._win.setMenuBarVisibility(!isFullscreen);
                this._win.autoHideMenuBar = isFullscreen;
                break;
            case ('visible'):
                this._win.setMenuBarVisibility(true);
                this._win.autoHideMenuBar = false;
                break;
            case ('toggle'):
                this._win.setMenuBarVisibility(false);
                this._win.autoHideMenuBar = true;
                break;
            case ('hidden'):
                this._win.setMenuBarVisibility(false);
                this._win.autoHideMenuBar = false;
                break;
        }
    }
    notifyZoomLevel(zoomLevel) {
        this.customZoomLevel = zoomLevel;
    }
    getZoomLevel() {
        if (typeof this.customZoomLevel === 'number') {
            return this.customZoomLevel;
        }
        const windowSettings = this.configurationService.getValue('window');
        return windowSettings?.zoomLevel;
    }
    close() {
        this._win?.close();
    }
    sendWhenReady(channel, token, ...args) {
        if (this.isReady) {
            this.send(channel, ...args);
        }
        else {
            this.ready().then(() => {
                if (!token.isCancellationRequested) {
                    this.send(channel, ...args);
                }
            });
        }
    }
    send(channel, ...args) {
        if (this._win) {
            if (this._win.isDestroyed() || this._win.webContents.isDestroyed()) {
                this.logService.warn(`Sending IPC message to channel '${channel}' for window that is destroyed`);
                return;
            }
            try {
                this._win.webContents.send(channel, ...args);
            }
            catch (error) {
                this.logService.warn(`Error sending IPC message to channel '${channel}' of window ${this._id}: ${toErrorMessage(error)}`);
            }
        }
    }
    updateTouchBar(groups) {
        if (!isMacintosh) {
            return; // only supported on macOS
        }
        // Update segments for all groups. Setting the segments property
        // of the group directly prevents ugly flickering from happening
        this.touchBarGroups.forEach((touchBarGroup, index) => {
            const commands = groups[index];
            touchBarGroup.segments = this.createTouchBarGroupSegments(commands);
        });
    }
    createTouchBar() {
        if (!isMacintosh) {
            return; // only supported on macOS
        }
        // To avoid flickering, we try to reuse the touch bar group
        // as much as possible by creating a large number of groups
        // for reusing later.
        for (let i = 0; i < 10; i++) {
            const groupTouchBar = this.createTouchBarGroup();
            this.touchBarGroups.push(groupTouchBar);
        }
        this._win.setTouchBar(new electron.TouchBar({ items: this.touchBarGroups }));
    }
    createTouchBarGroup(items = []) {
        // Group Segments
        const segments = this.createTouchBarGroupSegments(items);
        // Group Control
        const control = new electron.TouchBar.TouchBarSegmentedControl({
            segments,
            mode: 'buttons',
            segmentStyle: 'automatic',
            change: (selectedIndex) => {
                this.sendWhenReady('vscode:runAction', CancellationToken.None, { id: control.segments[selectedIndex].id, from: 'touchbar' });
            }
        });
        return control;
    }
    createTouchBarGroupSegments(items = []) {
        const segments = items.map(item => {
            let icon;
            if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dark?.scheme === Schemas.file) {
                icon = electron.nativeImage.createFromPath(URI.revive(item.icon.dark).fsPath);
                if (icon.isEmpty()) {
                    icon = undefined;
                }
            }
            let title;
            if (typeof item.title === 'string') {
                title = item.title;
            }
            else {
                title = item.title.value;
            }
            return {
                id: item.id,
                label: !icon ? title : undefined,
                icon
            };
        });
        return segments;
    }
    async startCollectingJScallStacks() {
        if (!this.jsCallStackCollector.isTriggered()) {
            const stack = await this._win?.webContents.mainFrame.collectJavaScriptCallStack();
            // Increment the count for this stack trace
            if (stack) {
                const count = this.jsCallStackMap.get(stack) || 0;
                this.jsCallStackMap.set(stack, count + 1);
            }
            this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
        }
    }
    stopCollectingJScallStacks() {
        this.jsCallStackCollectorStopScheduler.cancel();
        this.jsCallStackCollector.cancel();
        if (this.jsCallStackMap.size) {
            let logMessage = `CodeWindow unresponsive samples:\n`;
            let samples = 0;
            const sortedEntries = Array.from(this.jsCallStackMap.entries())
                .sort((a, b) => b[1] - a[1]);
            for (const [stack, count] of sortedEntries) {
                samples += count;
                // If the stack appears more than 20 percent of the time, log it
                // to the error telemetry as UnresponsiveSampleError.
                if (Math.round((count * 100) / this.jsCallStackEffectiveSampleCount) > 20) {
                    const fakeError = new UnresponsiveError(stack, this.id, this._win?.webContents.getOSProcessId());
                    errorHandler.onUnexpectedError(fakeError);
                }
                logMessage += `<${count}> ${stack}\n`;
            }
            logMessage += `Total Samples: ${samples}\n`;
            logMessage += 'For full overview of the unresponsive period, capture cpu profile via https://aka.ms/vscode-tracing-cpu-profile';
            this.logService.error(logMessage);
        }
        this.jsCallStackMap.clear();
    }
    matches(webContents) {
        return this._win?.webContents.id === webContents.id;
    }
    dispose() {
        super.dispose();
        // Deregister the loggers for this window
        this.loggerMainService.deregisterLoggers(this.id);
    }
};
CodeWindow = __decorate([
    __param(1, ILogService),
    __param(2, ILoggerMainService),
    __param(3, IEnvironmentMainService),
    __param(4, IPolicyService),
    __param(5, IUserDataProfilesMainService),
    __param(6, IFileService),
    __param(7, IApplicationStorageMainService),
    __param(8, IStorageMainService),
    __param(9, IConfigurationService),
    __param(10, IThemeMainService),
    __param(11, IWorkspacesManagementMainService),
    __param(12, IBackupMainService),
    __param(13, ITelemetryService),
    __param(14, IDialogMainService),
    __param(15, ILifecycleMainService),
    __param(16, IProductService),
    __param(17, IProtocolMainService),
    __param(18, IWindowsMainService),
    __param(19, IStateService),
    __param(20, IInstantiationService)
], CodeWindow);
export { CodeWindow };
class UnresponsiveError extends Error {
    constructor(sample, windowId, pid = 0) {
        // Since the stacks are available via the sample
        // we can avoid collecting them when constructing the error.
        const stackTraceLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 0;
        super(`UnresponsiveSampleError: from window with ID ${windowId} belonging to process with pid ${pid}`);
        Error.stackTraceLimit = stackTraceLimit;
        this.name = 'UnresponsiveSampleError';
        this.stack = sample;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93SW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sUUFBUSxFQUFFLEVBQTRDLE1BQU0sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN0RixPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBZ0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqSCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFN0IsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDMUUs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