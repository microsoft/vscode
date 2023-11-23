/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContents } from 'electron';
import { Emitter } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IBaseWindow } from 'vs/platform/window/electron-main/window';
import { BaseWindow } from 'vs/platform/windows/electron-main/windowImpl';

export interface IAuxiliaryWindow extends IBaseWindow {
	readonly parentId: number;
}

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	readonly id = this.contents.id;
	parentId = -1;

	override get win() {
		if (!super.win) {
			this.tryClaimWindow();
		}

		return super.win;
	}

	private _lastFocusTime = Date.now(); // window is shown on creation so take current time
	get lastFocusTime(): number { return this._lastFocusTime; }

	constructor(
		private readonly contents: WebContents,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStateService stateService: IStateService
	) {
		super(configurationService, stateService);

		this.create();
	}

	private create(): void {

		// Handle devtools argument
		if (this.environmentMainService.args['open-devtools'] === true) {
			this.contents.openDevTools({ mode: 'bottom' });
		}

		// Try to claim now
		this.tryClaimWindow();
	}

	tryClaimWindow(): void {
		if (this._win) {
			return; // already claimed
		}

		if (this._store.isDisposed || this.contents.isDestroyed()) {
			return; // already disposed
		}

		const window = BrowserWindow.fromWebContents(this.contents);
		if (window) {
			this.logService.trace('[aux window] Claimed browser window instance');

			// Remember
			this.setWin(window);

			// Disable Menu
			window.setMenu(null);

			// Listeners
			this.registerWindowListeners(window);
		}
	}

	private registerWindowListeners(window: BrowserWindow): void {

		// Window Close
		window.on('closed', () => {
			this.logService.trace('[aux window] Closed window');

			this._onDidClose.fire();

			this.dispose();
		});

		// Window Focus
		window.on('focus', () => {
			this._lastFocusTime = Date.now();
		});
	}

	override dispose(): void {
		super.dispose();

		this._win = null!; // Important to dereference the window object to allow for GC
	}
}
