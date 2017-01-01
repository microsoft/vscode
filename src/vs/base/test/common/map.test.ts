/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { BoundedLinkedMap, LRUCache, LinkedMap, TrieMap } from 'vs/base/common/map';
import * as assert from 'assert';

suite('Map', () => {

	test('LinkedMap - basics', function () {
		const map = new LinkedMap<string, any>();

		assert.equal(map.size, 0);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);

		const obj = Object.create(null);
		map.set('4', obj);

		const date = Date.now();
		map.set('5', date);

		assert.equal(map.size, 5);
		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), '2');
		assert.equal(map.get('3'), true);
		assert.equal(map.get('4'), obj);
		assert.equal(map.get('5'), date);
		assert.ok(!map.get('6'));

		map.delete('6');
		assert.equal(map.size, 5);
		assert.equal(map.delete('1'), 1);
		assert.equal(map.delete('2'), '2');
		assert.equal(map.delete('3'), true);
		assert.equal(map.delete('4'), obj);
		assert.equal(map.delete('5'), date);

		assert.equal(map.size, 0);
		assert.ok(!map.get('5'));
		assert.ok(!map.get('4'));
		assert.ok(!map.get('3'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('1'));

		map.set('1', 1);
		map.set('2', '2');
		assert.ok(map.set('3', true)); // adding an element returns true
		assert.ok(!map.set('3', true)); // adding it again returns false

		assert.ok(map.has('1'));
		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), '2');
		assert.equal(map.get('3'), true);

		map.clear();

		assert.equal(map.size, 0);
		assert.ok(!map.get('1'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('3'));
		assert.ok(!map.has('1'));

		const res = map.getOrSet('foo', 'bar');
		assert.equal(map.get('foo'), res);
		assert.equal(res, 'bar');
	});

	test('BoundedLinkedMap - basics', function () {
		const map = new BoundedLinkedMap<any>();

		assert.equal(map.size, 0);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);

		const obj = Object.create(null);
		map.set('4', obj);

		const date = Date.now();
		map.set('5', date);

		assert.equal(map.size, 5);
		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), '2');
		assert.equal(map.get('3'), true);
		assert.equal(map.get('4'), obj);
		assert.equal(map.get('5'), date);
		assert.ok(!map.get('6'));

		map.delete('6');
		assert.equal(map.size, 5);
		assert.equal(map.delete('1'), 1);
		assert.equal(map.delete('2'), '2');
		assert.equal(map.delete('3'), true);
		assert.equal(map.delete('4'), obj);
		assert.equal(map.delete('5'), date);

		assert.equal(map.size, 0);
		assert.ok(!map.get('5'));
		assert.ok(!map.get('4'));
		assert.ok(!map.get('3'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('1'));

		map.set('1', 1);
		map.set('2', '2');
		assert.ok(map.set('3', true)); // adding an element returns true
		assert.ok(!map.set('3', true)); // adding it again returns false

		assert.ok(map.has('1'));
		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), '2');
		assert.equal(map.get('3'), true);

		map.clear();

		assert.equal(map.size, 0);
		assert.ok(!map.get('1'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('3'));
		assert.ok(!map.has('1'));

		const res = map.getOrSet('foo', 'bar');
		assert.equal(map.get('foo'), res);
		assert.equal(res, 'bar');
	});

	test('BoundedLinkedMap - bounded', function () {
		const map = new BoundedLinkedMap<number>(5);

		assert.equal(0, map.size);

		map.set('1', 1);
		map.set('2', 2);
		map.set('3', 3);
		map.set('4', 4);
		map.set('5', 5);

		assert.equal(5, map.size);

		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), 2);
		assert.equal(map.get('3'), 3);
		assert.equal(map.get('4'), 4);
		assert.equal(map.get('5'), 5);

		map.set('6', 6);

		assert.equal(5, map.size);
		assert.ok(!map.get('1'));
		assert.equal(map.get('2'), 2);
		assert.equal(map.get('3'), 3);
		assert.equal(map.get('4'), 4);
		assert.equal(map.get('5'), 5);
		assert.equal(map.get('6'), 6);

		map.set('7', 7);
		map.set('8', 8);
		map.set('9', 9);

		assert.equal(5, map.size);
		assert.ok(!map.get('1'));
		assert.ok(!map.get('2'));
		assert.ok(!map.get('3'));
		assert.ok(!map.get('4'));

		assert.equal(map.get('5'), 5);
		assert.equal(map.get('6'), 6);
		assert.equal(map.get('7'), 7);
		assert.equal(map.get('8'), 8);
		assert.equal(map.get('9'), 9);

		map.delete('5');
		map.delete('7');

		assert.equal(3, map.size);
		assert.ok(!map.get('5'));
		assert.ok(!map.get('7'));
		assert.equal(map.get('6'), 6);
		assert.equal(map.get('8'), 8);
		assert.equal(map.get('9'), 9);

		map.set('10', 10);
		map.set('11', 11);
		map.set('12', 12);
		map.set('13', 13);
		map.set('14', 14);

		assert.equal(5, map.size);
		assert.equal(map.get('10'), 10);
		assert.equal(map.get('11'), 11);
		assert.equal(map.get('12'), 12);
		assert.equal(map.get('13'), 13);
		assert.equal(map.get('14'), 14);
	});

	test('BoundedLinkedMap - bounded with ratio', function () {
		const map = new BoundedLinkedMap<number>(6, 0.5);

		assert.equal(0, map.size);

		map.set('1', 1);
		map.set('2', 2);
		map.set('3', 3);
		map.set('4', 4);
		map.set('5', 5);
		map.set('6', 6);

		assert.equal(6, map.size);

		map.set('7', 7);

		assert.equal(3, map.size);
		assert.ok(!map.has('1'));
		assert.ok(!map.has('2'));
		assert.ok(!map.has('3'));
		assert.ok(!map.has('4'));
		assert.equal(map.get('5'), 5);
		assert.equal(map.get('6'), 6);
		assert.equal(map.get('7'), 7);

		map.set('8', 8);
		map.set('9', 9);
		map.set('10', 10);

		assert.equal(6, map.size);
		assert.equal(map.get('5'), 5);
		assert.equal(map.get('6'), 6);
		assert.equal(map.get('7'), 7);
		assert.equal(map.get('8'), 8);
		assert.equal(map.get('9'), 9);
		assert.equal(map.get('10'), 10);
	});

	test('LRUCache', function () {
		const cache = new LRUCache<number>(3);

		assert.equal(0, cache.size);

		cache.set('1', 1);
		cache.set('2', 2);
		cache.set('3', 3);

		assert.equal(3, cache.size);

		assert.equal(cache.get('1'), 1);
		assert.equal(cache.get('2'), 2);
		assert.equal(cache.get('3'), 3);

		cache.set('4', 4);

		assert.equal(3, cache.size);
		assert.equal(cache.get('4'), 4); // this changes MRU order
		assert.equal(cache.get('3'), 3);
		assert.equal(cache.get('2'), 2);

		cache.set('5', 5);
		cache.set('6', 6);

		assert.equal(3, cache.size);
		assert.equal(cache.get('2'), 2);
		assert.equal(cache.get('5'), 5);
		assert.equal(cache.get('6'), 6);
		assert.ok(!cache.has('3'));
		assert.ok(!cache.has('4'));
	});


	test('TrieMap - basics', function () {

		const map = new TrieMap<number>(TrieMap.PathSplitter);

		map.insert('/user/foo/bar', 1);
		map.insert('/user/foo', 2);
		map.insert('/user/foo/flip/flop', 3);

		assert.equal(map.findSubstr('/user/bar'), undefined);
		assert.equal(map.findSubstr('/user/foo'), 2);
		assert.equal(map.findSubstr('\\user\\foo'), 2);
		assert.equal(map.findSubstr('/user/foo/ba'), 2);
		assert.equal(map.findSubstr('/user/foo/far/boo'), 2);
		assert.equal(map.findSubstr('/user/foo/bar'), 1);
		assert.equal(map.findSubstr('/user/foo/bar/far/boo'), 1);

	});

	test('TrieMap - lookup', function () {

		const map = new TrieMap<number>(TrieMap.PathSplitter);
		map.insert('/user/foo/bar', 1);
		map.insert('/user/foo', 2);
		map.insert('/user/foo/flip/flop', 3);

		assert.equal(map.lookUp('/foo'), undefined);
		assert.equal(map.lookUp('/user'), undefined);
		assert.equal(map.lookUp('/user/foo'), 2);
		assert.equal(map.lookUp('/user/foo/bar'), 1);
		assert.equal(map.lookUp('/user/foo/bar/boo'), undefined);
	});

	test('TrieMap - superstr', function () {

		const map = new TrieMap<number>(TrieMap.PathSplitter);
		map.insert('/user/foo/bar', 1);
		map.insert('/user/foo', 2);
		map.insert('/user/foo/flip/flop', 3);

		const supMap = map.findSuperstr('/user');

		assert.equal(supMap.lookUp('foo'), 2);
		assert.equal(supMap.lookUp('foo/bar'), 1);
		assert.equal(supMap.lookUp('foo/flip/flop'), 3);
		assert.equal(supMap.lookUp('foo/flip/flop/bar'), undefined);
		assert.equal(supMap.lookUp('user'), undefined);
	});
});
