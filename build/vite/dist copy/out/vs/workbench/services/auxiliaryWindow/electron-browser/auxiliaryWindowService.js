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
var NativeAuxiliaryWindow_1;
import { localize } from '../../../../nls.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { AuxiliaryWindow, AuxiliaryWindowMode, BrowserAuxiliaryWindowService, IAuxiliaryWindowService } from '../browser/auxiliaryWindowService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { mark } from '../../../../base/common/performance.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHostService } from '../../host/browser/host.js';
import { applyZoom } from '../../../../platform/window/electron-browser/window.js';
import { getZoomLevel, isFullscreen, setFullscreen } from '../../../../base/browser/browser.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { assert } from '../../../../base/common/assert.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
let NativeAuxiliaryWindow = NativeAuxiliaryWindow_1 = class NativeAuxiliaryWindow extends AuxiliaryWindow {
    constructor(window, container, stylesHaveLoaded, configurationService, nativeHostService, instantiationService, hostService, environmentService, dialogService, contextMenuService, layoutService) {
        super(window, container, stylesHaveLoaded, configurationService, hostService, environmentService, contextMenuService, layoutService);
        this.nativeHostService = nativeHostService;
        this.instantiationService = instantiationService;
        this.dialogService = dialogService;
        this.skipUnloadConfirmation = false;
        this.maximized = false;
        this.alwaysOnTop = false;
        if (!isMacintosh) {
            // For now, limit this to platforms that have clear maximised
            // transitions (Windows, Linux) via window buttons.
            this.handleMaximizedState();
        }
        this.handleFullScreenState();
        this.handleAlwaysOnTopState();
    }
    handleMaximizedState() {
        (async () => {
            this.maximized = await this.nativeHostService.isMaximized({ targetWindowId: this.window.vscodeWindowId });
        })();
        this._register(this.nativeHostService.onDidMaximizeWindow(windowId => {
            if (windowId === this.window.vscodeWindowId) {
                this.maximized = true;
            }
        }));
        this._register(this.nativeHostService.onDidUnmaximizeWindow(windowId => {
            if (windowId === this.window.vscodeWindowId) {
                this.maximized = false;
            }
        }));
    }
    handleAlwaysOnTopState() {
        (async () => {
            this.alwaysOnTop = await this.nativeHostService.isWindowAlwaysOnTop({ targetWindowId: this.window.vscodeWindowId });
        })();
        this._register(this.nativeHostService.onDidChangeWindowAlwaysOnTop(({ windowId, alwaysOnTop }) => {
            if (windowId === this.window.vscodeWindowId) {
                this.alwaysOnTop = alwaysOnTop;
            }
        }));
    }
    async handleFullScreenState() {
        const fullscreen = await this.nativeHostService.isFullScreen({ targetWindowId: this.window.vscodeWindowId });
        if (fullscreen) {
            setFullscreen(true, this.window);
        }
    }
    async handleVetoBeforeClose(e, veto) {
        this.preventUnload(e);
        await this.dialogService.error(veto, localize('backupErrorDetails', "Try saving or reverting the editors with unsaved changes first and then try again."));
    }
    async confirmBeforeClose(e) {
        if (this.skipUnloadConfirmation) {
            return;
        }
        this.preventUnload(e);
        const confirmed = await this.instantiationService.invokeFunction(accessor => NativeAuxiliaryWindow_1.confirmOnShutdown(accessor, 1 /* ShutdownReason.CLOSE */));
        if (confirmed) {
            this.skipUnloadConfirmation = true;
            this.nativeHostService.closeWindow({ targetWindowId: this.window.vscodeWindowId });
        }
    }
    preventUnload(e) {
        e.preventDefault();
        e.returnValue = true;
    }
    createState() {
        const state = super.createState();
        const fullscreen = isFullscreen(this.window);
        return {
            ...state,
            bounds: state.bounds,
            mode: this.maximized ? AuxiliaryWindowMode.Maximized : fullscreen ? AuxiliaryWindowMode.Fullscreen : AuxiliaryWindowMode.Normal,
            alwaysOnTop: this.alwaysOnTop
        };
    }
};
NativeAuxiliaryWindow = NativeAuxiliaryWindow_1 = __decorate([
    __param(3, IConfigurationService),
    __param(4, INativeHostService),
    __param(5, IInstantiationService),
    __param(6, IHostService),
    __param(7, IWorkbenchEnvironmentService),
    __param(8, IDialogService),
    __param(9, IContextMenuService),
    __param(10, IWorkbenchLayoutService)
], NativeAuxiliaryWindow);
export { NativeAuxiliaryWindow };
let NativeAuxiliaryWindowService = class NativeAuxiliaryWindowService extends BrowserAuxiliaryWindowService {
    constructor(layoutService, configurationService, nativeHostService, dialogService, instantiationService, telemetryService, hostService, environmentService, contextMenuService) {
        super(layoutService, dialogService, configurationService, telemetryService, hostService, environmentService, contextMenuService);
        this.nativeHostService = nativeHostService;
        this.instantiationService = instantiationService;
    }
    async resolveWindowId(auxiliaryWindow) {
        mark('code/auxiliaryWindow/willResolveWindowId');
        const windowId = await auxiliaryWindow.vscode.ipcRenderer.invoke('vscode:registerAuxiliaryWindow', this.nativeHostService.windowId);
        mark('code/auxiliaryWindow/didResolveWindowId');
        assert(typeof windowId === 'number');
        return windowId;
    }
    createContainer(auxiliaryWindow, disposables, options) {
        // Zoom level (either explicitly provided or inherited from main window)
        let windowZoomLevel;
        if (typeof options?.zoomLevel === 'number') {
            windowZoomLevel = options.zoomLevel;
        }
        else {
            windowZoomLevel = getZoomLevel(getActiveWindow());
        }
        applyZoom(windowZoomLevel, auxiliaryWindow);
        return super.createContainer(auxiliaryWindow, disposables);
    }
    createAuxiliaryWindow(targetWindow, container, stylesHaveLoaded) {
        return new NativeAuxiliaryWindow(targetWindow, container, stylesHaveLoaded, this.configurationService, this.nativeHostService, this.instantiationService, this.hostService, this.environmentService, this.dialogService, this.contextMenuService, this.layoutService);
    }
};
NativeAuxiliaryWindowService = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, IConfigurationService),
    __param(2, INativeHostService),
    __param(3, IDialogService),
    __param(4, IInstantiationService),
    __param(5, ITelemetryService),
    __param(6, IHostService),
    __param(7, IWorkbenchEnvironmentService),
    __param(8, IContextMenuService)
], NativeAuxiliaryWindowService);
export { NativeAuxiliaryWindowService };
registerSingleton(IAuxiliaryWindowService, NativeAuxiliaryWindowService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsNkJBQTZCLEVBQStCLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakwsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWhGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUV2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUs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