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
var BaseWindow_1;
import { isSafari, setFullscreen } from '../../base/browser/browser.js';
import { addDisposableListener, EventHelper, EventType, getWindow, getWindowById, getWindows, getWindowsCount, hasAppFocus, windowOpenNoOpener, windowOpenPopup, windowOpenWithSuccess } from '../../base/browser/dom.js';
import { DomEmitter } from '../../base/browser/event.js';
import { requestHidDevice, requestSerialPort, requestUsbDevice } from '../../base/browser/deviceAccess.js';
import { timeout } from '../../base/common/async.js';
import { Event } from '../../base/common/event.js';
import { Disposable, dispose, toDisposable } from '../../base/common/lifecycle.js';
import { matchesScheme, Schemas } from '../../base/common/network.js';
import { isIOS, isMacintosh } from '../../base/common/platform.js';
import Severity from '../../base/common/severity.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IBrowserWorkbenchEnvironmentService } from '../services/environment/browser/environmentService.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { IHostService } from '../services/host/browser/host.js';
import { registerWindowDriver } from '../services/driver/browser/driver.js';
import { isAuxiliaryWindow, mainWindow } from '../../base/browser/window.js';
import { createSingleCallFunction } from '../../base/common/functional.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../services/environment/common/environmentService.js';
import { MarkdownString } from '../../base/common/htmlContent.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
let BaseWindow = class BaseWindow extends Disposable {
    static { BaseWindow_1 = this; }
    static { this.TIMEOUT_HANDLES = Number.MIN_SAFE_INTEGER; } // try to not compete with the IDs of native `setTimeout`
    static { this.TIMEOUT_DISPOSABLES = new Map(); }
    constructor(targetWindow, dom = { getWindowsCount, getWindows }, hostService, environmentService, contextMenuService, layoutService) {
        super();
        this.hostService = hostService;
        this.environmentService = environmentService;
        this.contextMenuService = contextMenuService;
        this.layoutService = layoutService;
        this.enableWindowFocusOnElementFocus(targetWindow);
        this.enableMultiWindowAwareTimeout(targetWindow, dom);
        this.registerFullScreenListeners(targetWindow.vscodeWindowId);
        this.registerContextMenuListeners(targetWindow);
    }
    //#region focus handling in multi-window applications
    enableWindowFocusOnElementFocus(targetWindow) {
        const originalFocus = targetWindow.HTMLElement.prototype.focus;
        const that = this;
        targetWindow.HTMLElement.prototype.focus = function (options) {
            // Ensure the window the element belongs to is focused
            // in scenarios where auxiliary windows are present
            that.onElementFocus(getWindow(this));
            // Pass to original focus() method
            originalFocus.apply(this, [options]);
        };
    }
    onElementFocus(targetWindow) {
        // Check if focus should transfer: the application currently has focus somewhere, but not in the target window.
        if (!targetWindow.document.hasFocus() && hasAppFocus()) {
            // Call original focus()
            targetWindow.focus();
            // In Electron, `window.focus()` fails to bring the window
            // to the front if multiple windows exist in the same process
            // group (floating windows). As such, we ask the host service
            // to focus the window which can take care of bringin the
            // window to the front.
            //
            // To minimise disruption by bringing windows to the front
            // by accident, we only do this if the window is not already
            // focused and the active window is not the target window
            // but has focus. This is an indication that multiple windows
            // are opened in the same process group while the target window
            // is not focused.
            if (!this.environmentService.extensionTestsLocationURI &&
                !targetWindow.document.hasFocus()) {
                this.hostService.focus(targetWindow);
            }
        }
    }
    //#endregion
    //#region timeout handling in multi-window applications
    enableMultiWindowAwareTimeout(targetWindow, dom = { getWindowsCount, getWindows }) {
        // Override `setTimeout` and `clearTimeout` on the provided window to make
        // sure timeouts are dispatched to all opened windows. Some browsers may decide
        // to throttle timeouts in minimized windows, so with this we can ensure the
        // timeout is scheduled without being throttled (unless all windows are minimized).
        const originalSetTimeout = targetWindow.setTimeout;
        Object.defineProperty(targetWindow, 'vscodeOriginalSetTimeout', { get: () => originalSetTimeout });
        const originalClearTimeout = targetWindow.clearTimeout;
        Object.defineProperty(targetWindow, 'vscodeOriginalClearTimeout', { get: () => originalClearTimeout });
        targetWindow.setTimeout = function (handler, timeout = 0, ...args) {
            if (dom.getWindowsCount() === 1 || typeof handler === 'string' || timeout === 0 /* immediates are never throttled */) {
                return originalSetTimeout.apply(this, [handler, timeout, ...args]);
            }
            const timeoutDisposables = new Set();
            const timeoutHandle = BaseWindow_1.TIMEOUT_HANDLES++;
            BaseWindow_1.TIMEOUT_DISPOSABLES.set(timeoutHandle, timeoutDisposables);
            const handlerFn = createSingleCallFunction(handler, () => {
                dispose(timeoutDisposables);
                BaseWindow_1.TIMEOUT_DISPOSABLES.delete(timeoutHandle);
            });
            for (const { window, disposables } of dom.getWindows()) {
                if (isAuxiliaryWindow(window) && window.document.visibilityState === 'hidden') {
                    continue; // skip over hidden windows (but never over main window)
                }
                // we track didClear in case the browser does not properly clear the timeout
                // this can happen for timeouts on unfocused windows
                let didClear = false;
                const handle = window.vscodeOriginalSetTimeout?.apply(this, [(...args) => {
                        if (didClear) {
                            return;
                        }
                        handlerFn(...args);
                    }, timeout, ...args]);
                const timeoutDisposable = toDisposable(() => {
                    didClear = true;
                    window.vscodeOriginalClearTimeout?.apply(this, [handle]);
                    timeoutDisposables.delete(timeoutDisposable);
                });
                disposables.add(timeoutDisposable);
                timeoutDisposables.add(timeoutDisposable);
            }
            return timeoutHandle;
        };
        targetWindow.clearTimeout = function (timeoutHandle) {
            const timeoutDisposables = typeof timeoutHandle === 'number' ? BaseWindow_1.TIMEOUT_DISPOSABLES.get(timeoutHandle) : undefined;
            if (timeoutDisposables) {
                dispose(timeoutDisposables);
                BaseWindow_1.TIMEOUT_DISPOSABLES.delete(timeoutHandle);
            }
            else {
                originalClearTimeout.apply(this, [timeoutHandle]);
            }
        };
    }
    //#endregion
    //#region Confirm on Shutdown
    static async confirmOnShutdown(accessor, reason) {
        const dialogService = accessor.get(IDialogService);
        const configurationService = accessor.get(IConfigurationService);
        const message = reason === 2 /* ShutdownReason.QUIT */ ?
            (isMacintosh ? localize('quitMessageMac', "Are you sure you want to quit?") : localize('quitMessage', "Are you sure you want to exit?")) :
            localize('closeWindowMessage', "Are you sure you want to close the window?");
        const primaryButton = reason === 2 /* ShutdownReason.QUIT */ ?
            (isMacintosh ? localize({ key: 'quitButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Quit") : localize({ key: 'exitButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Exit")) :
            localize({ key: 'closeWindowButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Close Window");
        const res = await dialogService.confirm({
            message,
            primaryButton,
            checkbox: {
                label: localize('doNotAskAgain', "Do not ask me again")
            }
        });
        // Update setting if checkbox checked
        if (res.confirmed && res.checkboxChecked) {
            await configurationService.updateValue('window.confirmBeforeClose', 'never');
        }
        return res.confirmed;
    }
    //#endregion
    registerFullScreenListeners(targetWindowId) {
        this._register(this.hostService.onDidChangeFullScreen(({ windowId, fullscreen }) => {
            if (windowId === targetWindowId) {
                const targetWindow = getWindowById(targetWindowId);
                if (targetWindow) {
                    setFullscreen(fullscreen, targetWindow.window);
                }
            }
        }));
    }
    registerContextMenuListeners(targetWindow) {
        if (targetWindow !== mainWindow) {
            // we only need to listen in the main window as the code
            // will go by the active container and update accordingly
            return;
        }
        const update = (visible) => this.layoutService.activeContainer.classList.toggle('context-menu-visible', visible);
        this._register(this.contextMenuService.onDidShowContextMenu(() => update(true)));
        this._register(this.contextMenuService.onDidHideContextMenu(() => update(false)));
    }
};
BaseWindow = BaseWindow_1 = __decorate([
    __param(2, IHostService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, IContextMenuService),
    __param(5, IWorkbenchLayoutService)
], BaseWindow);
export { BaseWindow };
let BrowserWindow = class BrowserWindow extends BaseWindow {
    constructor(openerService, lifecycleService, dialogService, labelService, productService, browserEnvironmentService, layoutService, instantiationService, hostService, contextMenuService) {
        super(mainWindow, undefined, hostService, browserEnvironmentService, contextMenuService, layoutService);
        this.openerService = openerService;
        this.lifecycleService = lifecycleService;
        this.dialogService = dialogService;
        this.labelService = labelService;
        this.productService = productService;
        this.browserEnvironmentService = browserEnvironmentService;
        this.instantiationService = instantiationService;
        this.registerListeners();
        this.create();
    }
    registerListeners() {
        // Lifecycle
        this._register(this.lifecycleService.onWillShutdown(() => this.onWillShutdown()));
        // Layout
        const viewport = isIOS && mainWindow.visualViewport ? mainWindow.visualViewport /** Visual viewport */ : mainWindow /** Layout viewport */;
        this._register(addDisposableListener(viewport, EventType.RESIZE, () => {
            this.layoutService.layout();
            // Sometimes the keyboard appearing scrolls the whole workbench out of view, as a workaround scroll back into view #121206
            if (isIOS) {
                mainWindow.scrollTo(0, 0);
            }
        }));
        // Prevent the back/forward gestures in macOS
        this._register(addDisposableListener(this.layoutService.mainContainer, EventType.WHEEL, e => e.preventDefault(), { passive: false }));
        // Prevent native context menus in web
        this._register(addDisposableListener(this.layoutService.mainContainer, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true)));
        // Prevent default navigation on drop
        this._register(addDisposableListener(this.layoutService.mainContainer, EventType.DROP, e => EventHelper.stop(e, true)));
    }
    onWillShutdown() {
        // Try to detect some user interaction with the workbench
        // when shutdown has happened to not show the dialog e.g.
        // when navigation takes a longer time.
        Event.toPromise(Event.any(Event.once(new DomEmitter(mainWindow.document.body, EventType.KEY_DOWN, true).event), Event.once(new DomEmitter(mainWindow.document.body, EventType.MOUSE_DOWN, true).event))).then(async () => {
            // Delay the dialog in case the user interacted
            // with the page before it transitioned away
            await timeout(3000);
            // This should normally not happen, but if for some reason
            // the workbench was shutdown while the page is still there,
            // inform the user that only a reload can bring back a working
            // state.
            await this.dialogService.prompt({
                type: Severity.Error,
                message: localize('shutdownError', "An unexpected error occurred that requires a reload of this page."),
                detail: localize('shutdownErrorDetail', "The workbench was unexpectedly disposed while running."),
                buttons: [
                    {
                        label: localize({ key: 'reload', comment: ['&& denotes a mnemonic'] }, "&&Reload"),
                        run: () => mainWindow.location.reload() // do not use any services at this point since they are likely not functional at this point
                    }
                ]
            });
        });
    }
    create() {
        // Handle open calls
        this.setupOpenHandlers();
        // Label formatting
        this.registerLabelFormatters();
        // Commands
        this.registerCommands();
        // Smoke Test Driver
        this.setupDriver();
    }
    setupDriver() {
        if (this.environmentService.enableSmokeTestDriver) {
            registerWindowDriver(this.instantiationService);
        }
    }
    setupOpenHandlers() {
        // We need to ignore the `beforeunload` event while
        // we handle external links to open specifically for
        // the case of application protocols that e.g. invoke
        // vscode itself. We do not want to open these links
        // in a new window because that would leave a blank
        // window to the user, but using `window.location.href`
        // will trigger the `beforeunload`.
        this.openerService.setDefaultExternalOpener({
            openExternal: async (href) => {
                let isAllowedOpener = false;
                if (this.browserEnvironmentService.options?.openerAllowedExternalUrlPrefixes) {
                    for (const trustedPopupPrefix of this.browserEnvironmentService.options.openerAllowedExternalUrlPrefixes) {
                        if (href.startsWith(trustedPopupPrefix)) {
                            isAllowedOpener = true;
                            break;
                        }
                    }
                }
                // HTTP(s): open in new window and deal with potential popup blockers
                if (matchesScheme(href, Schemas.http) || matchesScheme(href, Schemas.https)) {
                    if (isSafari) {
                        const opened = windowOpenWithSuccess(href, !isAllowedOpener);
                        if (!opened) {
                            await this.dialogService.prompt({
                                type: Severity.Warning,
                                message: localize('unableToOpenExternal', "The browser blocked opening a new tab or window. Press 'Retry' to try again."),
                                custom: {
                                    markdownDetails: [{ markdown: new MarkdownString(localize('unableToOpenWindowDetail', "Please allow pop-ups for this website in your [browser settings]({0}).", 'https://aka.ms/allow-vscode-popup'), true) }]
                                },
                                buttons: [
                                    {
                                        label: localize({ key: 'retry', comment: ['&& denotes a mnemonic'] }, "&&Retry"),
                                        run: () => isAllowedOpener ? windowOpenPopup(href) : windowOpenNoOpener(href)
                                    }
                                ],
                                cancelButton: true
                            });
                        }
                    }
                    else {
                        if (isAllowedOpener) {
                            windowOpenPopup(href);
                        }
                        else {
                            windowOpenNoOpener(href);
                        }
                    }
                }
                // Anything else: set location to trigger protocol handler in the browser
                // but make sure to signal this as an expected unload and disable unload
                // handling explicitly to prevent the workbench from going down.
                else {
                    const invokeProtocolHandler = () => {
                        this.lifecycleService.withExpectedShutdown({ disableShutdownHandling: true }, () => mainWindow.location.href = href);
                    };
                    invokeProtocolHandler();
                    const showProtocolUrlOpenedDialog = async () => {
                        const { downloadUrl } = this.productService;
                        let detail;
                        const buttons = [
                            {
                                label: localize({ key: 'openExternalDialogButtonRetry.v2', comment: ['&& denotes a mnemonic'] }, "&&Try Again"),
                                run: () => invokeProtocolHandler()
                            }
                        ];
                        if (downloadUrl !== undefined) {
                            detail = localize('openExternalDialogDetail.v2', "We launched {0} on your computer.\n\nIf {1} did not launch, try again or install it below.", this.productService.nameLong, this.productService.nameLong);
                            buttons.push({
                                label: localize({ key: 'openExternalDialogButtonInstall.v3', comment: ['&& denotes a mnemonic'] }, "&&Install"),
                                run: async () => {
                                    await this.openerService.open(URI.parse(downloadUrl));
                                    // Re-show the dialog so that the user can come back after installing and try again
                                    showProtocolUrlOpenedDialog();
                                }
                            });
                        }
                        else {
                            detail = localize('openExternalDialogDetailNoInstall', "We launched {0} on your computer.\n\nIf {1} did not launch, try again below.", this.productService.nameLong, this.productService.nameLong);
                        }
                        // While this dialog shows, closing the tab will not display a confirmation dialog
                        // to avoid showing the user two dialogs at once
                        await this.hostService.withExpectedShutdown(() => this.dialogService.prompt({
                            type: Severity.Info,
                            message: localize('openExternalDialogTitle', "All done. You can close this tab now."),
                            detail,
                            buttons,
                            cancelButton: true
                        }));
                    };
                    // We cannot know whether the protocol handler succeeded.
                    // Display guidance in case it did not, e.g. the app is not installed locally.
                    if (matchesScheme(href, this.productService.urlProtocol)) {
                        await showProtocolUrlOpenedDialog();
                    }
                }
                return true;
            }
        });
    }
    registerLabelFormatters() {
        this._register(this.labelService.registerFormatter({
            scheme: Schemas.vscodeUserData,
            priority: true,
            formatting: {
                label: '(Settings) ${path}',
                separator: '/',
            }
        }));
    }
    registerCommands() {
        // Allow extensions to request USB devices in Web
        CommandsRegistry.registerCommand('workbench.experimental.requestUsbDevice', async (_accessor, options) => {
            return requestUsbDevice(options);
        });
        // Allow extensions to request Serial devices in Web
        CommandsRegistry.registerCommand('workbench.experimental.requestSerialPort', async (_accessor, options) => {
            return requestSerialPort(options);
        });
        // Allow extensions to request HID devices in Web
        CommandsRegistry.registerCommand('workbench.experimental.requestHidDevice', async (_accessor, options) => {
            return requestHidDevice(options);
        });
    }
};
BrowserWindow = __decorate([
    __param(0, IOpenerService),
    __param(1, ILifecycleService),
    __param(2, IDialogService),
    __param(3, ILabelService),
    __param(4, IProductService),
    __param(5, IBrowserWorkbenchEnvironmentService),
    __param(6, IWorkbenchLayoutService),
    __param(7, IInstantiationService),
    __param(8, IHostService),
    __param(9, IContextMenuService)
], BrowserWindow);
export { BrowserWindow };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvd2luZG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDMU4sT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3pELE9BQU8sRUFBaUIsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQWlDLE1BQU0sb0NBQW9DLENBQUM7QUFDekosT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbkUsT0FBTyxRQUFRLE1BQU0sK0JBQStCLENBQUM7QUFDckQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDeEMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0s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