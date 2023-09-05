/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { BidirectionalMap, LinkedMap, LRUCache, ResourceMap, Touch } from 'vs/base/common/map';
import { extUriIgnorePathCase } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';

suite('Map', () => {

	test('LinkedMap - Simple', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		assert.deepStrictEqual([...map.keys()], ['ak', 'bk']);
		assert.deepStrictEqual([...map.values()], ['av', 'bv']);
		assert.strictEqual(map.first, 'av');
		assert.strictEqual(map.last, 'bv');
	});

	test('LinkedMap - Touch Old one', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('ak', 'av', Touch.AsOld);
		assert.deepStrictEqual([...map.keys()], ['ak']);
		assert.deepStrictEqual([...map.values()], ['av']);
	});

	test('LinkedMap - Touch New one', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('ak', 'av', Touch.AsNew);
		assert.deepStrictEqual([...map.keys()], ['ak']);
		assert.deepStrictEqual([...map.values()], ['av']);
	});

	test('LinkedMap - Touch Old two', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('bk', 'bv', Touch.AsOld);
		assert.deepStrictEqual([...map.keys()], ['bk', 'ak']);
		assert.deepStrictEqual([...map.values()], ['bv', 'av']);
	});

	test('LinkedMap - Touch New two', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ak', 'av', Touch.AsNew);
		assert.deepStrictEqual([...map.keys()], ['bk', 'ak']);
		assert.deepStrictEqual([...map.values()], ['bv', 'av']);
	});

	test('LinkedMap - Touch Old from middle', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');
		map.set('bk', 'bv', Touch.AsOld);
		assert.deepStrictEqual([...map.keys()], ['bk', 'ak', 'ck']);
		assert.deepStrictEqual([...map.values()], ['bv', 'av', 'cv']);
	});

	test('LinkedMap - Touch New from middle', () => {
		const map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');
		map.set('bk', 'bv', Touch.AsNew);
		assert.deepStrictEqual([...map.keys()], ['ak', 'ck', 'bk']);
		assert.deepStrictEqual([...map.values()], ['av', 'cv', 'bv']);
	});

	test('LinkedMap - basics', function () {
		const map = new LinkedMap<string, any>();

		assert.strictEqual(map.size, 0);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);

		const obj = Object.create(null);
		map.set('4', obj);

		const date = Date.now();
		map.set('5', date);

		assert.strictEqual(map.size, 5);
		assert.strictEqual(map.get('1'), 1);
		assert.strictEqual(map.get('2'), '2');
		assert.strictEqual(map.get('3'), true);
		assert.strictEqual(map.get('4'), obj);
		assert.strictEqual(map.get('5'), date);
		assert.ok(!map.get('6'));

		map.delete('6');
		assert.strictEqual(map.size, 5);
		assert.strictEqual(map.delete('1'), true);
		assert.strictEqual(map.delete('2'), true);
		assert.strictEqual(map.delete('3'), true);
		assert.strictEqual(map.delete('4'), true);
		assert.strictEqual(map.delete('5'), true);

		assert.strictEqual(map.size, 0);
		assert.ok(!map.get('5'));
		assert.ok(!map.get('4'));
		assert.ok(!map.get('3'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('1'));

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);

		assert.ok(map.has('1'));
		assert.strictEqual(map.get('1'), 1);
		assert.strictEqual(map.get('2'), '2');
		assert.strictEqual(map.get('3'), true);

		map.clear();

		assert.strictEqual(map.size, 0);
		assert.ok(!map.get('1'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('3'));
		assert.ok(!map.has('1'));
	});

	test('LinkedMap - Iterators', () => {
		const map = new LinkedMap<number, any>();
		map.set(1, 1);
		map.set(2, 2);
		map.set(3, 3);

		for (const elem of map.keys()) {
			assert.ok(elem);
		}

		for (const elem of map.values()) {
			assert.ok(elem);
		}

		for (const elem of map.entries()) {
			assert.ok(elem);
		}

		{
			const keys = map.keys();
			const values = map.values();
			const entries = map.entries();
			map.get(1);
			keys.next();
			values.next();
			entries.next();
		}

		{
			const keys = map.keys();
			const values = map.values();
			const entries = map.entries();
			map.get(1, Touch.AsNew);

			let exceptions: number = 0;
			try {
				keys.next();
			} catch (err) {
				exceptions++;
			}
			try {
				values.next();
			} catch (err) {
				exceptions++;
			}
			try {
				entries.next();
			} catch (err) {
				exceptions++;
			}

			assert.strictEqual(exceptions, 3);
		}
	});

	test('LinkedMap - LRU Cache simple', () => {
		const cache = new LRUCache<number, number>(5);

		[1, 2, 3, 4, 5].forEach(value => cache.set(value, value));
		assert.strictEqual(cache.size, 5);
		cache.set(6, 6);
		assert.strictEqual(cache.size, 5);
		assert.deepStrictEqual([...cache.keys()], [2, 3, 4, 5, 6]);
		cache.set(7, 7);
		assert.strictEqual(cache.size, 5);
		assert.deepStrictEqual([...cache.keys()], [3, 4, 5, 6, 7]);
		const values: number[] = [];
		[3, 4, 5, 6, 7].forEach(key => values.push(cache.get(key)!));
		assert.deepStrictEqual(values, [3, 4, 5, 6, 7]);
	});

	test('LinkedMap - LRU Cache get', () => {
		const cache = new LRUCache<number, number>(5);

		[1, 2, 3, 4, 5].forEach(value => cache.set(value, value));
		assert.strictEqual(cache.size, 5);
		assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 5]);
		cache.get(3);
		assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
		cache.peek(4);
		assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
		const values: number[] = [];
		[1, 2, 3, 4, 5].forEach(key => values.push(cache.get(key)!));
		assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
	});

	test('LinkedMap - LRU Cache limit', () => {
		const cache = new LRUCache<number, number>(10);

		for (let i = 1; i <= 10; i++) {
			cache.set(i, i);
		}
		assert.strictEqual(cache.size, 10);
		cache.limit = 5;
		assert.strictEqual(cache.size, 5);
		assert.deepStrictEqual([...cache.keys()], [6, 7, 8, 9, 10]);
		cache.limit = 20;
		assert.strictEqual(cache.size, 5);
		for (let i = 11; i <= 20; i++) {
			cache.set(i, i);
		}
		assert.deepStrictEqual(cache.size, 15);
		const values: number[] = [];
		for (let i = 6; i <= 20; i++) {
			values.push(cache.get(i)!);
			assert.strictEqual(cache.get(i), i);
		}
		assert.deepStrictEqual([...cache.values()], values);
	});

	test('LinkedMap - LRU Cache limit with ratio', () => {
		const cache = new LRUCache<number, number>(10, 0.5);

		for (let i = 1; i <= 10; i++) {
			cache.set(i, i);
		}
		assert.strictEqual(cache.size, 10);
		cache.set(11, 11);
		assert.strictEqual(cache.size, 5);
		assert.deepStrictEqual([...cache.keys()], [7, 8, 9, 10, 11]);
		const values: number[] = [];
		[...cache.keys()].forEach(key => values.push(cache.get(key)!));
		assert.deepStrictEqual(values, [7, 8, 9, 10, 11]);
		assert.deepStrictEqual([...cache.values()], values);
	});

	test('LinkedMap - toJSON / fromJSON', () => {
		let map = new LinkedMap<string, string>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');

		const json = map.toJSON();
		map = new LinkedMap<string, string>();
		map.fromJSON(json);

		let i = 0;
		map.forEach((value, key) => {
			if (i === 0) {
				assert.strictEqual(key, 'ak');
				assert.strictEqual(value, 'av');
			} else if (i === 1) {
				assert.strictEqual(key, 'bk');
				assert.strictEqual(value, 'bv');
			} else if (i === 2) {
				assert.strictEqual(key, 'ck');
				assert.strictEqual(value, 'cv');
			}
			i++;
		});
	});

	test('LinkedMap - delete Head and Tail', function () {
		const map = new LinkedMap<string, number>();

		assert.strictEqual(map.size, 0);

		map.set('1', 1);
		assert.strictEqual(map.size, 1);
		map.delete('1');
		assert.strictEqual(map.get('1'), undefined);
		assert.strictEqual(map.size, 0);
		assert.strictEqual([...map.keys()].length, 0);
	});

	test('LinkedMap - delete Head', function () {
		const map = new LinkedMap<string, number>();

		assert.strictEqual(map.size, 0);

		map.set('1', 1);
		map.set('2', 2);
		assert.strictEqual(map.size, 2);
		map.delete('1');
		assert.strictEqual(map.get('2'), 2);
		assert.strictEqual(map.size, 1);
		assert.strictEqual([...map.keys()].length, 1);
		assert.strictEqual([...map.keys()][0], '2');
	});

	test('LinkedMap - delete Tail', function () {
		const map = new LinkedMap<string, number>();

		assert.strictEqual(map.size, 0);

		map.set('1', 1);
		map.set('2', 2);
		assert.strictEqual(map.size, 2);
		map.delete('2');
		assert.strictEqual(map.get('1'), 1);
		assert.strictEqual(map.size, 1);
		assert.strictEqual([...map.keys()].length, 1);
		assert.strictEqual([...map.keys()][0], '1');
	});

	test('ResourceMap - basics', function () {
		const map = new ResourceMap<any>();

		const resource1 = URI.parse('some://1');
		const resource2 = URI.parse('some://2');
		const resource3 = URI.parse('some://3');
		const resource4 = URI.parse('some://4');
		const resource5 = URI.parse('some://5');
		const resource6 = URI.parse('some://6');

		assert.strictEqual(map.size, 0);

		const res = map.set(resource1, 1);
		assert.ok(res === map);
		map.set(resource2, '2');
		map.set(resource3, true);

		const values = [...map.values()];
		assert.strictEqual(values[0], 1);
		assert.strictEqual(values[1], '2');
		assert.strictEqual(values[2], true);

		let counter = 0;
		map.forEach((value, key, mapObj) => {
			assert.strictEqual(value, values[counter++]);
			assert.ok(URI.isUri(key));
			assert.ok(map === mapObj);
		});

		const obj = Object.create(null);
		map.set(resource4, obj);

		const date = Date.now();
		map.set(resource5, date);

		assert.strictEqual(map.size, 5);
		assert.strictEqual(map.get(resource1), 1);
		assert.strictEqual(map.get(resource2), '2');
		assert.strictEqual(map.get(resource3), true);
		assert.strictEqual(map.get(resource4), obj);
		assert.strictEqual(map.get(resource5), date);
		assert.ok(!map.get(resource6));

		map.delete(resource6);
		assert.strictEqual(map.size, 5);
		assert.ok(map.delete(resource1));
		assert.ok(map.delete(resource2));
		assert.ok(map.delete(resource3));
		assert.ok(map.delete(resource4));
		assert.ok(map.delete(resource5));

		assert.strictEqual(map.size, 0);
		assert.ok(!map.get(resource5));
		assert.ok(!map.get(resource4));
		assert.ok(!map.get(resource3));
		assert.ok(!map.get(resource2));
		assert.ok(!map.get(resource1));

		map.set(resource1, 1);
		map.set(resource2, '2');
		map.set(resource3, true);

		assert.ok(map.has(resource1));
		assert.strictEqual(map.get(resource1), 1);
		assert.strictEqual(map.get(resource2), '2');
		assert.strictEqual(map.get(resource3), true);

		map.clear();

		assert.strictEqual(map.size, 0);
		assert.ok(!map.get(resource1));
		assert.ok(!map.get(resource2));
		assert.ok(!map.get(resource3));
		assert.ok(!map.has(resource1));

		map.set(resource1, false);
		map.set(resource2, 0);

		assert.ok(map.has(resource1));
		assert.ok(map.has(resource2));
	});

	test('ResourceMap - files (do NOT ignorecase)', function () {
		const map = new ResourceMap<any>();

		const fileA = URI.parse('file://some/filea');
		const fileB = URI.parse('some://some/other/fileb');
		const fileAUpper = URI.parse('file://SOME/FILEA');

		map.set(fileA, 'true');
		assert.strictEqual(map.get(fileA), 'true');

		assert.ok(!map.get(fileAUpper));

		assert.ok(!map.get(fileB));

		map.set(fileAUpper, 'false');
		assert.strictEqual(map.get(fileAUpper), 'false');

		assert.strictEqual(map.get(fileA), 'true');

		const windowsFile = URI.file('c:\\test with %25\\c#code');
		const uncFile = URI.file('\\\\shäres\\path\\c#\\plugin.json');

		map.set(windowsFile, 'true');
		map.set(uncFile, 'true');

		assert.strictEqual(map.get(windowsFile), 'true');
		assert.strictEqual(map.get(uncFile), 'true');
	});

	test('ResourceMap - files (ignorecase)', function () {
		const map = new ResourceMap<any>(uri => extUriIgnorePathCase.getComparisonKey(uri));

		const fileA = URI.parse('file://some/filea');
		const fileB = URI.parse('some://some/other/fileb');
		const fileAUpper = URI.parse('file://SOME/FILEA');

		map.set(fileA, 'true');
		assert.strictEqual(map.get(fileA), 'true');

		assert.strictEqual(map.get(fileAUpper), 'true');

		assert.ok(!map.get(fileB));

		map.set(fileAUpper, 'false');
		assert.strictEqual(map.get(fileAUpper), 'false');

		assert.strictEqual(map.get(fileA), 'false');

		const windowsFile = URI.file('c:\\test with %25\\c#code');
		const uncFile = URI.file('\\\\shäres\\path\\c#\\plugin.json');

		map.set(windowsFile, 'true');
		map.set(uncFile, 'true');

		assert.strictEqual(map.get(windowsFile), 'true');
		assert.strictEqual(map.get(uncFile), 'true');
	});

	test('ResourceMap - files (ignorecase, BUT preservecase)', function () {
		const map = new ResourceMap<number>(uri => extUriIgnorePathCase.getComparisonKey(uri));

		const fileA = URI.parse('file://some/filea');
		const fileAUpper = URI.parse('file://SOME/FILEA');

		map.set(fileA, 1);
		assert.strictEqual(map.get(fileA), 1);
		assert.strictEqual(map.get(fileAUpper), 1);
		assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileA].map(String));
		assert.deepStrictEqual(Array.from(map), [[fileA, 1]]);

		map.set(fileAUpper, 1);
		assert.strictEqual(map.get(fileA), 1);
		assert.strictEqual(map.get(fileAUpper), 1);
		assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileAUpper].map(String));
		assert.deepStrictEqual(Array.from(map), [[fileAUpper, 1]]);
	});
});

suite('BidirectionalMap', () => {
	test('should set and get values correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		assert.strictEqual(map.get('one'), 1);
		assert.strictEqual(map.get('two'), 2);
		assert.strictEqual(map.get('three'), 3);
	});

	test('should get keys by value correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		assert.strictEqual(map.getKey(1), 'one');
		assert.strictEqual(map.getKey(2), 'two');
		assert.strictEqual(map.getKey(3), 'three');
	});

	test('should delete values correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		assert.strictEqual(map.delete('one'), true);
		assert.strictEqual(map.get('one'), undefined);
		assert.strictEqual(map.getKey(1), undefined);

		assert.strictEqual(map.delete('two'), true);
		assert.strictEqual(map.get('two'), undefined);
		assert.strictEqual(map.getKey(2), undefined);

		assert.strictEqual(map.delete('three'), true);
		assert.strictEqual(map.get('three'), undefined);
		assert.strictEqual(map.getKey(3), undefined);
	});

	test('should handle non-existent keys correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		assert.strictEqual(map.get('four'), undefined);
		assert.strictEqual(map.getKey(4), undefined);
		assert.strictEqual(map.delete('four'), false);
	});

	test('should handle forEach correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		const keys: string[] = [];
		const values: number[] = [];
		map.forEach((value, key) => {
			keys.push(key);
			values.push(value);
		});

		assert.deepStrictEqual(keys, ['one', 'two', 'three']);
		assert.deepStrictEqual(values, [1, 2, 3]);
	});

	test('should handle clear correctly', () => {
		const map = new BidirectionalMap<string, number>();
		map.set('one', 1);
		map.set('two', 2);
		map.set('three', 3);

		map.clear();

		assert.strictEqual(map.get('one'), undefined);
		assert.strictEqual(map.get('two'), undefined);
		assert.strictEqual(map.get('three'), undefined);
		assert.strictEqual(map.getKey(1), undefined);
		assert.strictEqual(map.getKey(2), undefined);
		assert.strictEqual(map.getKey(3), undefined);
	});
});
