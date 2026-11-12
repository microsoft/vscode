/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';

/**
 * Takes the screenshots of a browser view one at a time, and keeps a full-page screenshot from being cut short. Such a
 * screenshot temporarily enlarges the page beyond its view. Showing, hiding or moving the view meanwhile, or taking
 * another screenshot, ends that early, and the screenshot then repeats the visible area instead of showing the rest of
 * the page. So while a full-page screenshot is taken, changes to the view wait as well, and are applied in order once
 * it is done.
 */
export class BrowserViewCaptureGate extends Disposable {

	/**
	 * How long a screenshot keeps the next one waiting at most, and a full-page screenshot also the changes to the view.
	 * A screenshot that doesn't finish, for example because its page is busy or paused in the debugger, then cannot
	 * keep the view from showing, hiding or moving, or keep other screenshots from being taken.
	 */
	static readonly MAX_WAIT_MS = 5000;

	private _lastCapture: Promise<void> = Promise.resolve();
	private _heldChanges: (() => void)[] | undefined;

	/** Applies a change to the visibility or layout of the view, after the full-page screenshot being taken, if any. */
	applyChange(change: () => void): void {
		if (this._heldChanges) {
			this._heldChanges.push(change);
		} else {
			change();
		}
	}

	/** Takes a screenshot after the screenshots asked for before it. */
	async capture<T>(fullPage: boolean, capture: () => Promise<T>): Promise<T> {
		const previousCapture = this._lastCapture;
		const done = new DeferredPromise<void>();
		this._lastCapture = done.p;
		await previousCapture;

		const heldChanges: (() => void)[] = [];
		if (fullPage) {
			this._heldChanges = heldChanges;
		}
		const finish = () => {
			// The next screenshot is taken only after the held changes below are applied.
			void done.complete();
			if (this._heldChanges === heldChanges) {
				this._heldChanges = undefined;
				if (!this._store.isDisposed) {
					for (const change of heldChanges) {
						change();
					}
				}
			}
		};
		const timeoutHandle = setTimeout(finish, BrowserViewCaptureGate.MAX_WAIT_MS);
		try {
			return await capture();
		} finally {
			clearTimeout(timeoutHandle);
			finish();
		}
	}
}
