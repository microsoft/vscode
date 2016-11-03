/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';

export class WatchDog {

	private _timeout: number;
	private _threshold: number;
	private _onAlert = new Emitter<this>();

	private _handle: number;
	private _missed: number;
	private _lastSignal: number;

	constructor(timeout: number, threshold: number) {
		this._timeout = timeout;
		this._threshold = threshold;
	}

	dispose(): void {
		this.stop();
	}

	get onAlert(): Event<this> {
		return this._onAlert.event;
	}

	start(): void {
		this.reset();
		this._handle = setInterval(this._check.bind(this), this._timeout * 1.5);
	}

	stop(): void {
		clearInterval(this._handle);
	}

	reset(): void {
		this._lastSignal = Date.now();
		this._missed = 0;
	}

	private _check(): void {
		if ((Date.now() - this._lastSignal) > this._timeout) {
			this._missed += 1;
			if (this._missed > this._threshold) {
				this._onAlert.fire(this);
				this._missed = 0;
			}
		}
	}
}
