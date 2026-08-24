/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class RateLimiter {
	private _lastRun: number;
	private readonly _minimumTimeBetweenRuns: number;

	constructor(public readonly timesPerSecond: number = 5) {
		this._lastRun = 0;
		this._minimumTimeBetweenRuns = 1000 / timesPerSecond;
	}

	public runIfNotLimited(callback: () => void): void {
		const now = Date.now();
		if (now - this._lastRun >= this._minimumTimeBetweenRuns) {
			this._lastRun = now;
			callback();
		}
	}
}
