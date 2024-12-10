/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { binarySearch } from '../../common/arrays.js';
import { SkipList } from '../../common/skipList.js';
import { StopWatch } from '../../common/stopwatch.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';


suite('SkipList', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertValues<V>(list: SkipList<any, V>, expected: V[]) {
		assert.strictEqual(list.size, expected.length);
		assert.deepStrictEqual([...list.values()], expected);

		const valuesFromEntries = [...list.entries()].map(entry => entry[1]);
		assert.deepStrictEqual(valuesFromEntries, expected);

		const valuesFromIter = [...list].map(entry => entry[1]);
		assert.deepStrictEqual(valuesFromIter, expected);

		let i = 0;
		list.forEach((value, _key, map) => {
			assert.ok(map === list);
			assert.deepStrictEqual(value, expected[i++]);
		});
	}

	function assertKeys<K>(list: SkipList<K, any>, expected: K[]) {
		assert.strictEqual(list.size, expected.length);
		assert.deepStrictEqual([...list.keys()], expected);

		const keysFromEntries = [...list.entries()].map(entry => entry[0]);
		assert.deepStrictEqual(keysFromEntries, expected);

		const keysFromIter = [...list].map(entry => entry[0]);
		assert.deepStrictEqual(keysFromIter, expected);

		let i = 0;
		list.forEach((_value, key, map) => {
			assert.ok(map === list);
			assert.deepStrictEqual(key, expected[i++]);
		});
	}

	test('set/get/delete', function () {
		const list = new SkipList<number, number>((a, b) => a - b);

		assert.strictEqual(list.get(3), undefined);
		list.set(3, 1);
		assert.strictEqual(list.get(3), 1);
		assertValues(list, [1]);

		list.set(3, 3);
		assertValues(list, [3]);

		list.set(1, 1);
		list.set(4, 4);
		assert.strictEqual(list.get(3), 3);
		assert.strictEqual(list.get(1), 1);
		assert.strictEqual(list.get(4), 4);
		assertValues(list, [1, 3, 4]);

		assert.strictEqual(list.delete(17), false);

		assert.strictEqual(list.delete(1), true);
		assert.strictEqual(list.get(1), undefined);
		assert.strictEqual(list.get(3), 3);
		assert.strictEqual(list.get(4), 4);

		assertValues(list, [3, 4]);
	});

	test('Figure 3', function () {
		const list = new SkipList<number, boolean>((a, b) => a - b);
		list.set(3, true);
		list.set(6, true);
		list.set(7, true);
		list.set(9, true);
		list.set(12, true);
		list.set(19, true);
		list.set(21, true);
		list.set(25, true);

		assertKeys(list, [3, 6, 7, 9, 12, 19, 21, 25]);

		list.set(17, true);
		assert.deepStrictEqual(list.size, 9);
		assertKeys(list, [3, 6, 7, 9, 12, 17, 19, 21, 25]);
	});

	test('clear ( CPU pegged after some builds #194853)', function () {
		const list = new SkipList<number, boolean>((a, b) => a - b);
		list.set(1, true);
		list.set(2, true);
		list.set(3, true);
		assert.strictEqual(list.size, 3);
		list.clear();
		assert.strictEqual(list.size, 0);
		assert.strictEqual(list.get(1), undefined);
		assert.strictEqual(list.get(2), undefined);
		assert.strictEqual(list.get(3), undefined);
	});

	test('capacity max', function () {
		const list = new SkipList<number, boolean>((a, b) => a - b, 10);
		list.set(1, true);
		list.set(2, true);
		list.set(3, true);
		list.set(4, true);
		list.set(5, true);
		list.set(6, true);
		list.set(7, true);
		list.set(8, true);
		list.set(9, true);
		list.set(10, true);
		list.set(11, true);
		list.set(12, true);

		assertKeys(list, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	const cmp = (a: number, b: number): number => {
		if (a < b) {
			return -1;
		} else if (a > b) {
			return 1;
		} else {
			return 0;
		}
	};

	function insertArraySorted(array: number[], element: number) {
		let idx = binarySearch(array, element, cmp);
		if (idx >= 0) {
			array[idx] = element;
		} else {
			idx = ~idx;
			// array = array.slice(0, idx).concat(element, array.slice(idx));
			array.splice(idx, 0, element);
		}
		return array;
	}

	function delArraySorted(array: number[], element: number) {
		const idx = binarySearch(array, element, cmp);
		if (idx >= 0) {
			// array = array.slice(0, idx).concat(array.slice(idx));
			array.splice(idx, 1);
		}
		return array;
	}


	test.skip('perf', function () {

		// data
		const max = 2 ** 16;
		const values = new Set<number>();
		for (let i = 0; i < max; i++) {
			const value = Math.floor(Math.random() * max);
			values.add(value);
		}
		console.log(values.size);

		// init
		const list = new SkipList<number, boolean>(cmp, max);
		let sw = new StopWatch();
		values.forEach(value => list.set(value, true));
		sw.stop();
		console.log(`[LIST] ${list.size} elements after ${sw.elapsed()}ms`);
		let array: number[] = [];
		sw = new StopWatch();
		values.forEach(value => array = insertArraySorted(array, value));
		sw.stop();
		console.log(`[ARRAY] ${array.length} elements after ${sw.elapsed()}ms`);

		// get
		sw = new StopWatch();
		const someValues = [...values].slice(0, values.size / 4);
		someValues.forEach(key => {
			const value = list.get(key); // find
			console.assert(value, '[LIST] must have ' + key);
			list.get(-key); // miss
		});
		sw.stop();
		console.log(`[LIST] retrieve ${sw.elapsed()}ms (${(sw.elapsed() / (someValues.length * 2)).toPrecision(4)}ms/op)`);
		sw = new StopWatch();
		someValues.forEach(key => {
			const idx = binarySearch(array, key, cmp); // find
			console.assert(idx >= 0, '[ARRAY] must have ' + key);
			binarySearch(array, -key, cmp); // miss
		});
		sw.stop();
		console.log(`[ARRAY] retrieve ${sw.elapsed()}ms (${(sw.elapsed() / (someValues.length * 2)).toPrecision(4)}ms/op)`);


		// insert
		sw = new StopWatch();
		someValues.forEach(key => {
			list.set(-key, false);
		});
		sw.stop();
		console.log(`[LIST] insert ${sw.elapsed()}ms (${(sw.elapsed() / someValues.length).toPrecision(4)}ms/op)`);
		sw = new StopWatch();
		someValues.forEach(key => {
			array = insertArraySorted(array, -key);
		});
		sw.stop();
		console.log(`[ARRAY] insert ${sw.elapsed()}ms (${(sw.elapsed() / someValues.length).toPrecision(4)}ms/op)`);

		// delete
		sw = new StopWatch();
		someValues.forEach(key => {
			list.delete(key); // find
			list.delete(-key); // miss
		});
		sw.stop();
		console.log(`[LIST] delete ${sw.elapsed()}ms (${(sw.elapsed() / (someValues.length * 2)).toPrecision(4)}ms/op)`);
		sw = new StopWatch();
		someValues.forEach(key => {
			array = delArraySorted(array, key); // find
			array = delArraySorted(array, -key); // miss
		});
		sw.stop();
		console.log(`[ARRAY] delete ${sw.elapsed()}ms (${(sw.elapsed() / (someValues.length * 2)).toPrecision(4)}ms/op)`);
	});
});
