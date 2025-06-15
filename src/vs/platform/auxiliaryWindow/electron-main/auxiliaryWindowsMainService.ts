/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, HandlerDetails, WebContents, app } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { AuxiliaryWindow, IAuxiliaryWindow } from './auxiliaryWindow.js';
import { IAuxiliaryWindowsMainService } from './auxiliaryWindows.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IWindowState, WindowMode, defaultAuxWindowState } from '../../window/electron-main/window.js';
import { IDefaultBrowserWindowOptionsOverrides, WindowStateValidator, defaultBrowserWindowOptions, getLastFocused } from '../../windows/electron-main/windows.js';

export class AuxiliaryWindowsMainService extends Disposable implements IAuxiliaryWindowsMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidMaximizeWindow = this._register(new Emitter<IAuxiliaryWindow>());
	readonly onDidMaximizeWindow = this._onDidMaximizeWindow.event;

	private readonly _onDidUnmaximizeWindow = this._register(new Emitter<IAuxiliaryWindow>());
	readonly onDidUnmaximizeWindow = this._onDidUnmaximizeWindow.event;

	private readonly _onDidChangeFullScreen = this._register(new Emitter<{ window: IAuxiliaryWindow; fullscreen: boolean }>());
	readonly onDidChangeFullScreen = this._onDidChangeFullScreen.event;

	private readonly _onDidChangeAlwaysOnTop = this._register(new Emitter<{ window: IAuxiliaryWindow; alwaysOnTop: boolean }>());
	readonly onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;

	private readonly _onDidTriggerSystemContextMenu = this._register(new Emitter<{ window: IAuxiliaryWindow; x: number; y: number }>());
	readonly onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;

	private readonly windows = new Map<number /* webContents ID */, AuxiliaryWindow>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

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

		validatedIpcMain.handle('vscode:registerAuxiliaryWindow', async (event, mainWindowId: number) => {
			const auxiliaryWindow = this.getWindowByWebContents(event.sender);
			if (auxiliaryWindow) {
				this.logService.trace('[aux window] vscode:registerAuxiliaryWindow: Registering auxiliary window to main window');

				auxiliaryWindow.parentId = mainWindowId;
			}

			return event.sender.id;
		});
	}

	createWindow(details: HandlerDetails): BrowserWindowConstructorOptions {
		const { state, overrides } = this.computeWindowStateAndOverrides(details);
		return this.instantiationService.invokeFunction(defaultBrowserWindowOptions, state, overrides, {
			preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload-aux.js').fsPath
		});
	}

	private computeWindowStateAndOverrides(details: HandlerDetails): { readonly state: IWindowState; readonly overrides: IDefaultBrowserWindowOptionsOverrides } {
		const windowState: IWindowState = {};
		const overrides: IDefaultBrowserWindowOptionsOverrides = {};

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
					windowState.mode = WindowMode.Maximized;
					break;
				case 'window-fullscreen':
					windowState.mode = WindowMode.Fullscreen;
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

	registerWindow(webContents: WebContents): void {
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

	getWindowByWebContents(webContents: WebContents): AuxiliaryWindow | undefined {
		const window = this.windows.get(webContents.id);

		return window?.matches(webContents) ? window : undefined;
	}

	getFocusedWindow(): IAuxiliaryWindow | undefined {
		const window = BrowserWindow.getFocusedWindow();
		if (window) {
			return this.getWindowByWebContents(window.webContents);
		}

		return undefined;
	}

	getLastActiveWindow(): IAuxiliaryWindow | undefined {
		return getLastFocused(Array.from(this.windows.values()));
	}

	getWindows(): readonly IAuxiliaryWindow[] {
		return Array.from(this.windows.values());
	}
}
