/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Counts the number of elements in an array that satisfy a given predicate.
 */
export function count<T>(array: T[], predicate: (value: T) => boolean): number {
	let count = 0;
	for (const value of array) {
		if (predicate(value)) {
			count++;
		}
	}
	return count;
}

export function findInsertionIndexInSortedArray<T>(array: T[], value: T, isBeforeFunction: (a: T, b: T) => boolean): number {
	let low = 0;
	let high = array.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (isBeforeFunction(array[mid], value)) {
			low = mid + 1;
		}
		else {
			high = mid;
		}
	}
	return low;
}
/**
 * Returns the maximum element in the array according to the given sort callback.
 * @param arr - The array to search for the maximum element.
 * @param compare - The sort callback to use for comparing elements.
 * @returns The maximum element in the array according to the given sort callback.
 */
export function max<T>(arr: T[], compare: (a: T, b: T) => number): T | undefined {
	if (arr.length === 0) {
		return undefined;
	}

	let maxElement = arr[0];

	for (let i = 1; i < arr.length; i++) {
		const currentElement = arr[i];

		if (compare(currentElement, maxElement) > 0) {
			maxElement = currentElement;
		}
	}

	return maxElement;
}

export function filterMap<T, K>(array: T[], map: (t: T) => K | undefined | null): K[] {
	const result: K[] = [];
	for (const element of array) {
		const mapped = map(element);
		if (mapped !== undefined && mapped !== null) {
			result.push(mapped);
		}
	}
	return result;
}

/**
 * Behaves just like `Math.min`, so it will return Infinity for an empty array.
 */
export function min(array: number[]): number {
	if (array.length === 0) {
		return Infinity;
	}

	let min = array[0];
	for (let i = 1; i < array.length; i++) {
		min = Math.min(min, array[i]);
	}
	return min;
}

/**
 * 
 * Last batch may not match batch size.
 */
export function* batchArrayElements<T>(array: T[], batchSize: number): Iterable<T[]> {
	for (let i = 0; i < array.length; i += batchSize) {
		yield array.slice(i, i + batchSize);
	}
}
