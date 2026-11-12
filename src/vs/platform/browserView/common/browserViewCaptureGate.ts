/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';

interface IHeldChanges {
	readonly changes: (() => void)[];
	interrupted: boolean;
}

/**
 * Takes the screenshots of a browser view one at a time, and keeps a full-page screenshot from being cut short. Such a
 * screenshot temporarily enlarges the page beyond its view. Showing, hiding or moving the view meanwhile, or taking
 * another screenshot, ends that early, and the screenshot then repeats the visible area instead of showing the rest of
 * the page. So while a full-page screenshot is taken, changes to the view wait as well, and are applied in order once
 * it is done. A change that can't wait, like hiding the view under a menu, is applied right away, after the changes
 * that wait, and the screenshot is then taken again.
 */
export class BrowserViewCaptureGate extends Disposable {

	/**
	 * How long a screenshot keeps the next one waiting at most, and a full-page screenshot also the changes to the view.
	 * A screenshot that doesn't finish, for example because its page is busy or paused in the debugger, then cannot
	 * keep the view from showing or moving, or keep other screenshots from being taken.
	 */
	static readonly MAX_WAIT_MS = 5000;

	private _lastCapture: Promise<void> = Promise.resolve();
	private _held: IHeldChanges | undefined;

	/**
	 * Applies a change to the visibility or layout of the view. While a full-page screenshot is taken, the change waits
	 * until it is done, unless it can't wait: then it is applied right away, after the changes that wait, and the
	 * screenshot is taken again.
	 */
	applyChange(change: () => void, canWait = true): void {
		const held = this._held;
		if (!held) {
			change();
			return;
		}
		held.changes.push(change);
		if (!canWait) {
			held.interrupted = true;
			this._apply(held.changes.splice(0));
		}
	}

	/** Takes a screenshot after the screenshots asked for before it. */
	async capture<T>(fullPage: boolean, capture: () => Promise<T>): Promise<T> {
		const previousCapture = this._lastCapture;
		const done = new DeferredPromise<void>();
		this._lastCapture = done.p;
		await previousCapture;

		const held: IHeldChanges = { changes: [], interrupted: false };
		if (fullPage) {
			this._held = held;
		}
		const finish = () => {
			// The next screenshot is taken only after the held changes below are applied.
			void done.complete();
			if (this._held === held) {
				this._held = undefined;
				this._apply(held.changes.splice(0));
			}
		};
		const timeoutHandle = setTimeout(finish, BrowserViewCaptureGate.MAX_WAIT_MS);
		try {
			const result = await capture();
			// A change that couldn't wait may have cut the screenshot short, so take it again while changes still wait.
			return held.interrupted && this._held === held ? await capture() : result;
		} finally {
			clearTimeout(timeoutHandle);
			finish();
		}
	}

	private _apply(changes: readonly (() => void)[]): void {
		if (!this._store.isDisposed) {
			for (const change of changes) {
				change();
			}
		}
	}
}
