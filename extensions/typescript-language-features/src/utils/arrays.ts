/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const empty = Object.freeze([]);

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

export function coalesce<T>(array: ReadonlyArray<T | undefined>): T[] {
	return array.filter((e): e is T => !!e);
}
