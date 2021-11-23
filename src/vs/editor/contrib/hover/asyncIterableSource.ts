/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';

const enum State {
	Initial,
	DoneOK,
	DoneError,
}

export class AsyncIterableSource<T> implements AsyncIterable<T> {

	public static fromArray<T>(items: T[]): AsyncIterable<T> {
		const result = new AsyncIterableSource<T>();
		result.writeMany(items);
		result.end();
		return result;
	}

	public static fromPromise<T>(promise: Promise<T[]>): AsyncIterable<T> {
		const result = new AsyncIterableSource<T>();
		promise.then((items) => {
			result.writeMany(items);
			result.end();
		}, (error) => {
			result.endError(error);
		});
		return result;
	}

	public static async toPromise<T>(iterable: AsyncIterable<T>): Promise<T[]> {
		const result: T[] = [];
		for await (const item of iterable) {
			result.push(item);
		}
		return result;
	}

	public static EMPTY = AsyncIterableSource.fromArray<any>([]);

	private _state: State;
	private _results: T[];
	private _error: Error | null;
	private readonly _onStateChanged: Emitter<void>;

	constructor() {
		this._state = State.Initial;
		this._results = [];
		this._error = null;
		this._onStateChanged = new Emitter<void>();
	}

	[Symbol.asyncIterator](): AsyncIterator<T, undefined, undefined> {
		let i = 0;
		return {
			next: async () => {
				do {
					if (this._state === State.DoneError) {
						throw this._error;
					}
					if (i < this._results.length) {
						return { done: false, value: this._results[i++] };
					}
					if (this._state === State.DoneOK) {
						return { done: true, value: undefined };
					}
					await Event.toPromise(this._onStateChanged.event);
				} while (true);
			}
		};
	}

	/**
	 * The value will be appended at the end.
	 *
	 * **NOTE** If `end()` or `endError()` have already been called, this method has no effect.
	 */
	public writeOne(value: T) {
		if (this._state !== State.Initial) {
			return;
		}
		// it is important to add new values at the end,
		// as we may have iterators already running on the array
		this._results.push(value);
		this._onStateChanged.fire();
	}

	/**
	 * The values will be appended at the end.
	 *
	 * **NOTE** If `end()` or `endError()` have already been called, this method has no effect.
	 */
	public writeMany(values: T[]) {
		if (this._state !== State.Initial) {
			return;
		}
		// it is important to add new values at the end,
		// as we may have iterators already running on the array
		this._results = this._results.concat(values);
		this._onStateChanged.fire();
	}

	/**
	 * Calling `end()` will mark the result array as complete.
	 *
	 * **NOTE** `end()` must be called, otherwise all consumers of this iterable will hang indefinitely, similar to a non-resolved promise.
	 * **NOTE** If `end()` or `endError()` have already been called, this method has no effect.
	 */
	public end(): void {
		if (this._state !== State.Initial) {
			return;
		}
		this._state = State.DoneOK;
		this._onStateChanged.fire();
	}

	/**
	 * Writing an error will permanently invalidate this iterable.
	 * The current users will receive an error thrown, as will all future users.
	 *
	 * **NOTE** If `end()` or `endError()` have already been called, this method has no effect.
	 */
	public endError(error: Error) {
		if (this._state !== State.Initial) {
			return;
		}
		this._state = State.DoneError;
		this._error = error;
		this._onStateChanged.fire();
	}
}
