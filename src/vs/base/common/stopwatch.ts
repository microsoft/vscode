/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { globals } from 'vs/base/common/platform';

var hasPerformanceNow = (globals.performance && typeof globals.performance.now === 'function');

export class StopWatch {

	private _startTime: number;
	private _stopTime: number;

	public static create(): StopWatch {
		return new StopWatch(hasPerformanceNow ? globals.performance.now() : new Date().getTime());
	}

	constructor(startTime: number) {
		this._startTime = startTime;
		this._stopTime = -1;
	}

	public stop(): void {
		this._stopTime = (hasPerformanceNow ? globals.performance.now() : new Date().getTime());
	}

	public elapsed(): number {
		if (this._stopTime !== -1) {
			return this._stopTime - this._startTime;
		}
		var now = (hasPerformanceNow ? globals.performance.now() : new Date().getTime());
		return now - this._startTime;
	}
}
