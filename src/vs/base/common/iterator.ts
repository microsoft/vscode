/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IteratorDefinedResult<T> {
	readonly done: false;
	readonly value: T;
}
export interface IteratorUndefinedResult {
	readonly done: true;
	readonly value: undefined;
}
export const FIN: IteratorUndefinedResult = { done: true, value: undefined };
export type IteratorResult<T> = IteratorDefinedResult<T> | IteratorUndefinedResult;

export interface Iterator<T> {
	next(): IteratorResult<T>;
}

export module Iterator {
	const _empty: Iterator<any> = {
		next() {
			return FIN;
		}
	};

	export function empty<T>(): Iterator<T> {
		return _empty;
	}

	export function single<T>(value: T): Iterator<T> {
		let done = false;

		return {
			next(): IteratorResult<T> {
				if (done) {
					return FIN;
				}

				done = true;
				return { done: false, value };
			}
		};
	}

	export function fromArray<T>(array: T[], index = 0, length = array.length): Iterator<T> {
		return {
			next(): IteratorResult<T> {
				if (index >= length) {
					return FIN;
				}

				return { done: false, value: array[index++] };
			}
		};
	}

	export function from<T>(elements: Iterator<T> | T[] | undefined): Iterator<T> {
		if (!elements) {
			return Iterator.empty();
		} else if (Array.isArray(elements)) {
			return Iterator.fromArray(elements);
		} else {
			return elements;
		}
	}

	export function map<T, R>(iterator: Iterator<T>, fn: (t: T) => R): Iterator<R> {
		return {
			next() {
				const element = iterator.next();
				if (element.done) {
					return FIN;
				} else {
					return { done: false, value: fn(element.value) };
				}
			}
		};
	}

	export function filter<T>(iterator: Iterator<T>, fn: (t: T) => boolean): Iterator<T> {
		return {
			next() {
				while (true) {
					const element = iterator.next();
					if (element.done) {
						return FIN;
					}
					if (fn(element.value)) {
						return { done: false, value: element.value };
					}
				}
			}
		};
	}

	export function forEach<T>(iterator: Iterator<T>, fn: (t: T) => void): void {
		for (let next = iterator.next(); !next.done; next = iterator.next()) {
			fn(next.value);
		}
	}

	export function collect<T>(iterator: Iterator<T>, atMost: number = Number.POSITIVE_INFINITY): T[] {
		const result: T[] = [];

		if (atMost === 0) {
			return result;
		}

		let i = 0;

		for (let next = iterator.next(); !next.done; next = iterator.next()) {
			result.push(next.value);

			if (++i >= atMost) {
				break;
			}
		}

		return result;
	}

	export function concat<T>(...iterators: Iterator<T>[]): Iterator<T> {
		let i = 0;

		return {
			next() {
				if (i >= iterators.length) {
					return FIN;
				}

				const iterator = iterators[i];
				const result = iterator.next();

				if (result.done) {
					i++;
					return this.next();
				}

				return result;
			}
		};
	}
}

export type ISequence<T> = Iterator<T> | T[];

export function getSequenceIterator<T>(arg: Iterator<T> | T[]): Iterator<T> {
	if (Array.isArray(arg)) {
		return Iterator.fromArray(arg);
	} else {
		return arg;
	}
}

export interface INextIterator<T> {
	next(): T | null;
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

	public first(): T | null {
		this.index = this.start;
		return this.current();
	}

	public next(): T | null {
		this.index = Math.min(this.index + 1, this.end);
		return this.current();
	}

	protected current(): T | null {
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

	public current(): T | null {
		return super.current();
	}

	public previous(): T | null {
		this.index = Math.max(this.index - 1, this.start - 1);
		return this.current();
	}

	public first(): T | null {
		this.index = this.start;
		return this.current();
	}

	public last(): T | null {
		this.index = this.end - 1;
		return this.current();
	}

	public parent(): T | null {
		return null;
	}
}

export class MappedIterator<T, R> implements INextIterator<R> {

	constructor(protected iterator: INextIterator<T>, protected fn: (item: T | null) => R) {
		// noop
	}

	next() { return this.fn(this.iterator.next()); }
}

export interface INavigator<T> extends INextIterator<T> {
	current(): T | null;
	previous(): T | null;
	parent(): T | null;
	first(): T | null;
	last(): T | null;
	next(): T | null;
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
