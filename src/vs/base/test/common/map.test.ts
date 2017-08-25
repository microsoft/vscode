/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';


import { BoundedMap, TrieMap, ResourceMap } from 'vs/base/common/map';
import * as assert from 'assert';
import URI from 'vs/base/common/uri';

suite('Map', () => {

	test('BoundedMap - basics', function () {
		const map = new BoundedMap<any>();

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

	test('BoundedMap - serialization', function () {
		const map = new BoundedMap<any>(5);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);

		const obj = Object.create(null);
		map.set('4', obj);

		const date = Date.now();
		map.set('5', date);

		const mapClone = new BoundedMap<any>(5, 1, map.serialize());

		assert.deepEqual(map.serialize(), mapClone.serialize());

		assert.equal(mapClone.size, 5);
		assert.equal(mapClone.get('1'), 1);
		assert.equal(mapClone.get('2'), '2');
		assert.equal(mapClone.get('3'), true);
		assert.equal(mapClone.get('4'), obj);
		assert.equal(mapClone.get('5'), date);
		assert.ok(!mapClone.get('6'));

		mapClone.set('6', '6');
		assert.equal(mapClone.size, 5);
		assert.ok(!mapClone.get('1'));
	});

	test('BoundedMap - setLimit', function () {
		const map = new BoundedMap<any>(5);

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

		map.setLimit(3);

		assert.equal(map.size, 3);
		assert.ok(!map.get('1'));
		assert.ok(!map.get('2'));
		assert.equal(map.get('3'), true);
		assert.equal(map.get('4'), obj);
		assert.equal(map.get('5'), date);

		map.setLimit(0);

		assert.equal(map.size, 0);
		assert.ok(!map.get('3'));
		assert.ok(!map.get('4'));
		assert.ok(!map.get('5'));

		map.set('6', 6);

		assert.equal(map.size, 0);
		assert.ok(!map.get('6'));

		map.setLimit(100);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', true);
		map.set('4', obj);
		map.set('5', date);

		assert.equal(map.size, 5);
		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), '2');
		assert.equal(map.get('3'), true);
		assert.equal(map.get('4'), obj);
		assert.equal(map.get('5'), date);
	});

	test('BoundedMap - bounded', function () {
		const map = new BoundedMap<number>(5);

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

	test('BoundedMap - bounded with ratio', function () {
		const map = new BoundedMap<number>(6, 0.5);

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

	test('BoundedMap - MRU order', function () {
		const map = new BoundedMap<number>(3);

		function peek(key) {
			const res = map.get(key);
			if (res) {
				map.delete(key);
				map.set(key, res);
			}

			return res;
		}

		assert.equal(0, map.size);

		map.set('1', 1);
		map.set('2', 2);
		map.set('3', 3);

		assert.equal(3, map.size);

		assert.equal(map.get('1'), 1);
		assert.equal(map.get('2'), 2);
		assert.equal(map.get('3'), 3);

		map.set('4', 4);

		assert.equal(3, map.size);
		assert.equal(peek('4'), 4); // this changes MRU order
		assert.equal(peek('3'), 3);
		assert.equal(peek('2'), 2);

		map.set('5', 5);
		map.set('6', 6);

		assert.equal(3, map.size);
		assert.equal(peek('2'), 2);
		assert.equal(peek('5'), 5);
		assert.equal(peek('6'), 6);
		assert.ok(!map.has('3'));
		assert.ok(!map.has('4'));
	});


	test('TrieMap - basics', function () {

		const map = new TrieMap<number>();

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

		const map = new TrieMap<number>();
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

		const map = new TrieMap<number>();
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

	test('ResourceMap - basics', function () {
		const map = new ResourceMap<any>();

		const resource1 = URI.parse('some://1');
		const resource2 = URI.parse('some://2');
		const resource3 = URI.parse('some://3');
		const resource4 = URI.parse('some://4');
		const resource5 = URI.parse('some://5');
		const resource6 = URI.parse('some://6');

		assert.equal(map.size, 0);

		map.set(resource1, 1);
		map.set(resource2, '2');
		map.set(resource3, true);

		const values = map.values();
		assert.equal(values[0], 1);
		assert.equal(values[1], '2');
		assert.equal(values[2], true);

		let counter = 0;
		map.forEach(value => {
			assert.equal(value, values[counter++]);
		});

		const obj = Object.create(null);
		map.set(resource4, obj);

		const date = Date.now();
		map.set(resource5, date);

		assert.equal(map.size, 5);
		assert.equal(map.get(resource1), 1);
		assert.equal(map.get(resource2), '2');
		assert.equal(map.get(resource3), true);
		assert.equal(map.get(resource4), obj);
		assert.equal(map.get(resource5), date);
		assert.ok(!map.get(resource6));

		map.delete(resource6);
		assert.equal(map.size, 5);
		assert.ok(map.delete(resource1));
		assert.ok(map.delete(resource2));
		assert.ok(map.delete(resource3));
		assert.ok(map.delete(resource4));
		assert.ok(map.delete(resource5));

		assert.equal(map.size, 0);
		assert.ok(!map.get(resource5));
		assert.ok(!map.get(resource4));
		assert.ok(!map.get(resource3));
		assert.ok(!map.get(resource2));
		assert.ok(!map.get(resource1));

		map.set(resource1, 1);
		map.set(resource2, '2');
		map.set(resource3, true);

		assert.ok(map.has(resource1));
		assert.equal(map.get(resource1), 1);
		assert.equal(map.get(resource2), '2');
		assert.equal(map.get(resource3), true);

		map.clear();

		assert.equal(map.size, 0);
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
		assert.equal(map.get(fileA), 'true');

		assert.ok(!map.get(fileAUpper));

		assert.ok(!map.get(fileB));

		map.set(fileAUpper, 'false');
		assert.equal(map.get(fileAUpper), 'false');

		assert.equal(map.get(fileA), 'true');

		const windowsFile = URI.file('c:\\test with %25\\c#code');
		const uncFile = URI.file('\\\\shäres\\path\\c#\\plugin.json');

		map.set(windowsFile, 'true');
		map.set(uncFile, 'true');

		assert.equal(map.get(windowsFile), 'true');
		assert.equal(map.get(uncFile), 'true');
	});

	test('ResourceMap - files (ignorecase)', function () {
		const map = new ResourceMap<any>(true);

		const fileA = URI.parse('file://some/filea');
		const fileB = URI.parse('some://some/other/fileb');
		const fileAUpper = URI.parse('file://SOME/FILEA');

		map.set(fileA, 'true');
		assert.equal(map.get(fileA), 'true');

		assert.equal(map.get(fileAUpper), 'true');

		assert.ok(!map.get(fileB));

		map.set(fileAUpper, 'false');
		assert.equal(map.get(fileAUpper), 'false');

		assert.equal(map.get(fileA), 'false');

		const windowsFile = URI.file('c:\\test with %25\\c#code');
		const uncFile = URI.file('\\\\shäres\\path\\c#\\plugin.json');

		map.set(windowsFile, 'true');
		map.set(uncFile, 'true');

		assert.equal(map.get(windowsFile), 'true');
		assert.equal(map.get(uncFile), 'true');
	});
});
