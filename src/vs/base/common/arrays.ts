/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Returns the last element of an array.
 * @param array The array.
 * @param n Which element from the end (default ist zero).
 */
export function tail<T>(array: T[], n: number = 0): T {
	return array[array.length - (1 + n)];
}

/**
 * Iterates the provided array and allows to remove
 * element while iterating.
 */
export function forEach<T>(array: T[], callback: (element: T, remove: Function) => void): void {
	for (var i = 0, len = array.length; i < len; i++) {
		callback(array[i], function() {
			array.splice(i, 1);
			i--; len--;
		});
	}
}

export function equals<T>(one: T[], other: T[], itemEquals: (a: T, b: T) => boolean): boolean {
	if (one.length !== other.length) {
		return false;
	}

	for (var i = 0, len = one.length; i < len; i++) {
		if (!itemEquals(one[i], other[i])) {
			return false;
		}
	}

	return true;
}

/**
 * Returns a new array of the given length which is filled
 * with the given element.
 *
 * @param length The length of the array.
 * @param element The element that the array is filled with.
 */
export function fill<T>(length: number, element: T = null): T[] {
	var result = new Array<T>(length);
	while (length-- > 0) {
		result.push(element);
	}
	return result;
}

export function binarySearch(array: any[], key: any, comparator: (op1: any, op2: any) => number): number {
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
 * Returns the least x for which p(x) is true or array.length if no element fullfills the given function
 */
export function findFirst<T>(array: T[], p: (x: T) => boolean): number {
	var low = 0, high = array.length;
	if (high === 0) {
		return 0; // no children
	}
	while (low < high) {
		var mid = Math.floor((low + high) / 2);
		if (p(array[mid])) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	return low;
}

export function merge<T>(arrays: T[][], hashFn?: (element: T) => string): T[] {
	var result = new Array<T>();
	if (!hashFn) {
		for (var i = 0, len = arrays.length; i < len; i++) {
			result.push.apply(result, arrays[i]);
		}
	} else {
		var map: { [k: string]: boolean } = {};
		for (var i = 0; i < arrays.length; i++) {
			for (var j = 0; j < arrays[i].length; j++) {
				var element = arrays[i][j],
					hash = hashFn(element);

				if (!map.hasOwnProperty(hash)) {
					map[hash] = true;
					result.push(element);
				}
			}
		}
	}
	return result;
}

/**
 * Returns a new array with all undefined or null values removed. The original array is not modified at all.
 */
export function coalesce<T>(array: T[]): T[] {
	if (!array) {
		return array;
	}

	return array.filter(e => !!e);
}

/**
 * Returns true if the given item is contained in the array
 */
export function contains<T>(array: T[], item: T): boolean {
	return array.indexOf(item) >= 0;
}

/**
 * Swaps the elements in the array for the provided positions.
 */
export function swap(array: any[], pos1: number, pos2: number): void {
	var element1 = array[pos1];
	var element2 = array[pos2];

	array[pos1] = element2;
	array[pos2] = element1;
}

/**
 * Moves the element in the array for the provided positions.
 */
export function move(array: any[], from: number, to: number): void {
	array.splice(to, 0, array.splice(from, 1)[0]);
}

/**
 * @returns false if the provided object is an array
 * 	and not empty.
 */
export function isFalsyOrEmpty(obj: any): boolean {
	return !Array.isArray(obj) || (<Array<any>>obj).length === 0;
}

function tripleEqualityEquals<T>(a: T, b: T): boolean {
	return a === b;
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

	var seen: { [key: string]: boolean; } = {};
	return array.filter((elem) => {
		var key = keyFn(elem);
		if (seen[key]) {
			return false;
		}

		seen[key] = true;

		return true;
	});
}

export function first<T>(array: T[], fn: (item: T) => boolean, notFoundValue: T = null): T {
	for (var i = 0; i < array.length; i++) {
		var element = array[i];

		if (fn(element)) {
			return element;
		}
	}

	return notFoundValue;
}

export function repeat<T>(el: T, count: number): T[] {
	var r: T[] = [];

	for (var i = 0; i < count; i++) {
		r.push(el);
	}

	return r;
}

export function commonPrefixLength<T>(one: T[], other: T[], equals: (a: T, b: T) => boolean = (a, b) => a === b): number {
	var result = 0;

	for (var i = 0, len = Math.min(one.length, other.length); i < len && equals(one[i], other[i]); i++) {
		result++;
	}

	return result;
}
