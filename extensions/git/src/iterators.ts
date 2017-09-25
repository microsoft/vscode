/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

function* filter<T>(it: IterableIterator<T>, condition: (t: T, i: number) => boolean): IterableIterator<T> {
	let i = 0;
	for (let t of it) {
		if (condition(t, i++)) {
			yield t;
		}
	}
}

function* map<T, R>(it: IterableIterator<T>, fn: (t: T, i: number) => R): IterableIterator<R> {
	let i = 0;
	for (let t of it) {
		yield fn(t, i++);
	}
}

export interface FunctionalIterator<T> extends Iterable<T> {
	filter(condition: (t: T, i: number) => boolean): FunctionalIterator<T>;
	map<R>(fn: (t: T, i: number) => R): FunctionalIterator<R>;
	toArray(): T[];
}

class FunctionalIteratorImpl<T> implements FunctionalIterator<T> {

	constructor(private iterator: IterableIterator<T>) { }

	filter(condition: (t: T, i: number) => boolean): FunctionalIterator<T> {
		return new FunctionalIteratorImpl(filter(this.iterator, condition));
	}

	map<R>(fn: (t: T, i: number) => R): FunctionalIterator<R> {
		return new FunctionalIteratorImpl(map<T, R>(this.iterator, fn));
	}

	toArray(): T[] {
		return Array.from(this.iterator);
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this.iterator;
	}
}

export function iterate<T>(obj: T[] | IterableIterator<T>): FunctionalIterator<T> {
	if (Array.isArray(obj)) {
		return new FunctionalIteratorImpl(obj[Symbol.iterator]());
	}

	return new FunctionalIteratorImpl(obj);
}