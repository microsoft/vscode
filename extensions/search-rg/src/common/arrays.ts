/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Asynchronous variant of `top()` allowing for splitting up work in batches between which the event loop can run.
 *
 * Returns the top N elements from the array.
 *
 * Faster than sorting the entire array when the array is a lot larger than N.
 *
 * @param array The unsorted array.
 * @param compare A sort function for the elements.
 * @param n The number of elements to return.
 * @param batch The number of elements to examine before yielding to the event loop.
 * @return The first n elemnts from array when sorted with compare.
 */
export function topAsync<T>(array: T[], compare: (a: T, b: T) => number, n: number, batch: number): Promise<T[]> {
	// TODO@roblou cancellation

	if (n === 0) {
		return Promise.resolve([]);
	}
	let canceled = false;
	return new Promise((resolve, reject) => {
		(async () => {
			const o = array.length;
			const result = array.slice(0, n).sort(compare);
			for (let i = n, m = Math.min(n + batch, o); i < o; i = m, m = Math.min(m + batch, o)) {
				if (i > n) {
					await new Promise(resolve => setTimeout(resolve, 0)); // nextTick() would starve I/O.
				}
				if (canceled) {
					throw new Error('canceled');
				}
				topStep(array, compare, result, i, m);
			}
			return result;
		})()
			.then(resolve, reject);
	});
}

function topStep<T>(array: T[], compare: (a: T, b: T) => number, result: T[], i: number, m: number): void {
	for (const n = result.length; i < m; i++) {
		const element = array[i];
		if (compare(element, result[n - 1]) < 0) {
			result.pop();
			const j = findFirstInSorted(result, e => compare(element, e) < 0);
			result.splice(j, 0, element);
		}
	}
}

/**
 * Takes a sorted array and a function p. The array is sorted in such a way that all elements where p(x) is false
 * are located before all elements where p(x) is true.
 * @returns the least x for which p(x) is true or array.length if no element fullfills the given function.
 */
export function findFirstInSorted<T>(array: T[], p: (x: T) => boolean): number {
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
