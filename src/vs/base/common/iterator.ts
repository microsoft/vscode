/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace Iterable {

	const _empty: Iterable<any> = Object.freeze([]);
	export function empty<T>(): Iterable<T> {
		return _empty;
	}

	export function from<T>(iterable: Iterable<T> | undefined | null): Iterable<T> {
		return iterable || _empty;
	}

	export function first<T>(iterable: Iterable<T>): T | undefined {
		return iterable[Symbol.iterator]().next().value;
	}

	export function some<T>(iterable: Iterable<T>, predicate: (t: T) => boolean): boolean {
		for (const element of iterable) {
			if (predicate(element)) {
				return true;
			}
		}
		return false;
	}

	export function* filter<T>(iterable: Iterable<T>, predicate: (t: T) => boolean): Iterable<T> {
		for (const element of iterable) {
			if (predicate(element)) {
				yield element;
			}
		}
	}

	export function* map<T, R>(iterable: Iterable<T>, fn: (t: T) => R): Iterable<R> {
		for (const element of iterable) {
			yield fn(element);
		}
	}

	export function* concat<T>(...iterables: Iterable<T>[]): Iterable<T> {
		for (const iterable of iterables) {
			for (const element of iterable) {
				yield element;
			}
		}
	}

	/**
	 * Consumes `atMost` elements from iterable and returns the consumed elements,
	 * and an iterable for the rest of the elements.
	 */
	export function consume<T>(iterable: Iterable<T>, atMost: number = Number.POSITIVE_INFINITY): [T[], Iterable<T>] {
		const consumed: T[] = [];

		if (atMost === 0) {
			return [consumed, iterable];
		}

		const iterator = iterable[Symbol.iterator]();

		for (let i = 0; i < atMost; i++) {
			const next = iterator.next();

			if (next.done) {
				return [consumed, Iterable.empty()];
			}

			consumed.push(next.value);
		}

		return [consumed, { [Symbol.iterator]() { return iterator; } }];
	}
}

export interface INextIterator<T> {
	next(): T | null;
}

export class ArrayIterator<T> implements INextIterator<T> {

	private readonly items: readonly T[];
	protected start: number;
	protected end: number;
	protected index: number;

	constructor(items: readonly T[], start: number = 0, end: number = items.length, index = start - 1) {
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

	constructor(items: readonly T[], start: number = 0, end: number = items.length, index = start - 1) {
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

	constructor(protected navigator: INavigator<T>, fn: (item: T | null) => R) {
		super(navigator, fn);
	}

	current() { return this.fn(this.navigator.current()); }
	previous() { return this.fn(this.navigator.previous()); }
	parent() { return this.fn(this.navigator.parent()); }
	first() { return this.fn(this.navigator.first()); }
	last() { return this.fn(this.navigator.last()); }
	next() { return this.fn(this.navigator.next()); }
}
