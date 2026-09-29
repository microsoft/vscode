/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IThrottledWorkerOptions, ThrottledWorker } from '../../src/util/vs/base/common/async';

/**
 * A ThrottledWorker that supports pausing and resuming work processing.
 * When paused, work items will still be buffered but not processed until resumed.
 * Work that was in progress when paused will be completed before pausing takes effect.
 */
export class PausableThrottledWorker<T> extends ThrottledWorker<T> {
	private _paused: boolean = false;
	private _pausedWork: T[] = [];

	constructor(options: IThrottledWorkerOptions, handler: (units: T[]) => void) {
		super(options, (units: T[]) => {
			if (this._paused) {
				// If paused, store the work for later
				this._pausedWork.push(...units);
			} else {
				handler(units);
			}
		});
	}

	/**
	 * Whether the worker is currently paused
	 */
	isPaused(): boolean {
		return this._paused;
	}

	/**
	 * Pause processing of work items. Any work items received while paused
	 * will be buffered until resume() is called.
	 */
	pause(): void {
		this._paused = true;
	}

	/**
	 * Resume processing of work items, including any that were buffered
	 * while the worker was paused.
	 */
	resume(): void {
		this._paused = false;

		// Process any work that was buffered while paused
		if (this._pausedWork.length > 0) {
			const work = this._pausedWork;
			this._pausedWork = [];
			this.work(work);
		}
	}

	override dispose(): void {
		this._pausedWork = [];
		super.dispose();
	}
}