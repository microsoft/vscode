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
import { Emitter, Event } from '../../../../base/common/event.js';
import { IHostService } from '../browser/host.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isFolderToOpen, isWorkspaceToOpen } from '../../../../platform/window/common/window.js';
import { Disposable, DisposableSet } from '../../../../base/common/lifecycle.js';
import { NativeHostService } from '../../../../platform/native/common/nativeHostService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { disposableWindowInterval, getActiveDocument, getWindowId, getWindowsCount, hasWindow, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { memoize } from '../../../../base/common/decorators.js';
import { isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { showBrowserToast } from '../browser/toasts.js';
import { generateUuid } from '../../../../base/common/uuid.js';
let WorkbenchNativeHostService = class WorkbenchNativeHostService extends NativeHostService {
    constructor(environmentService, mainProcessService) {
        super(environmentService.window.id, mainProcessService);
    }
};
WorkbenchNativeHostService = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IMainProcessService)
], WorkbenchNativeHostService);
let WorkbenchHostService = class WorkbenchHostService extends Disposable {
    constructor(nativeHostService, labelService, environmentService) {
        super();
        this.nativeHostService = nativeHostService;
        this.labelService = labelService;
        this.environmentService = environmentService;
        //#endregion
        //#region Native Handle
        this._nativeWindowHandleCache = new Map();
        //#endregion
        //#region Toast Notifications
        this.activeBrowserToasts = this._register(new DisposableSet());
        this.onDidChangeFocus = Event.latch(Event.any(Event.map(Event.filter(this.nativeHostService.onDidFocusMainOrAuxiliaryWindow, id => hasWindow(id), this._store), () => this.hasFocus, this._store), Event.map(Event.filter(this.nativeHostService.onDidBlurMainOrAuxiliaryWindow, id => hasWindow(id), this._store), () => this.hasFocus, this._store), Event.map(this.onDidChangeActiveWindow, () => this.hasFocus, this._store)), undefined, this._store);
        this.onDidChangeFullScreen = Event.filter(this.nativeHostService.onDidChangeWindowFullScreen, e => hasWindow(e.windowId), this._store);
        this.registerListeners();
    }
    registerListeners() {
        // Make sure to hide all OS toasts when the window gains focus
        this._register(this.onDidChangeFocus(focus => {
            if (focus) {
                this.clearToasts();
            }
        }));
    }
    get hasFocus() {
        return getActiveDocument().hasFocus();
    }
    async hadLastFocus() {
        const activeWindowId = await this.nativeHostService.getActiveWindowId();
        if (typeof activeWindowId === 'undefined') {
            return false;
        }
        return activeWindowId === this.nativeHostService.windowId;
    }
    //#endregion
    //#region Window
    get onDidChangeActiveWindow() {
        const emitter = this._register(new Emitter());
        // Emit via native focus tracking
        this._register(Event.filter(this.nativeHostService.onDidFocusMainOrAuxiliaryWindow, id => hasWindow(id), this._store)(id => emitter.fire(id)));
        this._register(onDidRegisterWindow(({ window, disposables }) => {
            // Emit via interval: immediately when opening an auxiliary window,
            // it is possible that document focus has not yet changed, so we
            // poll for a while to ensure we catch the event.
            disposables.add(disposableWindowInterval(window, () => {
                const hasFocus = window.document.hasFocus();
                if (hasFocus) {
                    emitter.fire(window.vscodeWindowId);
                }
                return hasFocus;
            }, 100, 20));
        }));
        return Event.latch(emitter.event, undefined, this._store);
    }
    openWindow(arg1, arg2) {
        if (Array.isArray(arg1)) {
            return this.doOpenWindow(arg1, arg2);
        }
        return this.doOpenEmptyWindow(arg1);
    }
    doOpenWindow(toOpen, options) {
        const remoteAuthority = this.environmentService.remoteAuthority;
        if (remoteAuthority) {
            toOpen.forEach(openable => openable.label = openable.label || this.getRecentLabel(openable));
            if (options?.remoteAuthority === undefined) {
                // set the remoteAuthority of the window the request came from.
                // It will be used when the input is neither file nor vscode-remote.
                options = options ? { ...options, remoteAuthority } : { remoteAuthority };
            }
        }
        return this.nativeHostService.openWindow(toOpen, options);
    }
    getRecentLabel(openable) {
        if (isFolderToOpen(openable)) {
            return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: 2 /* Verbosity.LONG */ });
        }
        if (isWorkspaceToOpen(openable)) {
            return this.labelService.getWorkspaceLabel({ id: '', configPath: openable.workspaceUri }, { verbose: 2 /* Verbosity.LONG */ });
        }
        return this.labelService.getUriLabel(openable.fileUri, { appendWorkspaceSuffix: true });
    }
    doOpenEmptyWindow(options) {
        const remoteAuthority = this.environmentService.remoteAuthority;
        if (!!remoteAuthority && options?.remoteAuthority === undefined) {
            // set the remoteAuthority of the window the request came from
            options = options ? { ...options, remoteAuthority } : { remoteAuthority };
        }
        return this.nativeHostService.openWindow(options);
    }
    toggleFullScreen(targetWindow) {
        return this.nativeHostService.toggleFullScreen({ targetWindowId: isAuxiliaryWindow(targetWindow) ? targetWindow.vscodeWindowId : undefined });
    }
    async moveTop(targetWindow) {
        if (getWindowsCount() <= 1) {
            return; // does not apply when only one window is opened
        }
        return this.nativeHostService.moveWindowTop(isAuxiliaryWindow(targetWindow) ? { targetWindowId: targetWindow.vscodeWindowId } : undefined);
    }
    async setWindowDimmed(targetWindow, dimmed) {
        return this.nativeHostService.updateWindowControls({ dimmed, targetWindowId: getWindowId(targetWindow) });
    }
    getCursorScreenPoint() {
        return this.nativeHostService.getCursorScreenPoint();
    }
    getWindows(options) {
        if (options.includeAuxiliaryWindows === false) {
            return this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });
        }
        return this.nativeHostService.getWindows({ includeAuxiliaryWindows: true });
    }
    //#endregion
    //#region Lifecycle
    focus(targetWindow, options) {
        return this.nativeHostService.focusWindow({
            mode: options?.mode,
            targetWindowId: getWindowId(targetWindow)
        });
    }
    restart() {
        return this.nativeHostService.relaunch();
    }
    reload(options) {
        return this.nativeHostService.reload(options);
    }
    close() {
        return this.nativeHostService.closeWindow();
    }
    async withExpectedShutdown(expectedShutdownTask) {
        return await expectedShutdownTask();
    }
    //#endregion
    //#region Screenshots
    getScreenshot(rect) {
        return this.nativeHostService.getScreenshot(rect);
    }
    async getNativeWindowHandle(windowId) {
        if (!this._nativeWindowHandleCache.has(windowId)) {
            this._nativeWindowHandleCache.set(windowId, this.nativeHostService.getNativeWindowHandle(windowId));
        }
        return this._nativeWindowHandleCache.get(windowId);
    }
    async showToast(options, token) {
        const id = generateUuid();
        const listener = token.onCancellationRequested(() => this.nativeHostService.clearToast(id));
        try {
            // Try native OS notifications first
            const nativeToast = await this.nativeHostService.showToast({ ...options, id });
            if (nativeToast.supported) {
                return nativeToast;
            }
            // Then fallback to browser notifications
            return await showBrowserToast({
                onDidCreateToast: (toast) => this.activeBrowserToasts.add(toast),
                onDidDisposeToast: (toast) => this.activeBrowserToasts.deleteAndDispose(toast)
            }, options, token);
        }
        finally {
            listener.dispose();
        }
    }
    async clearToasts() {
        await this.nativeHostService.clearToasts();
        this.activeBrowserToasts.clearAndDisposeAll();
    }
};
__decorate([
    memoize
], WorkbenchHostService.prototype, "onDidChangeActiveWindow", null);
WorkbenchHostService = __decorate([
    __param(0, INativeHostService),
    __param(1, ILabelService),
    __param(2, IWorkbenchEnvironmentService)
], WorkbenchHostService);
registerSingleton(IHostService, WorkbenchHostService, 1 /* InstantiationType.Delayed */);
registerSingleton(INativeHostService, WorkbenchNativeHostService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlSG9zdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9lbGVjdHJvbi1icm93c2VyL25hdGl2ZUhvc3RTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFlBQVksRUFBK0IsTUFBTSxvQkFBb0IsQ0FBQztBQUMvRSxPQUFPLEVBQWEsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM3RixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGFBQWEsRUFBYSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBdUMsY0FBYyxFQUFFLGlCQUFpQixFQUEwRixNQUFNLDhDQUE4QyxDQUFDO0FBQzlOLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDOUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDNUYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGlCQUFpQixFQUFFLFdBQVcsRUFBRSxlQUFlLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDNUosT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFB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