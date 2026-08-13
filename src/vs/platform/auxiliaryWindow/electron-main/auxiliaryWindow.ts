/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { hasNativeTitlebar, TitlebarStyle } from '../../window/common/window.js';
import { IBaseWindow, WindowMode } from '../../window/electron-main/window.js';
import { BaseWindow } from '../../windows/electron-main/windowImpl.js';
import { IAuxiliaryBrowserWindowOptions } from './auxiliaryWindows.js';
import { shouldApplyAuxiliaryWindowState } from './auxiliaryWindowFeatures.js';

export interface IAuxiliaryWindow extends IBaseWindow {
	readonly parentId: number;
}

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	readonly id: number;
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
		private readonly windowOptions: IAuxiliaryBrowserWindowOptions | undefined,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStateService stateService: IStateService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
		super(configurationService, stateService, environmentMainService, logService);

		this.id = this.webContents.id;

		// Try to claim window
		this.tryClaimWindow();
	}

	tryClaimWindow(options?: IAuxiliaryBrowserWindowOptions | BrowserWindowConstructorOptions): void {
		if (this._store.isDisposed || this.webContents.isDestroyed()) {
			return; // already disposed
		}

		const effectiveOptions = (options as IAuxiliaryBrowserWindowOptions | undefined) ?? this.windowOptions;

		this.doTryClaimWindow(effectiveOptions);

		if (this._win && effectiveOptions && shouldApplyAuxiliaryWindowState(true, true, this.stateApplied)) {
			this.stateApplied = true;

			const mode = effectiveOptions.vscodeWindowState?.mode ?? WindowMode.Normal;
			this.applyState({
				x: effectiveOptions.x,
				y: effectiveOptions.y,
				width: effectiveOptions.width,
				height: effectiveOptions.height,
				mode
			}, undefined, effectiveOptions.vscodeShowHidden ? 'hidden' : effectiveOptions.vscodeShowInactive ? 'inactive' : 'active');

			if (mode === WindowMode.Normal && effectiveOptions.vscodeShowInactive) {
				this._win?.showInactive();
			}

		}
	}

	private doTryClaimWindow(options?: IAuxiliaryBrowserWindowOptions): void {
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

			// Allow frameless windows to size down to their content
			if (options?.frame === false) {
				window.setMinimumSize(1, 1);

				// Hide macOS traffic light buttons
				if (isMacintosh) {
					window.setWindowButtonVisibility(false);
				}
			}

			// Disable resizing for non-resizable windows
			if (options?.resizable === false) {
				window.setResizable(false);
			}

			if (options?.vscodeParentless) {
				window.setParentWindow(null);
			}
			if (options?.focusable === false) {
				window.setFocusable(false);
			}
			if ((isMacintosh || isLinux) && options?.vscodeVisibleOnAllWorkspaces) {
				window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: options.vscodeVisibleOnFullScreen });
			}
			if (options?.vscodeAlwaysOnTopLevel) {
				window.setAlwaysOnTop(true, options.vscodeAlwaysOnTopLevel);
			}
		}
	}

	matches(webContents: WebContents): boolean {
		return this.webContents.id === webContents.id;
	}
}
