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

	focus(options?: { force: boolean }): void;
}

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	readonly id = this.contents.id;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _win: BrowserWindow | null = null;
	get win() {
		if (!this._win) {
			const window = BrowserWindow.fromWebContents(this.contents);
			if (window) {
				this._win = window;
				this.registerWindowListeners(window);
			}
		}

		return this._win;
	}

	protected getWin(): BrowserWindow | null {
		return this.win;
	}

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
	}

	private registerWindowListeners(window: BrowserWindow): void {

		// Window close
		window.on('closed', () => {
			this._onDidClose.fire();

			this.dispose();
		});
	}
}
