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
import { BrowserWindow, app } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { AuxiliaryWindow } from './auxiliaryWindow.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { defaultAuxWindowState } from '../../window/electron-main/window.js';
import { WindowStateValidator, defaultBrowserWindowOptions, getLastFocused } from '../../windows/electron-main/windows.js';
let AuxiliaryWindowsMainService = class AuxiliaryWindowsMainService extends Disposable {
    constructor(instantiationService, logService) {
        super();
        this.instantiationService = instantiationService;
        this.logService = logService;
        this._onDidMaximizeWindow = this._register(new Emitter());
        this.onDidMaximizeWindow = this._onDidMaximizeWindow.event;
        this._onDidUnmaximizeWindow = this._register(new Emitter());
        this.onDidUnmaximizeWindow = this._onDidUnmaximizeWindow.event;
        this._onDidChangeFullScreen = this._register(new Emitter());
        this.onDidChangeFullScreen = this._onDidChangeFullScreen.event;
        this._onDidChangeAlwaysOnTop = this._register(new Emitter());
        this.onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;
        this._onDidTriggerSystemContextMenu = this._register(new Emitter());
        this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
        this.windows = new Map();
        this.registerListeners();
    }
    registerListeners() {
        // We have to ensure that an auxiliary window gets to know its
        // containing `BrowserWindow` so that it can apply listeners to it
        // Unfortunately we cannot rely on static `BrowserWindow` methods
        // because we might call the methods too early before the window
        // is created.
        app.on('browser-window-created', (_event, browserWindow) => {
            // This is an auxiliary window, try to claim it
            const auxiliaryWindow = this.getWindowByWebContents(browserWindow.webContents);
            if (auxiliaryWindow) {
                this.logService.trace('[aux window] app.on("browser-window-created"): Trying to claim auxiliary window');
                auxiliaryWindow.tryClaimWindow();
            }
            // This is a main window, listen to child windows getting created to claim it
            else {
                const disposables = new DisposableStore();
                disposables.add(Event.fromNodeEventEmitter(browserWindow.webContents, 'did-create-window', (browserWindow, details) => ({ browserWindow, details }))(({ browserWindow, details }) => {
                    const auxiliaryWindow = this.getWindowByWebContents(browserWindow.webContents);
                    if (auxiliaryWindow) {
                        this.logService.trace('[aux window] window.on("did-create-window"): Trying to claim auxiliary window');
                        auxiliaryWindow.tryClaimWindow(details.options);
                    }
                }));
                disposables.add(Event.fromNodeEventEmitter(browserWindow, 'closed')(() => disposables.dispose()));
            }
        });
        validatedIpcMain.handle('vscode:registerAuxiliaryWindow', async (event, mainWindowId) => {
            const auxiliaryWindow = this.getWindowByWebContents(event.sender);
            if (auxiliaryWindow) {
                this.logService.trace('[aux window] vscode:registerAuxiliaryWindow: Registering auxiliary window to main window');
                auxiliaryWindow.parentId = mainWindowId;
            }
            return event.sender.id;
        });
    }
    createWindow(details) {
        const { state, overrides } = this.computeWindowStateAndOverrides(details);
        return this.instantiationService.invokeFunction(defaultBrowserWindowOptions, state, overrides, {
            preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload-aux.js').fsPath
        });
    }
    computeWindowStateAndOverrides(details) {
        const windowState = {};
        const overrides = {};
        const features = details.features.split(','); // for example: popup=yes,left=270,top=14.5,width=1024,height=768
        for (const feature of features) {
            const [key, value] = feature.split('=');
            switch (key) {
                case 'width':
                    windowState.width = parseInt(value, 10);
                    break;
                case 'height':
                    windowState.height = parseInt(value, 10);
                    break;
                case 'left':
                    windowState.x = parseInt(value, 10);
                    break;
                case 'top':
                    windowState.y = parseInt(value, 10);
                    break;
                case 'window-maximized':
                    windowState.mode = 0 /* WindowMode.Maximized */;
                    break;
                case 'window-fullscreen':
                    windowState.mode = 3 /* WindowMode.Fullscreen */;
                    break;
                case 'window-disable-fullscreen':
                    overrides.disableFullscreen = true;
                    break;
                case 'window-native-titlebar':
                    overrides.forceNativeTitlebar = true;
                    break;
                case 'window-always-on-top':
                    overrides.alwaysOnTop = true;
                    break;
            }
        }
        const state = WindowStateValidator.validateWindowState(this.logService, windowState) ?? defaultAuxWindowState();
        this.logService.trace('[aux window] using window state', state);
        return { state, overrides };
    }
    registerWindow(webContents) {
        const disposables = new DisposableStore();
        const auxiliaryWindow = this.instantiationService.createInstance(AuxiliaryWindow, webContents);
        this.windows.set(auxiliaryWindow.id, auxiliaryWindow);
        disposables.add(toDisposable(() => this.windows.delete(auxiliaryWindow.id)));
        disposables.add(auxiliaryWindow.onDidMaximize(() => this._onDidMaximizeWindow.fire(auxiliaryWindow)));
        disposables.add(auxiliaryWindow.onDidUnmaximize(() => this._onDidUnmaximizeWindow.fire(auxiliaryWindow)));
        disposables.add(auxiliaryWindow.onDidEnterFullScreen(() => this._onDidChangeFullScreen.fire({ window: auxiliaryWindow, fullscreen: true })));
        disposables.add(auxiliaryWindow.onDidLeaveFullScreen(() => this._onDidChangeFullScreen.fire({ window: auxiliaryWindow, fullscreen: false })));
        disposables.add(auxiliaryWindow.onDidChangeAlwaysOnTop(alwaysOnTop => this._onDidChangeAlwaysOnTop.fire({ window: auxiliaryWindow, alwaysOnTop })));
        disposables.add(auxiliaryWindow.onDidTriggerSystemContextMenu(({ x, y }) => this._onDidTriggerSystemContextMenu.fire({ window: auxiliaryWindow, x, y })));
        Event.once(auxiliaryWindow.onDidClose)(() => disposables.dispose());
    }
    getWindowByWebContents(webContents) {
        const window = this.windows.get(webContents.id);
        return window?.matches(webContents) ? window : undefined;
    }
    getFocusedWindow() {
        const window = BrowserWindow.getFocusedWindow();
        if (window) {
            return this.getWindowByWebContents(window.webContents);
        }
        return undefined;
    }
    getLastActiveWindow() {
        return getLastFocused(Array.from(this.windows.values()));
    }
    getWindows() {
        return Array.from(this.windows.values());
    }
};
AuxiliaryWindowsMainService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILogService)
], AuxiliaryWindowsMainService);
export { AuxiliaryWindowsMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQWdFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLHNCQUFzQixDQUFDO0FBRXpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQTRCLHFCQUFxQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkcsT0FBTyxFQUF5QyxvQkFBb0IsRUFBRSwyQkFBMkIsRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUUzSixJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFxQjFELFlBQ3dCLG9CQUE0RCxFQUN0RSxVQUF3QztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQUhnQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ3JELGVBQVUsR0FBVixVQUFVLENBQWE7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