/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IIterator<T> {
	next(): T;
}

export class ArrayIterator<T> implements IIterator<T> {

	private items: T[];
	private start: number;
	private end: number;
	private index: number;

	constructor(items: T[], start: number = 0, end: number = items.length) {
		this.items = items;
		this.start = start;
		this.end = end;
		this.index = start - 1;
	}

	public next(): T {
		this.index = Math.min(this.index + 1, this.end);

		if (this.index === this.end) {
			return null;
		}

		return this.items[this.index];
	}
}

export class MappedIterator<T, R> implements IIterator<R> {

	constructor(protected iterator: IIterator<T>, protected fn: (item:T)=>R) {
		// noop
	}

	next() { return this.fn(this.iterator.next()); }
}

export interface INavigator<T> extends IIterator<T> {
	current(): T;
	previous(): T;
	parent(): T;
	first(): T;
	last(): T;
}

export class MappedNavigator<T, R> extends MappedIterator<T, R> implements INavigator<R> {

	constructor(protected navigator: INavigator<T>, fn: (item:T)=>R) {
		super(navigator, fn);
	}

	current() { return this.fn(this.navigator.current()); }
	previous() { return this.fn(this.navigator.previous()); }
	parent() { return this.fn(this.navigator.parent()); }
	first() { return this.fn(this.navigator.first()); }
	last() { return this.fn(this.navigator.last()); }
}
