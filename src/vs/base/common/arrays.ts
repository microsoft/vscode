/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Returns the last element of an array.
 * @param array The array.
 * @param n Which element from the end (default is zero).
 */
export function tail<T>(array: T[], n: number = 0): T {
	return array[array.length - (1 + n)];
}

export function equals<T>(one: T[], other: T[], itemEquals: (a: T, b: T) => boolean = (a, b) => a === b): boolean {
	if (one.length !== other.length) {
		return false;
	}

	for (let i = 0, len = one.length; i < len; i++) {
		if (!itemEquals(one[i], other[i])) {
			return false;
		}
	}

	return true;
}

export function binarySearch<T>(array: T[], key: T, comparator: (op1: T, op2: T) => number): number {
	let low = 0,
		high = array.length - 1;

	while (low <= high) {
		let mid = ((low + high) / 2) | 0;
		let comp = comparator(array[mid], key);
		if (comp < 0) {
			low = mid + 1;
		} else if (comp > 0) {
			high = mid - 1;
		} else {
			return mid;
		}
	}
	return -(low + 1);
}

/**
 * Takes a sorted array and a function p. The array is sorted in such a way that all elements where p(x) is false
 * are located before all elements where p(x) is true.
 * @returns the least x for which p(x) is true or array.length if no element fullfills the given function.
 */
export function findFirst<T>(array: T[], p: (x: T) => boolean): number {
	let low = 0, high = array.length;
	if (high === 0) {
		return 0; // no children
	}
	while (low < high) {
		let mid = Math.floor((low + high) / 2);
		if (p(array[mid])) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	return low;
}

/**
 * Takes two *sorted* arrays and computes their delta (removed, added elements).
 * Finishes in `Math.min(before.length, after.length)` steps.
 * @param before
 * @param after
 * @param compare
 */
export function delta<T>(before: T[], after: T[], compare: (a: T, b: T) => number) {

	const removed: T[] = [];
	const added: T[] = [];

	let beforeIdx = 0;
	let afterIdx = 0;

	while (true) {
		if (beforeIdx === before.length) {
			added.push(...after.slice(afterIdx));
			break;
		}
		if (afterIdx === after.length) {
			removed.push(...before.slice(beforeIdx));
			break;
		}

		const beforeElement = before[beforeIdx];
		const afterElement = after[afterIdx];
		const n = compare(beforeElement, afterElement);
		if (n === 0) {
			// equal
			beforeIdx += 1;
			afterIdx += 1;
		} else if (n < 0) {
			// beforeElement is smaller -> before element removed
			removed.push(beforeElement);
			beforeIdx += 1;
		} else if (n > 0) {
			// beforeElement is greater -> after element added
			added.push(afterElement);
			afterIdx += 1;
		}
	}

	return { removed, added };
}

/**
 * Returns the top N elements from the array.
 *
 * Faster than sorting the entire array when the array is a lot larger than N.
 *
 * @param array The unsorted array.
 * @param compare A sort function for the elements.
 * @param n The number of elements to return.
 * @return The first n elemnts from array when sorted with compare.
 */
export function top<T>(array: T[], compare: (a: T, b: T) => number, n: number): T[] {
	if (n === 0) {
		return [];
	}
	const result = array.slice(0, n).sort(compare);
	for (let i = n, m = array.length; i < m; i++) {
		const element = array[i];
		if (compare(element, result[n - 1]) < 0) {
			result.pop();
			const j = findFirst(result, e => compare(element, e) < 0);
			result.splice(j, 0, element);
		}
	}
	return result;
}

/**
 * @returns a new array with all undefined or null values removed. The original array is not modified at all.
 */
export function coalesce<T>(array: T[]): T[] {
	if (!array) {
		return array;
	}

	return array.filter(e => !!e);
}

/**
 * Moves the element in the array for the provided positions.
 */
export function move(array: any[], from: number, to: number): void {
	array.splice(to, 0, array.splice(from, 1)[0]);
}

/**
 * @returns {{false}} if the provided object is an array
 * 	and not empty.
 */
export function isFalsyOrEmpty(obj: any): boolean {
	return !Array.isArray(obj) || (<Array<any>>obj).length === 0;
}

/**
 * Removes duplicates from the given array. The optional keyFn allows to specify
 * how elements are checked for equalness by returning a unique string for each.
 */
export function distinct<T>(array: T[], keyFn?: (t: T) => string): T[] {
	if (!keyFn) {
		return array.filter((element, position) => {
			return array.indexOf(element) === position;
		});
	}

	const seen: { [key: string]: boolean; } = Object.create(null);
	return array.filter((elem) => {
		const key = keyFn(elem);
		if (seen[key]) {
			return false;
		}

		seen[key] = true;

		return true;
	});
}

export function uniqueFilter<T>(keyFn: (t: T) => string): (t: T) => boolean {
	const seen: { [key: string]: boolean; } = Object.create(null);

	return element => {
		const key = keyFn(element);

		if (seen[key]) {
			return false;
		}

		seen[key] = true;
		return true;
	};
}

export function firstIndex<T>(array: T[], fn: (item: T) => boolean): number {
	for (let i = 0; i < array.length; i++) {
		const element = array[i];

		if (fn(element)) {
			return i;
		}
	}

	return -1;
}

export function first<T>(array: T[], fn: (item: T) => boolean, notFoundValue: T = null): T {
	const index = firstIndex(array, fn);
	return index < 0 ? notFoundValue : array[index];
}

export function commonPrefixLength<T>(one: T[], other: T[], equals: (a: T, b: T) => boolean = (a, b) => a === b): number {
	let result = 0;

	for (let i = 0, len = Math.min(one.length, other.length); i < len && equals(one[i], other[i]); i++) {
		result++;
	}

	return result;
}

export function flatten<T>(arr: T[][]): T[] {
	return arr.reduce((r, v) => r.concat(v), []);
}

export function range(to: number, from = 0): number[] {
	const result: number[] = [];

	for (let i = from; i < to; i++) {
		result.push(i);
	}

	return result;
}

export function fill<T>(num: number, valueFn: () => T, arr: T[] = []): T[] {
	for (let i = 0; i < num; i++) {
		arr[i] = valueFn();
	}

	return arr;
}

export function index<T>(array: T[], indexer: (t: T) => string): { [key: string]: T; };
export function index<T, R>(array: T[], indexer: (t: T) => string, merger?: (t: T, r: R) => R): { [key: string]: R; };
export function index<T, R>(array: T[], indexer: (t: T) => string, merger: (t: T, r: R) => R = t => t as any): { [key: string]: R; } {
	return array.reduce((r, t) => {
		const key = indexer(t);
		r[key] = merger(t, r[key]);
		return r;
	}, Object.create(null));
}

/**
 * Inserts an element into an array. Returns a function which, when
 * called, will remove that element from the array.
 */
export function insert<T>(array: T[], element: T): () => void {
	array.push(element);

	return () => {
		const index = array.indexOf(element);
		if (index > -1) {
			array.splice(index, 1);
		}
	};
}
