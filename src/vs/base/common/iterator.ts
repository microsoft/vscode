/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IIteratorResult<T> {
	readonly done: boolean;
	readonly value: T | undefined;
}

export interface IIterator<T> {
	next(): IIteratorResult<T>;
}

export function iter<T>(array: T[]): IIterator<T> {
	let index = 0;

	return {
		next(): IIteratorResult<T> {
			if (index === array.length) {
				return { done: true, value: undefined };
			}

			return { done: false, value: array[index++] };
		}
	};
}

export function map<T, R>(iterator: IIterator<T>, fn: (t: T) => R): IIterator<R> {
	return {
		next() {
			const { done, value } = iterator.next();
			return { done, value: done ? undefined : fn(value) };
		}
	};
}

export function forEach<T>(iterator: IIterator<T>, fn: (t: T) => void): void {
	for (let next = iterator.next(); !next.done; next = iterator.next()) {
		fn(next.value);
	}
}

export function collect<T>(iterator: IIterator<T>): T[] {
	const result: T[] = [];
	forEach(iterator, value => result.push(value));
	return result;
}

export interface INextIterator<T> {
	next(): T;
}

export class ArrayIterator<T> implements INextIterator<T> {

	private items: T[];
	protected start: number;
	protected end: number;
	protected index: number;

	constructor(items: T[], start: number = 0, end: number = items.length, index = start - 1) {
		this.items = items;
		this.start = start;
		this.end = end;
		this.index = index;
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

	constructor(items: T[], start: number = 0, end: number = items.length, index = start - 1) {
		super(items, start, end, index);
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

export class MappedIterator<T, R> implements INextIterator<R> {

	constructor(protected iterator: INextIterator<T>, protected fn: (item: T) => R) {
		// noop
	}

	next() { return this.fn(this.iterator.next()); }
}

export interface INavigator<T> extends INextIterator<T> {
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
