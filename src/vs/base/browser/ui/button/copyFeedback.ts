/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../common/async.js';
import { Disposable } from '../../../common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { status } from '../aria/aria.js';

/**
 * Shares transient success feedback across copy buttons and custom action renderers.
 * Call `show` only after a successful clipboard write.
 */
export class CopyFeedback extends Disposable {

	private _copied = false;
	get copied(): boolean { return this._copied; }

	private readonly reset = this._register(new RunOnceScheduler(() => this.clear(), 1200));

	clear(): void {
		this.reset.cancel();
		if (!this._copied || this._store.isDisposed) {
			return;
		}
		this._copied = false;
		this.render(false);
	}

	constructor(
		private readonly render: (copied: boolean) => void,
		private readonly statusMessage = localize('copyFeedback.status', "Copied to clipboard"),
	) {
		super();
	}

	show(): void {
		if (this._store.isDisposed) {
			return;
		}

		this._copied = true;
		this.render(true);
		this.reset.schedule();
		status(this.statusMessage);
	}
}
