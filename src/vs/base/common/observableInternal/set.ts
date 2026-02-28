/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ITransaction } from '../observable.js';
import { observableValueOpts } from './observables/observableValueOpts.js';

export class ObservableSet<T> implements Set<T> {

	private readonly _data = new Set<T>();

	private _obs = observableValueOpts({ equalsFn: () => false }, this);

	readonly observable: IObservable<Set<T>> = this._obs;

	get size(): number {
		return this._data.size;
	}

	has(value: T): boolean {
		return this._data.has(value);
	}

	add(value: T, tx?: ITransaction): this {
		const hadValue = this._data.has(value);
		if (!hadValue) {
			this._data.add(value);
			this._obs.set(this, tx);
		}
		return this;
	}

	delete(value: T, tx?: ITransaction): boolean {
		const result = this._data.delete(value);
		if (result) {
			this._obs.set(this, tx);
		}
		return result;
	}

	clear(tx?: ITransaction): void {
		if (this._data.size > 0) {
			this._data.clear();
			this._obs.set(this, tx);
		}
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		this._data.forEach((value, value2, _set) => {
			// eslint-disable-next-line local/code-no-any-casts
			callbackfn.call(thisArg, value, value2, this as any);
		});
	}

	*entries(): IterableIterator<[T, T]> {
		for (const value of this._data) {
			yield [value, value];
		}
	}

	*keys(): IterableIterator<T> {
		yield* this._data.keys();
	}

	*values(): IterableIterator<T> {
		yield* this._data.values();
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this.values();
	}

	get [Symbol.toStringTag](): string {
		return 'ObservableSet';
	}
}
