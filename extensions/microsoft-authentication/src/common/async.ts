/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, CancellationToken, Disposable } from 'vscode';

export class SequencerByKey<TKey> {

	private promiseMap = new Map<TKey, Promise<unknown>>();

	queue<T>(key: TKey, promiseTask: () => Promise<T>): Promise<T> {
		const runningPromise = this.promiseMap.get(key) ?? Promise.resolve();
		const newPromise = runningPromise
			.catch(() => { })
			.then(promiseTask)
			.finally(() => {
				if (this.promiseMap.get(key) === newPromise) {
					this.promiseMap.delete(key);
				}
			});
		this.promiseMap.set(key, newPromise);
		return newPromise;
	}
}

export class IntervalTimer extends Disposable {

	private _token: any;

	constructor() {
		super(() => this.cancel());
		this._token = -1;
	}

	cancel(): void {
		if (this._token !== -1) {
			clearInterval(this._token);
			this._token = -1;
		}
	}

	cancelAndSet(runner: () => void, interval: number): void {
		this.cancel();
		this._token = setInterval(() => {
			runner();
		}, interval);
	}
}

/**
 * Returns a promise that rejects with an {@CancellationError} as soon as the passed token is cancelled.
 * @see {@link raceCancellation}
 */
export function raceCancellationError<T>(promise: Promise<T>, token: CancellationToken): Promise<T> {
	return new Promise((resolve, reject) => {
		const ref = token.onCancellationRequested(() => {
			ref.dispose();
			reject(new CancellationError());
		});
		promise.then(resolve, reject).finally(() => ref.dispose());
	});
}

export class TimeoutError extends Error {
	constructor() {
		super('Timed out');
	}
}

export function raceTimeoutError<T>(promise: Promise<T>, timeout: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const ref = setTimeout(() => {
			reject(new CancellationError());
		}, timeout);
		promise.then(resolve, reject).finally(() => clearTimeout(ref));
	});
}

export function raceCancellationAndTimeoutError<T>(promise: Promise<T>, token: CancellationToken, timeout: number): Promise<T> {
	return raceCancellationError(raceTimeoutError(promise, timeout), token);
}
