/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { hasNativeTitlebar, TitlebarStyle } from '../../window/common/window.js';
import { IBaseWindow, WindowMode } from '../../window/electron-main/window.js';
import { BaseWindow } from '../../windows/electron-main/windowImpl.js';

export interface IAuxiliaryWindow extends IBaseWindow {
	readonly parentId: number;
}

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	readonly id = this.webContents.id;
	parentId = -1;

	override get win() {
		if (!super.win) {
			this.tryClaimWindow();
		}

		return super.win;
	}

	private stateApplied = false;

	constructor(
		private readonly webContents: WebContents,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStateService stateService: IStateService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
		super(configurationService, stateService, environmentMainService, logService);

		// Try to claim window
		this.tryClaimWindow();
	}

	tryClaimWindow(options?: BrowserWindowConstructorOptions): void {
		if (this._store.isDisposed || this.webContents.isDestroyed()) {
			return; // already disposed
		}

		this.doTryClaimWindow(options);

		if (options && !this.stateApplied) {
			this.stateApplied = true;

			this.applyState({
				x: options.x,
				y: options.y,
				width: options.width,
				height: options.height,
				// We currently do not support restoring fullscreen state for auxiliary
				// windows because we do not get hold of the original `features` string
				// that contains that info in `window-fullscreen`. However, we can
				// probe the `options.show` value for whether the window should be maximized
				// or not because we never show maximized windows initially to reduce flicker.
				mode: options.show === false ? WindowMode.Maximized : WindowMode.Normal
			});
		}
	}

	private doTryClaimWindow(options?: BrowserWindowConstructorOptions): void {
		if (this._win) {
			return; // already claimed
		}

		const window = BrowserWindow.fromWebContents(this.webContents);
		if (window) {
			this.logService.trace('[aux window] Claimed browser window instance');

			// Remember
			this.setWin(window, options);

			// Disable Menu
			window.setMenu(null);
			if ((isWindows || isLinux) && hasNativeTitlebar(this.configurationService, options?.titleBarStyle === 'hidden' ? TitlebarStyle.CUSTOM : undefined /* unknown */)) {
				window.setAutoHideMenuBar(true); // Fix for https://github.com/microsoft/vscode/issues/200615
			}

			// Lifecycle
			this.lifecycleMainService.registerAuxWindow(this);
		}
	}

	matches(webContents: WebContents): boolean {
		return this.webContents.id === webContents.id;
	}
}
