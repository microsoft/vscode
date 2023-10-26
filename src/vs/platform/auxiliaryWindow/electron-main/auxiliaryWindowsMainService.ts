/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, WebContents, app } from 'electron';
import { Event } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import { AuxiliaryWindow, IAuxiliaryWindow } from 'vs/platform/auxiliaryWindow/electron-main/auxiliaryWindow';
import { IAuxiliaryWindowsMainService } from 'vs/platform/auxiliaryWindow/electron-main/auxiliaryWindows';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { defaultBrowserWindowOptions, getLastFocused } from 'vs/platform/windows/electron-main/windows';

export class AuxiliaryWindowsMainService implements IAuxiliaryWindowsMainService {

	declare readonly _serviceBrand: undefined;

	private readonly windows = new Map<number, AuxiliaryWindow>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.registerListeners();
	}

	private registerListeners(): void {

		// We have to ensure that an auxiliary window gets to know its
		// parent `BrowserWindow` so that it can apply listeners to it
		// Unfortunately we cannot rely on static `BrowserWindow` methods
		// because we might call the methods too early before the window
		// is created.

		app.on('browser-window-created', (_event, browserWindow) => {
			const auxiliaryWindow = this.getWindowById(browserWindow.id);
			if (auxiliaryWindow) {
				auxiliaryWindow.tryClaimWindow();
			}
		});
	}

	createWindow(): BrowserWindowConstructorOptions {
		return this.instantiationService.invokeFunction(defaultBrowserWindowOptions, undefined, {
			webPreferences: {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-sandbox/preload-slim.js').fsPath
			}
		});
	}

	registerWindow(webContents: WebContents): void {
		const auxiliaryWindow = this.instantiationService.createInstance(AuxiliaryWindow, webContents);
		this.windows.set(auxiliaryWindow.id, auxiliaryWindow);

		Event.once(auxiliaryWindow.onDidClose)(() => this.windows.delete(auxiliaryWindow.id));
	}

	getWindowById(windowId: number): AuxiliaryWindow | undefined {
		return this.windows.get(windowId);
	}

	getFocusedWindow(): IAuxiliaryWindow | undefined {
		const window = BrowserWindow.getFocusedWindow();
		if (window) {
			return this.getWindowById(window.id);
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
