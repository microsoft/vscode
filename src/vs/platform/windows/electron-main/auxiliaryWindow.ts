/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron';
import { FileAccess } from 'vs/base/common/network';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { defaultBrowserWindowOptions } from 'vs/platform/windows/electron-main/windows';

export class AuxiliaryWindow {

	static open(instantiationService: IInstantiationService): BrowserWindowConstructorOptions {
		return instantiationService.invokeFunction(defaultBrowserWindowOptions, undefined, {
			webPreferences: {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-sandbox/preload-slim.js').fsPath
			}
		});
	}

	constructor(
		private readonly contents: WebContents,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {

		this.create();
		this.registerListeners();
	}

	private create(): void {

		// Handle devtools argument
		if (this.environmentMainService.args['open-devtools'] === true) {
			this.contents.openDevTools({ mode: 'bottom' });
		}
	}

	private registerListeners(): void {

		// Support a small set of IPC calls
		this.contents.ipc.on('vscode:focusAuxiliaryWindow', () => {
			this.withWindow(window => window.focus(), true /* restore */);
		});

		this.contents.ipc.on('vscode:moveAuxiliaryWindowTop', () => {
			this.withWindow(window => window.moveTop(), true /* restore */);
		});
	}

	private withWindow(callback: (window: BrowserWindow) => void, restore?: boolean): void {
		const window = BrowserWindow.fromWebContents(this.contents);
		if (window) {
			if (restore) {
				if (window.isMinimized()) {
					window.restore();
				}
			}

			callback(window);
		}
	}
}
