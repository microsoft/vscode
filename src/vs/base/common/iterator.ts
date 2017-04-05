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
	protected start: number;
	protected end: number;
	protected index: number;

	constructor(items: T[], start: number = 0, end: number = items.length) {
		this.items = items;
		this.start = start;
		this.end = end;
		this.index = start - 1;
	}

	public first(): T {
		this.index = this.start;
		return this.current();
	}

	public next(): T {
		this.index = Math.min(this.index + 1, this.end);
		return this.current();
	}

	protected current(): T {
		if (this.index === this.start - 1 || this.index === this.end) {
			return null;
		}

		return this.items[this.index];
	}
}

export class ArrayNavigator<T> extends ArrayIterator<T> implements INavigator<T> {

	constructor(items: T[], start: number = 0, end: number = items.length) {
		super(items, start, end);
	}

	public current(): T {
		return super.current();
	}

	public previous(): T {
		this.index = Math.max(this.index - 1, this.start - 1);
		return this.current();
	}

	public first(): T {
		this.index = this.start;
		return this.current();
	}

	public last(): T {
		this.index = this.end - 1;
		return this.current();
	}

	public parent(): T {
		return null;
	}

}

export class MappedIterator<T, R> implements IIterator<R> {

	constructor(protected iterator: IIterator<T>, protected fn: (item: T) => R) {
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
	next(): T;
}

export class MappedNavigator<T, R> extends MappedIterator<T, R> implements INavigator<R> {

	constructor(protected navigator: INavigator<T>, fn: (item: T) => R) {
		super(navigator, fn);
	}

	current() { return this.fn(this.navigator.current()); }
	previous() { return this.fn(this.navigator.previous()); }
	parent() { return this.fn(this.navigator.parent()); }
	first() { return this.fn(this.navigator.first()); }
	last() { return this.fn(this.navigator.last()); }
	next() { return this.fn(this.navigator.next()); }
}
