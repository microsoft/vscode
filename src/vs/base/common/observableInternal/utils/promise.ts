/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../lifecycle.js';
import { IObservable, ISettableObservable } from '../base.js';
import { autorun } from '../reactions/autorun.js';
import { transaction } from '../transaction.js';
import { derived } from '../observables/derived.js';
import { observableValue } from '../observables/observableValue.js';

export class ObservableLazy<T> {
	private readonly _value = observableValue<T | undefined>(this, undefined);

	/**
	 * The cached value.
	 * Does not force a computation of the value.
	 */
	public get cachedValue(): IObservable<T | undefined> { return this._value; }

	constructor(private readonly _computeValue: () => T) {
	}

	/**
	 * Returns the cached value.
	 * Computes the value if the value has not been cached yet.
	 */
	public getValue(): T {
		let v = this._value.get();
		if (!v) {
			v = this._computeValue();
			this._value.set(v, undefined);
		}
		return v;
	}
}

/**
 * A promise whose state is observable.
 */
export class ObservablePromise<T> {
	public static fromFn<T>(fn: () => Promise<T>): ObservablePromise<T> {
		return new ObservablePromise(fn());
	}

	public static resolved<T>(value: T): ObservablePromise<T> {
		return new ObservablePromise(Promise.resolve(value));
	}

	private readonly _value = observableValue<PromiseResult<T> | undefined>(this, undefined);

	/**
	 * The promise that this object wraps.
	 */
	public readonly promise: Promise<T>;

	/**
	 * The current state of the promise.
	 * Is `undefined` if the promise didn't resolve yet.
	 */
	public readonly promiseResult: IObservable<PromiseResult<T> | undefined> = this._value;

	constructor(promise: Promise<T>) {
		this.promise = promise.then(value => {
			transaction(tx => {
				/** @description onPromiseResolved */
				this._value.set(new PromiseResult(value, undefined), tx);
			});
			return value;
		}, error => {
			transaction(tx => {
				/** @description onPromiseRejected */
				this._value.set(new PromiseResult<T>(undefined, error), tx);
			});
			throw error;
		});
	}

	public readonly resolvedValue = derived(this, reader => {
		const result = this.promiseResult.read(reader);
		if (!result) {
			return undefined;
		}
		return result.getDataOrThrow();
	});
}

export class PromiseResult<T> {
	constructor(
		/**
		 * The value of the resolved promise.
		 * Undefined if the promise rejected.
		 */
		public readonly data: T | undefined,

		/**
		 * The error in case of a rejected promise.
		 * Undefined if the promise resolved.
		 */
		public readonly error: unknown | undefined,
	) {
	}

	/**
	 * Returns the value if the promise resolved, otherwise throws the error.
	 */
	public getDataOrThrow(): T {
		if (this.error) {
			throw this.error;
		}
		return this.data!;
	}
}

/**
 * Tracks a changing {@link ObservablePromise}, exposing the last resolved value
 * and whether a newer promise is still pending.
 */
export class ObservableResolvedPromise<T> {
	private readonly _lastResolved: ISettableObservable<T>;
	public readonly lastResolved: IObservable<T>;

	private readonly _isResolving = observableValue<boolean>(this, false);
	public readonly isResolving: IObservable<boolean> = this._isResolving;

	private _runningPromise: ObservablePromise<T> | undefined;

	constructor(
		source: IObservable<ObservablePromise<T>>,
		initialValue: T,
		store: DisposableStore,
	) {
		this._lastResolved = observableValue<T>(this, initialValue);
		this.lastResolved = this._lastResolved;

		store.add(autorun(reader => {
			const current = source.read(reader);
			this._runningPromise = current;

			const result = current.promiseResult.read(reader);
			if (result) {
				if (current === this._runningPromise) {
					this._isResolving.set(false, undefined);
					this._lastResolved.set(result.getDataOrThrow(), undefined);
				}
			} else {
				this._isResolving.set(true, undefined);
			}
		}));
	}
}

/**
 * A lazy promise whose state is observable.
 */
export class ObservableLazyPromise<T> {
	private readonly _lazyValue = new ObservableLazy(() => new ObservablePromise(this._computePromise()));

	/**
	 * Does not enforce evaluation of the promise compute function.
	 * Is undefined if the promise has not been computed yet.
	 */
	public readonly cachedPromiseResult = derived(this, reader => this._lazyValue.cachedValue.read(reader)?.promiseResult.read(reader));

	constructor(private readonly _computePromise: () => Promise<T>) {
	}

	public getPromise(): Promise<T> {
		return this._lazyValue.getValue().promise;
	}
}
