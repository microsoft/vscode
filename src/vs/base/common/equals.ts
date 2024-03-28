/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';

export type EqualityComparer<T> = (a: T, b: T) => boolean;
export const strictEquals: EqualityComparer<any> = (a, b) => a === b;

/**
 * Checks if the items of two arrays are equal.
 * By default, strict equality is used to compare elements, but a custom equality comparer can be provided.
 */
export function itemsEquals<T>(itemEquals: EqualityComparer<T> = strictEquals): EqualityComparer<readonly T[]> {
	return (a, b) => arrays.equals(a, b, itemEquals);
}

/**
 * Two items are considered equal, if their stringified representations are equal.
*/
export function jsonStringifyEquals<T>(): EqualityComparer<T> {
	return (a, b) => JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Uses `item.equals(other)` to determine equality.
 */
export function itemEquals<T extends { equals(other: T): boolean }>(): EqualityComparer<T> {
	return (a, b) => a.equals(b);
}

export function equalsIfDefined<T>(v1: T | undefined, v2: T | undefined, equals: EqualityComparer<T>): boolean {
	if (!v1 || !v2) {
		return v1 === v2;
	}
	return equals(v1, v2);
}
