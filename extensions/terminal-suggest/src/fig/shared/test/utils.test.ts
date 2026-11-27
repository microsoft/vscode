/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'node:assert';
import { makeArray } from '../utils';

function expect<T>(a: T): { toEqual: (b: T) => void } {
	return {
		toEqual: (b: T) => {
			deepStrictEqual(a, b);
		}
	};
}

suite('fig/shared/ makeArray', () => {
	test('should transform an object into an array', () => {
		expect(makeArray(true)).toEqual([true]);
	});

	test('should not transform arrays with one value', () => {
		expect(makeArray([true])).toEqual([true]);
	});

	test('should not transform arrays with multiple values', () => {
		expect(makeArray([true, false])).toEqual([true, false]);
	});
});
