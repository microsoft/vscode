/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayInsert } from 'vs/base/common/arrays';

/**
 * An array that avoids being sparse by always
 * filling up unused indices with a default value.
 */
export class FixedArray<T> {
	private _store: T[] = [];

	constructor(
		private readonly _default: T
	) { }

	public get(index: number): T {
		if (index < this._store.length) {
			return this._store[index];
		}
		return this._default;
	}

	public set(index: number, value: T): void {
		while (index >= this._store.length) {
			this._store[this._store.length] = this._default;
		}
		this._store[index] = value;
	}

	public replace(index: number, oldLength: number, newLength: number): void {
		if (index >= this._store.length) {
			return;
		}

		if (oldLength === 0) {
			this.insert(index, newLength);
			return;
		} else if (newLength === 0) {
			this.delete(index, oldLength);
			return;
		}

		const before = this._store.slice(0, index);
		const after = this._store.slice(index + oldLength);
		const insertArr = arrayFill(newLength, this._default);
		this._store = before.concat(insertArr, after);
	}

	public delete(deleteIndex: number, deleteCount: number): void {
		if (deleteCount === 0 || deleteIndex >= this._store.length) {
			return;
		}
		this._store.splice(deleteIndex, deleteCount);
	}

	public insert(insertIndex: number, insertCount: number): void {
		if (insertCount === 0 || insertIndex >= this._store.length) {
			return;
		}
		const arr: T[] = [];
		for (let i = 0; i < insertCount; i++) {
			arr[i] = this._default;
		}
		this._store = arrayInsert(this._store, insertIndex, arr);
	}
}

function arrayFill<T>(length: number, value: T): T[] {
	const arr: T[] = [];
	for (let i = 0; i < length; i++) {
		arr[i] = value;
	}
	return arr;
}
