/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function once<T extends Function>(this: unknown, fn: T): T {
	const _this = this;
	let didCall = false;
	let result: unknown;

	return function () {
		if (didCall) {
			return result;
		}

		didCall = true;
		result = fn.apply(_this, arguments);

		return result;
	} as unknown as T;
}

const defaultMemoizeMap = (...args: unknown[]) => args[0] as object;

/**
 * Returns a memoized version of the function using the mapFn (which by default
 * takes the first argument). The memoization token is stored in a WeakMap
 * and so must be an object.
 */
export function memoizeFnWeak<Args extends unknown[], R>(
	fn: (...args: Args) => R,
	mapFn: (...args: Args) => object = defaultMemoizeMap,
) {
	const memoized = new WeakMap<object, R>();
	return function(this: unknown, ...args: Args): R {
		const memoizeKey = mapFn.apply(this, args);
		if (memoized.has(memoizeKey)) {
			return memoized.get(memoizeKey)!;
		}

		const r = fn.apply(this, args);
		memoized.set(memoizeKey, r);
		return r;
	};
}
