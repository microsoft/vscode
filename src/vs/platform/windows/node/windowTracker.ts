/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';

export class ActiveWindowManager extends Disposable {

	private readonly disposables = this._register(new DisposableStore());
	private firstActiveWindowIdPromise: CancelablePromise<number | undefined> | undefined;

	private activeWindowId: number | undefined;

	constructor({ onDidOpenMainWindow, onDidFocusMainWindow, getActiveWindowId }: {
		readonly onDidOpenMainWindow: Event<number>;
		readonly onDidFocusMainWindow: Event<number>;
		getActiveWindowId(): Promise<number | undefined>;
	}) {
		super();

		// remember last active window id upon events
		const onActiveWindowChange = Event.latch(Event.any(onDidOpenMainWindow, onDidFocusMainWindow));
		onActiveWindowChange(this.setActiveWindow, this, this.disposables);

		// resolve current active window
		this.firstActiveWindowIdPromise = createCancelablePromise(() => getActiveWindowId());
		(async () => {
			try {
				const windowId = await this.firstActiveWindowIdPromise;
				this.activeWindowId = (typeof this.activeWindowId === 'number') ? this.activeWindowId : windowId;
			} catch (error) {
				// ignore
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
