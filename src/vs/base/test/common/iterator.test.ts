/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Iterable } from '../../common/iterator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Iterable', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	const customIterable = new class {

		*[Symbol.iterator]() {
			yield 'one';
			yield 'two';
			yield 'three';
		}
	};

	test('first', function () {

		assert.strictEqual(Iterable.first([]), undefined);
		assert.strictEqual(Iterable.first([1]), 1);
		assert.strictEqual(Iterable.first(customIterable), 'one');
		assert.strictEqual(Iterable.first(customIterable), 'one'); // fresh
	});

	test('wrap', function () {
		assert.deepStrictEqual([...Iterable.wrap(1)], [1]);
		assert.deepStrictEqual([...Iterable.wrap([1, 2, 3])], [1, 2, 3]);
	});

	test('every', function () {
		// Empty iterable should return true (vacuous truth)
		assert.strictEqual(Iterable.every([], () => false), true);

		// All elements match predicate
		assert.strictEqual(Iterable.every([2, 4, 6, 8], x => x % 2 === 0), true);
		assert.strictEqual(Iterable.every([1, 2, 3], x => x > 0), true);

		// Not all elements match predicate
		assert.strictEqual(Iterable.every([1, 2, 3, 4], x => x % 2 === 0), false);
		assert.strictEqual(Iterable.every([1, 2, 3], x => x > 2), false);

		// Single element - matches
		assert.strictEqual(Iterable.every([5], x => x === 5), true);

		// Single element - doesn't match
		assert.strictEqual(Iterable.every([5], x => x === 6), false);

		// Test index parameter in predicate
		const numbers = [10, 11, 12, 13];
		assert.strictEqual(Iterable.every(numbers, (x, i) => x === 10 + i), true);
		assert.strictEqual(Iterable.every(numbers, (x, i) => i < 2), false);

		// Test early termination - predicate should not be called for all elements
		let callCount = 0;
		const result = Iterable.every([1, 2, 3, 4, 5], x => {
			callCount++;
			return x < 3;
		});
		assert.strictEqual(result, false);
		assert.strictEqual(callCount, 3); // Should stop at the third element

		// Test with truthy/falsy values
		assert.strictEqual(Iterable.every([1, 2, 3], x => x), true);
		assert.strictEqual(Iterable.every([1, 0, 3], x => x), false);
		assert.strictEqual(Iterable.every(['a', 'b', 'c'], x => x), true);
		assert.strictEqual(Iterable.every(['a', '', 'c'], x => x), false);
	});
});
