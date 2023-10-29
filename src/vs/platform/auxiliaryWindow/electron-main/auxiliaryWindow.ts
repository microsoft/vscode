/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContents } from 'electron';
import { Emitter, Event } from 'vs/base/common/event';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { BaseWindow } from 'vs/platform/windows/electron-main/windowImpl';

export interface IAuxiliaryWindow {

	readonly onDidClose: Event<void>;

	readonly id: number;
	readonly win: BrowserWindow | null;

	readonly lastFocusTime: number;

	focus(options?: { force: boolean }): void;
}

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	readonly id = this.contents.id;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _win: BrowserWindow | null = null;
	get win() {
		if (!this._win) {
			this.tryClaimWindow();
		}

		return this._win;
	}

	protected getWin(): BrowserWindow | null {
		return this.win;
	}

	private _lastFocusTime = Date.now(); // window is shown on creation so take current time
	get lastFocusTime(): number { return this._lastFocusTime; }

	constructor(
		private readonly contents: WebContents,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();

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
			this._win = window;

			// Disable Menu
			window.setMenu(null);

			// Listeners
			this.registerWindowListeners(window);
		}
	}

	private registerWindowListeners(window: BrowserWindow): void {

		// Window Close
		window.on('closed', () => {
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
