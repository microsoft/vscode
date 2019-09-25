/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IWindowsService } from 'vs/platform/windows/common/windows';

export class ActiveWindowManager extends Disposable {

	private readonly disposables = this._register(new DisposableStore());
	private firstActiveWindowIdPromise: CancelablePromise<number | undefined> | undefined;

	private activeWindowId: number | undefined;
	private _activeWindowId: number | undefined;

	constructor(@IWindowsService windowsService: IWindowsService) {
		super();

		// remember last active window id
		Event.latch(Event.any(windowsService.onWindowOpen, windowsService.onWindowFocus))(id => this._activeWindowId = id, null, this.disposables);

		const onActiveWindowChange = Event.latch(Event.any(windowsService.onWindowOpen, windowsService.onWindowFocus));
		onActiveWindowChange(this.setActiveWindow, this, this.disposables);

		this.firstActiveWindowIdPromise = createCancelablePromise(_ => this.getActiveWindowId());
		this.firstActiveWindowIdPromise
			.then(id => this.activeWindowId = typeof this.activeWindowId === 'number' ? this.activeWindowId : id)
			.finally(this.firstActiveWindowIdPromise = undefined);
	}

	private setActiveWindow(windowId: number | undefined) {
		if (this.firstActiveWindowIdPromise) {
			this.firstActiveWindowIdPromise.cancel();
			this.firstActiveWindowIdPromise = undefined;
		}

		this.activeWindowId = windowId;
	}

	async getActiveClientId(): Promise<string | undefined> {
		const id = this.firstActiveWindowIdPromise ? (await this.firstActiveWindowIdPromise) : this.activeWindowId;

		return `window:${id}`;
	}

	private async getActiveWindowId(): Promise<number | undefined> {
		return this._activeWindowId;
	}
}
