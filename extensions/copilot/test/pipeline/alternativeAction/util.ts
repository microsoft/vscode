/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const DEBUG = true;

export function log(...args: any[]) {
	if (DEBUG) {
		console.log(...args);
	}
}

export function binarySearch<T>(
	array: readonly T[],
	compare: (element: T) => number
): number {
	let left = 0;
	let right = array.length - 1;
	let lastLess = -1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const cmp = compare(array[mid]);

		if (cmp === 0) {
			return mid;
		} else if (cmp < 0) {
			lastLess = mid;
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return lastLess;
}

//#region Either

export type Either<L, R> = Left<L> | Right<R>;

export namespace Either {
	export function left<L>(value: L): Left<L> {
		return new Left(value);
	}

	export function right<R>(value: R): Right<R> {
		return new Right(value);
	}
}

/**
 * To instantiate a Left, use `Either.left(value)`.
 * To instantiate a Right, use `Either.right(value)`.
 */
class Left<L> {
	constructor(readonly value: L) { }

	isLeft(): this is Left<L> {
		return true;
	}

	isRight(): this is Right<never> {
		return false;
	}
}

/**
 * To instantiate a Left, use `Either.left(value)`.
 * To instantiate a Right, use `Either.right(value)`.
 */
class Right<R> {
	constructor(readonly value: R) { }

	isLeft(): this is Left<never> {
		return false;
	}

	isRight(): this is Right<R> {
		return true;
	}
}

//#endregion
