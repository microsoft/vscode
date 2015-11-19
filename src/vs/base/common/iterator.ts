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

	constructor(private iterator: IIterator<T>, private fn: (item:T)=>R) {
		// noop
	}

	public next(): R {
		return this.fn(this.iterator.next());
	}
}

export interface INavigator<T> extends IIterator<T> {
	current(): T;
	previous(): T;
	parent(): T;
	first(): T;
	last(): T;
}
