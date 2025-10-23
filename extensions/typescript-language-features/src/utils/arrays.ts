/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const empty = Object.freeze([]);

/**
 * Compares two arrays for equality using a custom comparison function
 * @param a First array to compare
 * @param b Second array to compare
 * @param itemEquals Custom comparison function for array elements
 * @returns True if arrays are equal, false otherwise
 */
export function equals<T>(
	a: ReadonlyArray<T>,
	b: ReadonlyArray<T>,
	itemEquals: (a: T, b: T) => boolean = (a, b) => a === b
): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}
	return a.every((x, i) => itemEquals(x, b[i]));
}

/**
 * Removes undefined and null values from an array
 * @param array Array to filter
 * @returns New array with only defined values
 */
export function coalesce<T>(array: ReadonlyArray<T | undefined>): T[] {
	return array.filter((e): e is T => !!e);
}
