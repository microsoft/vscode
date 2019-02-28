/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerApplicationRestart, NoRestart } from 'windows-register-restart';
import { isWindows } from 'vs/base/common/platform';

const WM_ENDSESSION = 0x0016;

export const IOsRestartService = createDecorator<IOsRestartService>('osRestartService');

export interface IOsRestartService {
	readonly isRegistered: boolean;
	ready(): void;
}

export class OsRestartService extends Disposable implements IOsRestartService {

	private hookedWindow?: ICodeWindow;
	private _isRegistered = false;

	constructor(
		@IWindowsMainService private readonly _windowsMainService: IWindowsMainService,
		@ILifecycleService private readonly _lifecycleMainService: ILifecycleService
	) {
		super();
	}

	get isRegistered(): boolean {
		return this._isRegistered;
	}

	ready(): void {
		if (!isWindows || this._isRegistered) {
			return;
		}

		registerApplicationRestart('', NoRestart.OnCrash | NoRestart.OnHang | NoRestart.OnPatch);
		this._isRegistered = true;

		if (this._windowsMainService.getWindowCount() > 0) {
			this.addWindowHook(this._windowsMainService.getWindows()[0]);
		}

		const windowReady = (window: ICodeWindow) => {
			if (!this.hookedWindow) {
				this.addWindowHook(window);
			}
		};

		const windowClosed = (id: number) => {
			if (this.hookedWindow && this.hookedWindow.id === id) {
				this.removeWindowHook();
			}

			if (this._windowsMainService.getWindowCount() > 0) {
				this.addWindowHook(this._windowsMainService.getWindows()[0]);
			}
		};

		this._register(this._windowsMainService.onWindowReady(windowReady));
		this._register(this._windowsMainService.onWindowClose(windowClosed));
	}

	private addWindowHook(window: ICodeWindow): void {
		if (!this.hookedWindow) {
			window.win.hookWindowMessage(WM_ENDSESSION, () => this.onShutdownImminent());
			this.hookedWindow = window;
		}
	}

	private removeWindowHook(): void {
		if (this.hookedWindow) {
			this.hookedWindow.win.unhookWindowMessage(WM_ENDSESSION);
			this.hookedWindow = undefined;
		}
	}

	private onShutdownImminent(): void {
		this._lifecycleMainService.quit(true);
	}
}