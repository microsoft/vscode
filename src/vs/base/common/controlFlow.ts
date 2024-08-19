/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from 'vs/base/common/errors';

/*
 * This file contains helper classes to manage control flow.
*/

/**
 * Prevents code from being re-entrant.
*/
export class ReentrancyBarrier {
	private _isOccupied = false;

	/**
	 * Calls `runner` if the barrier is not occupied.
	 * During the call, the barrier becomes occupied.
	 */
	public runExclusivelyOrSkip(runner: () => void): void {
		if (this._isOccupied) {
			return;
		}
		this._isOccupied = true;
		try {
			runner();
		} finally {
			this._isOccupied = false;
		}
	}

	/**
	 * Calls `runner`. If the barrier is occupied, throws an error.
	 * During the call, the barrier becomes active.
	 */
	public runExclusivelyOrThrow(runner: () => void): void {
		if (this._isOccupied) {
			throw new BugIndicatingError(`ReentrancyBarrier: reentrant call detected!`);
		}
		this._isOccupied = true;
		try {
			runner();
		} finally {
			this._isOccupied = false;
		}
	}

	/**
	 * Indicates if some runner occupies this barrier.
	*/
	public get isOccupied() {
		return this._isOccupied;
	}

	public makeExclusiveOrSkip<TFunction extends Function>(fn: TFunction): TFunction {
		return ((...args: any[]) => {
			if (this._isOccupied) {
				return;
			}
			this._isOccupied = true;
			try {
				return fn(...args);
			} finally {
				this._isOccupied = false;
			}
		}) as any;
	}
}
