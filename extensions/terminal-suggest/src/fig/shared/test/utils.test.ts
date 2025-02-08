/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'node:assert';
import {
	makeArray,
	makeArrayIfExists,
	longestCommonPrefix,
	compareNamedObjectsAlphabetically,
	fieldsAreEqual,
} from '../utils';

function expect<T>(a: T): { toEqual: (b: T) => void } {
	return {
		toEqual: (b: T) => {
			deepStrictEqual(a, b);
		}
	};
}

suite('fig/shared/ fieldsAreEqual', () => {
	test('should return immediately if two values are the same', () => {
		expect(fieldsAreEqual('hello', 'hello', [])).toEqual(true);
		expect(fieldsAreEqual('hello', 'hell', [])).toEqual(false);
		expect(fieldsAreEqual(1, 1, ['valueOf'])).toEqual(true);
		expect(fieldsAreEqual(null, null, [])).toEqual(true);
		expect(fieldsAreEqual(null, undefined, [])).toEqual(false);
		expect(fieldsAreEqual(undefined, undefined, [])).toEqual(true);
		expect(fieldsAreEqual(null, 'hello', [])).toEqual(false);
		expect(fieldsAreEqual(100, null, [])).toEqual(false);
		expect(fieldsAreEqual({}, {}, [])).toEqual(true);
		expect(
			fieldsAreEqual(
				() => { },
				() => { },
				[],
			),
		).toEqual(false);
	});

	test('should return true if fields are equal', () => {
		const fn = () => { };
		expect(
			fieldsAreEqual(
				{
					a: 'hello',
					b: 100,
					c: undefined,
					d: false,
					e: fn,
					f: { fa: true, fb: { fba: true } },
					g: null,
				},
				{
					a: 'hello',
					b: 100,
					c: undefined,
					d: false,
					e: fn,
					f: { fa: true, fb: { fba: true } },
					g: null,
				},
				['a', 'b', 'c', 'd', 'e', 'f', 'g'],
			),
		).toEqual(true);
		expect(fieldsAreEqual({ a: {} }, { a: {} }, ['a'])).toEqual(true);
	});

	test('should return false if any field is not equal or fields are not specified', () => {
		expect(fieldsAreEqual({ a: null }, { a: {} }, ['a'])).toEqual(false);
		expect(fieldsAreEqual({ a: undefined }, { a: 'hello' }, ['a'])).toEqual(
			false,
		);
		expect(fieldsAreEqual({ a: false }, { a: true }, ['a'])).toEqual(false);
		expect(
			fieldsAreEqual(
				{ a: { b: { c: 'hello' } } },
				{ a: { b: { c: 'hell' } } },
				['a'],
			),
		).toEqual(false);
		expect(fieldsAreEqual({ a: 'true' }, { b: 'true' }, [])).toEqual(false);
	});
});

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

suite('fig/shared/ makeArrayIfExists', () => {
	test('works', () => {
		expect(makeArrayIfExists(null)).toEqual(null);
		expect(makeArrayIfExists(undefined)).toEqual(null);
		expect(makeArrayIfExists('a')).toEqual(['a']);
		expect(makeArrayIfExists(['a'])).toEqual(['a']);
	});
});

suite('fig/shared/ longestCommonPrefix', () => {
	test('should return the shared match', () => {
		expect(longestCommonPrefix(['foo', 'foo bar', 'foo hello world'])).toEqual(
			'foo',
		);
	});

	test('should return nothing if not all items starts by the same chars', () => {
		expect(longestCommonPrefix(['foo', 'foo bar', 'hello world'])).toEqual('');
	});
});

suite('fig/shared/ compareNamedObjectsAlphabetically', () => {
	test('should return 1 to sort alphabetically z against b for string', () => {
		ok(compareNamedObjectsAlphabetically('z', 'b') > 0);
	});

	test('should return 1 to sort alphabetically z against b for object with name', () => {
		ok(compareNamedObjectsAlphabetically({ name: 'z' }, { name: 'b' }) > 0);
	});

	test('should return 1 to sort alphabetically c against x for object with name', () => {
		ok(compareNamedObjectsAlphabetically({ name: 'c' }, { name: 'x' }) < 0);
	});

	test('should return 1 to sort alphabetically z against b for object with name array', () => {
		ok(compareNamedObjectsAlphabetically({ name: ['z'] }, { name: ['b'] }) > 0);
	});

	test('should return 1 to sort alphabetically c against x for object with name array', () => {
		ok(compareNamedObjectsAlphabetically({ name: ['c'] }, { name: ['x'] }) < 0);
	});
});
