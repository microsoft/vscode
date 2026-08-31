/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../lifecycle.js';
import { IObservable } from '../base.js';
import { DisposableStore, IDisposable, toDisposable } from '../commonFacade/deps.js';
import { observableValue } from '../observables/observableValue.js';
import { autorun } from '../reactions/autorun.js';

/** Measures the total time an observable had the value "true". */
export class TotalTrueTimeObservable extends Disposable {
	private _totalTime = 0;
	private _startTime: number | undefined = undefined;

	constructor(
		private readonly value: IObservable<boolean>,
	) {
		super();
		this._register(autorun(reader => {
			const isTrue = this.value.read(reader);
			if (isTrue) {
				this._startTime = Date.now();
			} else {
				if (this._startTime !== undefined) {
					const delta = Date.now() - this._startTime;
					this._totalTime += delta;
					this._startTime = undefined;
				}
			}
		}));
	}

	/**
	 * Reports the total time the observable has been true in milliseconds.
	 * E.g. `true` for 100ms, then `false` for 50ms, then `true` for 200ms results in 300ms.
	*/
	public totalTimeMs(): number {
		if (this._startTime !== undefined) {
			return this._totalTime + (Date.now() - this._startTime);
		}
		return this._totalTime;
	}

	/**
	 * Runs the callback when the total time the observable has been true increased by the given delta in milliseconds.
	*/
	public fireWhenTimeIncreasedBy(deltaTimeMs: number, callback: () => void): IDisposable {
		const store = new DisposableStore();
		let accumulatedTime = 0;
		let startTime: number | undefined = undefined;

		store.add(autorun(reader => {
			const isTrue = this.value.read(reader);

			if (isTrue) {
				startTime = Date.now();
				const remainingTime = deltaTimeMs - accumulatedTime;

				if (remainingTime <= 0) {
					callback();
					store.dispose();
					return;
				}

				const handle = setTimeout(() => {
					accumulatedTime += (Date.now() - startTime!);
					startTime = undefined;
					callback();
					store.dispose();
				}, remainingTime);

				reader.store.add(toDisposable(() => {
					clearTimeout(handle);
					if (startTime !== undefined) {
						accumulatedTime += (Date.now() - startTime);
						startTime = undefined;
					}
				}));
			}
		}));

		return store;
	}
}

/**
 * Returns an observable that is true when the input observable was true within the last `timeMs` milliseconds.
 */
export function wasTrueRecently(obs: IObservable<boolean>, timeMs: number, store: DisposableStore): IObservable<boolean> {
	const result = observableValue('wasTrueRecently', false);
	let timeout: ReturnType<typeof setTimeout> | undefined;

	store.add(autorun(reader => {
		const value = obs.read(reader);
		if (value) {
			result.set(true, undefined);
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		} else {
			timeout = setTimeout(() => {
				result.set(false, undefined);
				timeout = undefined;
			}, timeMs);
		}
	}));

	store.add(toDisposable(() => {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
	}));

	return result;
}
