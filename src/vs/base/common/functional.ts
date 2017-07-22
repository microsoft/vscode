/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export function not<A>(fn: (a: A) => boolean): (a: A) => boolean;
export function not(fn: Function): Function {
	return (...args) => !fn(...args);
}

export function once<T extends Function>(fn: T): T {
	const _this = this;
	let didCall = false;
	let result: any;

	return function () {
		if (didCall) {
			return result;
		}

		didCall = true;
		result = fn.apply(_this, arguments);

		return result;
	} as any as T;
}