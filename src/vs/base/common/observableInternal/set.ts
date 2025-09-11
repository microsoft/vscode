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

	difference(other: ReadonlySetLike<T>): Set<T> {
		const result = new Set<T>();
		for (const value of this._data) {
			if (!other.has(value)) {
				result.add(value);
			}
		}
		return result;
	}

	intersection(other: ReadonlySetLike<T>): Set<T> {
		const result = new Set<T>();
		for (const value of this._data) {
			if (other.has(value)) {
				result.add(value);
			}
		}
		return result;
	}

	symmetricDifference(other: ReadonlySetLike<T>): Set<T> {
		const result = new Set<T>();
		for (const value of this._data) {
			if (!other.has(value)) {
				result.add(value);
			}
		}
		for (const value of other) {
			if (!this._data.has(value)) {
				result.add(value);
			}
		}
		return result;
	}

	union(other: ReadonlySetLike<T>): Set<T> {
		const result = new Set<T>(this._data);
		for (const value of other) {
			result.add(value);
		}
		return result;
	}

	isDisjointFrom(other: ReadonlySetLike<T>): boolean {
		for (const value of this._data) {
			if (other.has(value)) {
				return false;
			}
		}
		return true;
	}

	isSubsetOf(other: ReadonlySetLike<T>): boolean {
		for (const value of this._data) {
			if (!other.has(value)) {
				return false;
			}
		}
		return true;
	}

	isSupersetOf(other: ReadonlySetLike<T>): boolean {
		for (const value of other) {
			if (!this._data.has(value)) {
				return false;
			}
		}
		return true;
	}

	get [Symbol.toStringTag](): string {
		return 'ObservableSet';
	}
}

interface ReadonlySetLike<T> {
	has(value: T): boolean;
	[Symbol.iterator](): Iterator<T>;
}
