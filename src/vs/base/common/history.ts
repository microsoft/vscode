/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArraySet } from 'vs/base/common/set';
import { INavigator, ArrayNavigator } from 'vs/base/common/iterator';

export class HistoryNavigator<T> implements INavigator<T> {

	private _history: ArraySet<T>;
	private _limit: number;
	private _navigator: ArrayNavigator<T>;

	constructor(history: T[] = [], limit: number = 10) {
		this._history = new ArraySet(history);
		this._limit = limit;
		this._onChange();
	}

	public add(t: T) {
		this._history.set(t);
		this._onChange();
	}

	public addIfNotPresent(t: T) {
		if (!this._history.contains(t)) {
			this.add(t);
		}
	}

	public next(): T {
		if (this._navigator.next()) {
			return this._navigator.current();
		}
		this.last();
		return null;
	}

	public previous(): T {
		if (this._navigator.previous()) {
			return this._navigator.current();
		}
		this.first();
		return null;
	}

	public current(): T {
		return this._navigator.current();
	}

	public parent(): T {
		return null;
	}

	public first(): T {
		return this._navigator.first();
	}

	public last(): T {
		return this._navigator.last();
	}

	private _onChange() {
		this._reduceToLimit();
		this._navigator = new ArrayNavigator(this._history.elements);
		this._navigator.last();
	}

	private _reduceToLimit() {
		let data = this._history.elements;
		if (data.length > this._limit) {
			this._history = new ArraySet<T>(data.slice(data.length - this._limit));
		}
	}

}