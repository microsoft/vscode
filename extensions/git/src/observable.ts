/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'vscode';

export class ObservableSet<T> implements Set<T> {

	readonly [Symbol.toStringTag]: string = 'ObservableSet';

	private _set: Set<T>;
	private _onDidChange = new EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(values?: readonly T[] | null) {
		this._set = new Set(values);
	}

	get size(): number {
		return this._set.size;
	}

	add(value: T): this {
		this._set.add(value);
		this._onDidChange.fire();

		return this;
	}

	clear(): void {
		if (this._set.size > 0) {
			this._set.clear();
			this._onDidChange.fire();
		}
	}

	delete(value: T): boolean {
		const result = this._set.delete(value);
		if (result) {
			this._onDidChange.fire();
		}

		return result;
	}

	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
		this._set.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
	}

	has(value: T): boolean {
		return this._set.has(value);
	}

	entries(): IterableIterator<[T, T]> {
		return this._set.entries();
	}

	keys(): IterableIterator<T> {
		return this._set.keys();
	}

	values(): IterableIterator<T> {
		return this._set.keys();
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this.keys();
	}
}
