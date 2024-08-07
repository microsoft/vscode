/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IGPUStatusMainService, OpenGPUStatusWindowOptions } from 'vs/platform/gpu/common/gpuStatusMain';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';

export class GPUStatusMainService implements IGPUStatusMainService {
	declare readonly _serviceBrand: undefined;
	private gpuStatusWindow: BrowserWindow | null = null;
	private gpuStatusParentWindow: BrowserWindow | null = null;

	constructor(
		@IEnvironmentMainService private readonly _environmentMainService: IEnvironmentMainService,
	) { }

	openGPUStatusWindow(options: OpenGPUStatusWindowOptions) {
		if (!this.gpuStatusWindow) {
			this.gpuStatusParentWindow = BrowserWindow.getFocusedWindow();
			if (this.gpuStatusParentWindow) {
				this.gpuStatusWindow = this.createBrowserWindow({ zoomLevel: options.zoomLevel });
				this.gpuStatusWindow.loadURL('chrome://gpu');
				this.gpuStatusWindow.on('close', () => {
					this.gpuStatusWindow = null;
				});
				this.gpuStatusParentWindow.on('close', () => {
					if (this.gpuStatusWindow) {
						this.gpuStatusWindow.close();
						this.gpuStatusWindow = null;
					}
				});
			}
		}
		if (this.gpuStatusWindow) {
			this.focusWindow(this.gpuStatusWindow);
		}
	}

	private focusWindow(window: BrowserWindow) {
		if (window.isMinimized()) {
			window.restore();
		}

		window.focus();
	}

	private createBrowserWindow<T>(options: { zoomLevel: number }): BrowserWindow {
		const window = new BrowserWindow({
			fullscreen: false,
			skipTaskbar: false,
			resizable: true,
			minWidth: 800,
			minHeight: 600,
			webPreferences: {
				v8CacheOptions: this._environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
				enableWebSQL: false,
				spellcheck: false,
				zoomFactor: zoomLevelToZoomFactor(options.zoomLevel),
				sandbox: true
			},
			alwaysOnTop: false,
		});

		window.setMenuBarVisibility(false);

		return window;
	}
}
