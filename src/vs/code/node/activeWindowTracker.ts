/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class ActiveWindowManager extends Disposable {

	private readonly disposables = this._register(new DisposableStore());
	private firstActiveWindowIdPromise: CancelablePromise<number | undefined> | undefined;

	private activeWindowId: number | undefined;

	constructor(@IElectronService electronService: IElectronService) {
		super();

		// remember last active window id upon events
		const onActiveWindowChange = Event.latch(Event.any(electronService.onWindowOpen, electronService.onWindowFocus));
		onActiveWindowChange(this.setActiveWindow, this, this.disposables);

		// resolve current active window
		this.firstActiveWindowIdPromise = createCancelablePromise(() => electronService.getActiveWindowId());
		(async () => {
			try {
				const windowId = await this.firstActiveWindowIdPromise;
				this.activeWindowId = (typeof this.activeWindowId === 'number') ? this.activeWindowId : windowId;
			} finally {
				this.firstActiveWindowIdPromise = undefined;
			}
		})();
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
}
