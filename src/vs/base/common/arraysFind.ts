/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Finds the last item where predicate is true using binary search.
 * `predicate` must be monotonous, i.e. `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
 *
 * @returns `undefined` if no item matches, otherwise the last item that matches the predicate.
 */
export function findLastMonotonous<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
	const idx = findLastIdxMonotonous(arr, predicate);
	return idx === -1 ? undefined : arr[idx];
}

/**
 * Finds the last item where predicate is true using binary search.
 * `predicate` must be monotonous, i.e. `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
 *
 * @returns `startIdx - 1` if predicate is false for all items, otherwise the index of the last item that matches the predicate.
 */
export function findLastIdxMonotonous<T>(arr: T[], predicate: (item: T) => boolean, startIdx = 0, endIdxEx = arr.length): number {
	let i = startIdx;
	let j = endIdxEx;
	while (i < j) {
		const k = Math.floor((i + j) / 2);
		if (predicate(arr[k])) {
			i = k + 1;
		} else {
			j = k;
		}
	}
	return i - 1;
}


/**
 * Finds the first item where predicate is true using binary search.
 * `predicate` must be monotonous, i.e. `arr.map(predicate)` must be like `[false, ..., false, true, ..., true]`!
 *
 * @returns `undefined` if no item matches, otherwise the first item that matches the predicate.
 */
export function findFirstMonotonous<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
	const idx = findFirstIdxMonotonousOrArrLen(arr, predicate);
	return idx === arr.length ? undefined : arr[idx];
}

/**
 * Finds the first item where predicate is true using binary search.
 * `predicate` must be monotonous, i.e. `arr.map(predicate)` must be like `[false, ..., false, true, ..., true]`!
 *
 * @returns `endIdxEx` if predicate is false for all items, otherwise the index of the first item that matches the predicate.
 */
export function findFirstIdxMonotonousOrArrLen<T>(arr: T[], predicate: (item: T) => boolean, startIdx = 0, endIdxEx = arr.length): number {
	let i = startIdx;
	let j = endIdxEx;
	while (i < j) {
		const k = Math.floor((i + j) / 2);
		if (predicate(arr[k])) {
			j = k;
		} else {
			i = k + 1;
		}
	}
	return i;
}

export function findFirstIdxMonotonous<T>(arr: T[], predicate: (item: T) => boolean, startIdx = 0, endIdxEx = arr.length): number {
	const idx = findFirstIdxMonotonousOrArrLen(arr, predicate, startIdx, endIdxEx);
	return idx === arr.length ? -1 : idx;
}

/**
 * Use this when
 * * You have a sorted array
 * * You query this array with a monotonous predicate to find the last item that has a certain property.
 * * You query this array multiple times with monotonous predicates that get weaker and weaker.
 */
export class MonotonousArray<T> {
	public static assertInvariants = false;

	private _findLastMonotonousLastIdx = 0;
	private _lastPredicate: ((item: T) => boolean) | undefined;

	constructor(private readonly _items: T[]) {
	}

	/**
	 * The predicate must be monotonous, i.e. `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
	 * For subsequent calls, current predicate must be weaker than (or equal to) the previous predicate, i.e. more entries must be `true`.
	 */
	findLastMonotonous(predicate: (item: T) => boolean): T | undefined {
		if (MonotonousArray.assertInvariants) {
			if (this._lastPredicate) {
				for (const item of this._items) {
					if (this._lastPredicate(item) && !predicate(item)) {
						throw new Error('MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.');
					}
				}
			}
			this._lastPredicate = predicate;
		}

		const idx = findLastIdxMonotonous(this._items, predicate, this._findLastMonotonousLastIdx);
		this._findLastMonotonousLastIdx = idx + 1;
		return idx === -1 ? undefined : this._items[idx];
	}
}
