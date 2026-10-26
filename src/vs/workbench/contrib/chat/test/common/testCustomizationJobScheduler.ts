/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleDeadline } from '../../../../../base/common/async.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ICustomizationJobScheduler } from '../../common/agentHostSessionCustomizations.js';

/**
 * A deterministic scheduler: scheduled slices only run when {@link runNext} or
 * {@link flush} is called, and the clock advances by {@link msPerTick} per read.
 */
export class TestCustomizationJobScheduler implements ICustomizationJobScheduler {

	private _time = 0;
	private readonly _pending: ((deadline?: IdleDeadline) => void)[] = [];

	/** When set, slices are given an idle deadline reporting this many ms remaining. */
	timeRemainingMs: number | undefined;

	/** Reported on the deadline, like an idle callback that fired because its timeout expired. */
	didTimeout = false;

	constructor(private readonly _msPerTick = 0) { }

	get pendingCount(): number {
		return this._pending.length;
	}

	now(): number {
		const time = this._time;
		this._time += this._msPerTick;
		return time;
	}

	schedule(callback: (deadline?: IdleDeadline) => void): IDisposable {
		this._pending.push(callback);
		return toDisposable(() => {
			const index = this._pending.indexOf(callback);
			if (index >= 0) {
				this._pending.splice(index, 1);
			}
		});
	}

	/** Runs one scheduled slice. Returns whether there was one. */
	runNext(): boolean {
		const callback = this._pending.shift();
		callback?.(this.timeRemainingMs === undefined ? undefined : { didTimeout: this.didTimeout, timeRemaining: () => this.timeRemainingMs! });
		return !!callback;
	}

	/** Runs slices until no more are scheduled. Returns how many ran. */
	flush(): number {
		let count = 0;
		while (this.runNext()) {
			count++;
		}
		return count;
	}
}
