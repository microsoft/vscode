/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	asyncIterableConcat,
	asyncIterableCount,
	asyncIterableFilter,
	asyncIterableFromArray,
	asyncIterableMap,
	asyncIterableMapFilter,
	asyncIterableToArray,
	iterableMap,
	iterableMapFilter,
} from '../iterableHelpers';

class AsyncIterableTestHelper {
	state = 0; // this is used to check that operations are suitably lazy
	async *[Symbol.asyncIterator](): AsyncIterator<number> {
		this.state = 1;
		yield Promise.resolve(1);
		this.state = 2;
		yield Promise.resolve(2);
		this.state = 3;
		yield Promise.resolve(3);
		this.state = 4;
	}
	constructor() { }
}

suite('Async Iterable utilities', function () {
	// Sanity check that the generator itself behaves as expected
	test('generator', async function () {
		const asyncIterableIn = new AsyncIterableTestHelper();
		const asyncIterable = asyncIterableIn;
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(asyncIterableIn.state, 0);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 1, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 1);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 2, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 2);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 3, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 3);
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
		assert.deepStrictEqual(asyncIterableIn.state, 4);
	});

	test('map', async function () {
		const asyncIterableIn = new AsyncIterableTestHelper();
		const asyncIterable = asyncIterableMap(asyncIterableIn, v => Promise.resolve(v * 2));
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(asyncIterableIn.state, 0);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 2, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 1);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 4, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 2);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 6, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 3);
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
		assert.deepStrictEqual(asyncIterableIn.state, 4);
	});

	test('filter', async function () {
		const asyncIterableIn = new AsyncIterableTestHelper();
		const asyncIterable = asyncIterableFilter(asyncIterableIn, v => Promise.resolve(v % 2 === 0));
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(asyncIterableIn.state, 0);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 2, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 2);
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
		assert.deepStrictEqual(asyncIterableIn.state, 4);
	});

	test('mapFilter', async function () {
		const asyncIterableIn = new AsyncIterableTestHelper();
		const asyncIterable = asyncIterableMapFilter(asyncIterableIn, v =>
			Promise.resolve(v % 2 === 0 ? v / 2 : undefined)
		);
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(asyncIterableIn.state, 0);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 1, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 2);
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
		assert.deepStrictEqual(asyncIterableIn.state, 4);
	});

	test('mapFilter keeps non-undefined falsy values', async function () {
		const asyncIterableIn = new AsyncIterableTestHelper();
		const asyncIterable = asyncIterableMapFilter(asyncIterableIn, v => Promise.resolve(v % 2 === 0 ? v / 2 : 0));
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(asyncIterableIn.state, 0);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 0, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 1);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 1, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 2);
		assert.deepStrictEqual(await asyncIterator.next(), { value: 0, done: false });
		assert.deepStrictEqual(asyncIterableIn.state, 3);
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
		assert.deepStrictEqual(asyncIterableIn.state, 4);
	});

	test('fromArray', async function () {
		const asyncIterable = asyncIterableFromArray([1, 2]);
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(await asyncIterator.next(), { value: 1, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: 2, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
	});

	test('toArray', async function () {
		const expected = [1, 2, 3];
		const asyncIterable = asyncIterableFromArray(expected);
		const actual = await asyncIterableToArray(asyncIterable);
		assert.deepStrictEqual(actual, expected);
	});

	test('concat', async function () {
		const asyncIterable1 = asyncIterableFromArray([1, 2]);
		const asyncIterable2 = asyncIterableFromArray([3, 4]);
		const asyncIterable = asyncIterableConcat(asyncIterable1, asyncIterable2);
		const asyncIterator = asyncIterable[Symbol.asyncIterator]();
		assert.deepStrictEqual(await asyncIterator.next(), { value: 1, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: 2, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: 3, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: 4, done: false });
		assert.deepStrictEqual(await asyncIterator.next(), { value: undefined, done: true });
	});

	test('count', async function () {
		const asyncIterable = asyncIterableFromArray([1, 2]);
		assert.deepStrictEqual(await asyncIterableCount(asyncIterable), 2);
	});

	test('iterableMap', function () {
		const source = [1, 2, 3][Symbol.iterator]();
		const actual = iterableMap(source, v => v * 2);
		assert.deepStrictEqual(Array.from(actual), [2, 4, 6]);
	});

	test('iterableMapFilter', function () {
		const source = [1, 2, 3][Symbol.iterator]();
		const actual = iterableMapFilter(source, v => (v % 2 !== 0 ? v * 2 : undefined));
		assert.deepStrictEqual(Array.from(actual), [2, 6]);
	});
});
