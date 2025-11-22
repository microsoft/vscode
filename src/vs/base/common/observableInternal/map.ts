/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ITransaction } from '../observable.js';
import { observableValueOpts } from './observables/observableValueOpts.js';


export class ObservableMap<K, V> implements Map<K, V> {
	private readonly _data = new Map<K, V>();

	private readonly _obs = observableValueOpts({ equalsFn: () => false }, this);

	readonly observable: IObservable<Map<K, V>> = this._obs;

	get size(): number {
		return this._data.size;
	}

	has(key: K): boolean {
		return this._data.has(key);
	}

	get(key: K): V | undefined {
		return this._data.get(key);
	}

	set(key: K, value: V, tx?: ITransaction): this {
		const hadKey = this._data.has(key);
		const oldValue = this._data.get(key);
		if (!hadKey || oldValue !== value) {
			this._data.set(key, value);
			this._obs.set(this, tx);
		}
		return this;
	}

	delete(key: K, tx?: ITransaction): boolean {
		const result = this._data.delete(key);
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

	forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
		this._data.forEach((value, key, _map) => {
			callbackfn.call(thisArg, value, key, this);
		});
	}

	*entries(): IterableIterator<[K, V]> {
		yield* this._data.entries();
	}

	*keys(): IterableIterator<K> {
		yield* this._data.keys();
	}

	*values(): IterableIterator<V> {
		yield* this._data.values();
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.entries();
	}

	get [Symbol.toStringTag](): string {
		return 'ObservableMap';
	}
}
