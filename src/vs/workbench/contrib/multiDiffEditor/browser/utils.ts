/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, derived, observableValue } from 'vs/base/common/observable';

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
	public getValue() {
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
	private readonly _value = observableValue<PromiseResult<T> | undefined>(this, undefined);

	public readonly promise: Promise<T>;
	public readonly value: IObservable<PromiseResult<T> | undefined> = this._value;

	constructor(promise: Promise<T>) {
		this.promise = promise.then(value => {
			this._value.set(new PromiseResult(value, undefined), undefined);
			return value;
		}, error => {
			this._value.set(new PromiseResult<T>(undefined, error), undefined);
			throw error;
		});
	}
}

export class PromiseResult<T> {
	constructor(
		/**
		 * The value of the resolved promise.
		 * Undefined if the promise rejected.
		 */
		public readonly value: T | undefined,

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
	public getValue(): T {
		if (this.error) {
			throw this.error;
		}
		return this.value!;
	}
}

/**
 * A lazy promise whose state is observable.
 */
export class ObservableLazyStatefulPromise<T> {
	private readonly _lazyValue = new ObservableLazy(() => new ObservablePromise(this._computeValue()));

	/**
	 * Does not enforce evaluation of the promise compute function.
	 * Is undefined if the promise has not been computed yet.
	 */
	public readonly cachedValue = derived(this, reader => this._lazyValue.cachedValue.read(reader)?.value.read(reader));

	constructor(private readonly _computeValue: () => Promise<T>) {
	}

	public getValue(): Promise<T> {
		return this._lazyValue.getValue().promise;
	}
}
