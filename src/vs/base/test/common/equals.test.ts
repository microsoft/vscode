/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	strictEquals, strictEqualsC, arrayEquals, arrayEqualsC,
	structuralEquals, structuralEqualsC, getStructuralKey,
	jsonStringifyEquals, jsonStringifyEqualsC, thisEqualsC,
	equalsIfDefined, equalsIfDefinedC, equals
} from '../../common/equals.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Equals', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('strictEquals', () => {
		assert.strictEqual(strictEquals(1, 1), true);
		assert.strictEqual(strictEquals(1, 2), false);
		assert.strictEqual(strictEquals('a', 'a'), true);
		assert.strictEqual(strictEquals('a', 'b'), false);
		assert.strictEqual(strictEquals(true, true), true);
		assert.strictEqual(strictEquals(true, false), false);
		assert.strictEqual(strictEquals(null, null), true);
		assert.strictEqual(strictEquals(undefined, undefined), true);
		assert.strictEqual(strictEquals(null, undefined), false);

		const obj = {};
		assert.strictEqual(strictEquals(obj, obj), true);
		assert.strictEqual(strictEquals(obj, {}), false);

		// NaN strict equality behaves this way in JS
		assert.strictEqual(strictEquals(NaN, NaN), false);
	});

	test('strictEqualsC', () => {
		const comparer = strictEqualsC<number>();
		assert.strictEqual(comparer(1, 1), true);
		assert.strictEqual(comparer(1, 2), false);
	});

	test('arrayEquals', () => {
		assert.strictEqual(arrayEquals([], []), true);
		assert.strictEqual(arrayEquals([1, 2, 3], [1, 2, 3]), true);
		assert.strictEqual(arrayEquals([1, 2, 3], [1, 2, 4]), false);
		assert.strictEqual(arrayEquals([1, 2, 3], [1, 2]), false);
		assert.strictEqual(arrayEquals([1, 2], [1, 2, 3]), false);

		const obj1 = {};
		const obj2 = {};
		assert.strictEqual(arrayEquals([obj1, obj2], [obj1, obj2]), true);
		assert.strictEqual(arrayEquals([obj1, obj2], [obj1, {}]), false);

		// With custom comparer
		const ignoreCaseComparer = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
		assert.strictEqual(arrayEquals(['A', 'b'], ['a', 'B'], ignoreCaseComparer), true);
		assert.strictEqual(arrayEquals(['A', 'b'], ['a', 'c'], ignoreCaseComparer), false);
	});

	test('arrayEqualsC', () => {
		const comparer = arrayEqualsC<number>();
		assert.strictEqual(comparer([1, 2], [1, 2]), true);
		assert.strictEqual(comparer([1, 2], [1, 3]), false);

		const ignoreCaseComparer = arrayEqualsC<string>((a, b) => a.toLowerCase() === b.toLowerCase());
		assert.strictEqual(ignoreCaseComparer(['A'], ['a']), true);
	});


	test('structuralEquals', () => {
		assert.strictEqual(structuralEquals(1, 1), true);
		assert.strictEqual(structuralEquals(1, 2), false);
		assert.strictEqual(structuralEquals('a', 'a'), true);
		assert.strictEqual(structuralEquals(null, null), true);
		assert.strictEqual(structuralEquals(undefined, undefined), true);
		assert.strictEqual(structuralEquals(null, undefined), false);

		// Arrays
		assert.strictEqual(structuralEquals([], []), true);
		assert.strictEqual(structuralEquals([1, 2], [1, 2]), true);
		assert.strictEqual(structuralEquals([1, 2], [1, 3]), false);
		assert.strictEqual(structuralEquals([1, [2, 3]], [1, [2, 3]]), true);
		assert.strictEqual(structuralEquals([1, [2, 3]], [1, [2, 4]]), false);
		assert.strictEqual(structuralEquals([1], [1, 2]), false);

		// Objects
		assert.strictEqual(structuralEquals({}, {}), true);
		assert.strictEqual(structuralEquals({ a: 1 }, { a: 1 }), true);
		assert.strictEqual(structuralEquals({ a: 1 }, { a: 2 }), false);
		assert.strictEqual(structuralEquals({ a: 1 }, { b: 1 }), false);
		assert.strictEqual(structuralEquals({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
		assert.strictEqual(structuralEquals({ a: 1 }, { a: 1, b: 2 }), false);
		assert.strictEqual(structuralEquals({ a: { b: 1 } }, { a: { b: 1 } }), true);
		assert.strictEqual(structuralEquals({ a: { b: 1 } }, { a: { b: 2 } }), false);

		// Mixed Arrays and Objects
		assert.strictEqual(structuralEquals([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }]), true);
		assert.strictEqual(structuralEquals({ a: [1, 2] }, { a: [1, 2] }), true);

		// Custom Prototypes / Classes (should use strict equality)
		class A { constructor(public val: number) {} }
		const a1 = new A(1);
		const a2 = new A(1);
		assert.strictEqual(structuralEquals(a1, a1), true);
		assert.strictEqual(structuralEquals(a1, a2), false); // Instances are different
	});

	test('structuralEqualsC', () => {
		const comparer = structuralEqualsC<{ a: number }>();
		assert.strictEqual(comparer({ a: 1 }, { a: 1 }), true);
		assert.strictEqual(comparer({ a: 1 }, { a: 2 }), false);
	});

	test('getStructuralKey', () => {
		assert.strictEqual(getStructuralKey(1), getStructuralKey(1));
		assert.notStrictEqual(getStructuralKey(1), getStructuralKey(2));
		assert.strictEqual(getStructuralKey('a'), getStructuralKey('a'));

		assert.strictEqual(getStructuralKey([]), getStructuralKey([]));
		assert.strictEqual(getStructuralKey([1, 2]), getStructuralKey([1, 2]));

		assert.strictEqual(getStructuralKey({}), getStructuralKey({}));
		assert.strictEqual(getStructuralKey({ a: 1, b: 2 }), getStructuralKey({ b: 2, a: 1 })); // Order doesn't matter
		assert.notStrictEqual(getStructuralKey({ a: 1 }), getStructuralKey({ a: 2 }));

		// Custom prototypes
		class A { constructor(public val: number) {} }
		const a1 = new A(1);
		const a2 = new A(1);
		assert.strictEqual(getStructuralKey(a1), getStructuralKey(a1));
		assert.notStrictEqual(getStructuralKey(a1), getStructuralKey(a2)); // Different instances have different keys
	});

	test('jsonStringifyEquals', () => {
		assert.strictEqual(jsonStringifyEquals({ a: 1 }, { a: 1 }), true);
		assert.strictEqual(jsonStringifyEquals({ a: 1 }, { a: 2 }), false);
		// Note: JSON.stringify order matters
		assert.strictEqual(jsonStringifyEquals({ a: 1, b: 2 }, { b: 2, a: 1 }), false);
	});

	test('jsonStringifyEqualsC', () => {
		const comparer = jsonStringifyEqualsC<{ a: number }>();
		assert.strictEqual(comparer({ a: 1 }, { a: 1 }), true);
		assert.strictEqual(comparer({ a: 1 }, { a: 2 }), false);
	});


	test('thisEqualsC', () => {
		class TestItem {
			constructor(public val: number) {}
			equals(other: TestItem): boolean {
				return this.val === other.val;
			}
		}

		const comparer = thisEqualsC<TestItem>();
		assert.strictEqual(comparer(new TestItem(1), new TestItem(1)), true);
		assert.strictEqual(comparer(new TestItem(1), new TestItem(2)), false);
	});

	test('equalsIfDefined', () => {
		assert.strictEqual(equalsIfDefined(null, null, strictEquals), true);
		assert.strictEqual(equalsIfDefined(undefined, undefined, strictEquals), true);

		// One is null/undefined
		assert.strictEqual(equalsIfDefined(null, 1, strictEquals), false);
		assert.strictEqual(equalsIfDefined(1, null, strictEquals), false);
		assert.strictEqual(equalsIfDefined(undefined, 1, strictEquals), false);
		assert.strictEqual(equalsIfDefined(1, undefined, strictEquals), false);

		// Both defined
		assert.strictEqual(equalsIfDefined(1, 1, strictEquals), true);
		assert.strictEqual(equalsIfDefined(1, 2, strictEquals), false);
	});

	test('equalsIfDefinedC', () => {
		const comparer = equalsIfDefinedC<number>(strictEquals);
		assert.strictEqual(comparer(null, null), true);
		assert.strictEqual(comparer(undefined, undefined), true);
		assert.strictEqual(comparer(1, null), false);
		assert.strictEqual(comparer(1, 1), true);
		assert.strictEqual(comparer(1, 2), false);
	});

	test('equals namespace', () => {
		assert.strictEqual(equals.strict, strictEquals);
		assert.strictEqual(equals.strictC, strictEqualsC);
		assert.strictEqual(equals.array, arrayEquals);
		assert.strictEqual(equals.arrayC, arrayEqualsC);
		assert.strictEqual(equals.structural, structuralEquals);
		assert.strictEqual(equals.structuralC, structuralEqualsC);
		assert.strictEqual(equals.jsonStringify, jsonStringifyEquals);
		assert.strictEqual(equals.jsonStringifyC, jsonStringifyEqualsC);
		assert.strictEqual(equals.thisC, thisEqualsC);
		assert.strictEqual(equals.ifDefined, equalsIfDefined);
		assert.strictEqual(equals.ifDefinedC, equalsIfDefinedC);
	});

});
