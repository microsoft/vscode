/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';

export class ThrottledEmitter<T> extends Emitter<T> {
	private readonly _throttleThreshold: number;
	private readonly _throttleInterval: number;
	private _throttleEventTimeout?: Timeout;
	private _throttleHistory: number[] = [];
	private _lastEvent?: T;

	constructor(throttleThreshold: number, throttleInterval: number) {
		super();
		this._throttleThreshold = throttleThreshold;
		this._throttleInterval = throttleInterval;
	}

	override dispose() {
		if (this._throttleEventTimeout) {
			clearTimeout(this._throttleEventTimeout);
			this._throttleEventTimeout = undefined;
		}

		super.dispose();
	}

	public override fire(event: T) {
		const now = Date.now();
		const cutoff = now - this._throttleInterval;
		this._throttleHistory = this._throttleHistory.filter(time => time >= cutoff);
		this._throttleHistory.push(now);

		if (this._throttleEventTimeout) {
			this._lastEvent = event;
			return;
		}

		if (this._throttleHistory.length < this._throttleThreshold) {
			super.fire(event);
			return;
		}

		this._lastEvent = event;
		this._throttleEventTimeout = setTimeout(() => {
			this._throttleEventTimeout = undefined;
			super.fire(this._lastEvent!);
		}, this._throttleInterval);
	}
}
