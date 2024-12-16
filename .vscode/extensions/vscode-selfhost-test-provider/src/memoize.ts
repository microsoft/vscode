/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const memoizeLast = <A, T>(fn: (args: A) => T): ((args: A) => T) => {
	let last: { arg: A; result: T } | undefined;
	return arg => {
		if (last && last.arg === arg) {
			return last.result;
		}

		const result = fn(arg);
		last = { arg, result };
		return result;
	};
};
