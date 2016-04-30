/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Cache} from 'vs/base/common/cache';
import * as assert from 'assert';

suite('Cache', () => {
	test('cache - basics', function () {
		const cache = new Cache<any>(Number.MAX_VALUE);

		assert.equal(cache.size, 0);

		cache.set('1', 1);
		cache.set('2', '2');
		cache.set('3', true);

		const obj = Object.create(null);
		cache.set('4', obj);

		const date = Date.now();
		cache.set('5', date);

		assert.equal(cache.size, 5);
		assert.equal(cache.get('1'), 1);
		assert.equal(cache.get('2'), '2');
		assert.equal(cache.get('3'), true);
		assert.equal(cache.get('4'), obj);
		assert.equal(cache.get('5'), date);
		assert.ok(!cache.get('6'));

		cache.remove('6');
		assert.equal(cache.size, 5);
		assert.equal(cache.remove('1'), 1);
		assert.equal(cache.remove('2'), '2');
		assert.equal(cache.remove('3'), true);
		assert.equal(cache.remove('4'), obj);
		assert.equal(cache.remove('5'), date);

		assert.equal(cache.size, 0);
		assert.ok(!cache.get('5'));
		assert.ok(!cache.get('4'));
		assert.ok(!cache.get('3'));
		assert.ok(!cache.get('2'));
		assert.ok(!cache.get('1'));

		cache.set('1', 1);
		cache.set('2', '2');
		assert.ok(cache.set('3', true)); // adding an element returns true
		assert.ok(!cache.set('3', true)); // adding it again returns false

		assert.equal(cache.get('1'), 1);
		assert.equal(cache.get('2'), '2');
		assert.equal(cache.get('3'), true);

		cache.clear();

		assert.equal(cache.size, 0);
		assert.ok(!cache.get('1'));
		assert.ok(!cache.get('2'));
		assert.ok(!cache.get('3'));
	});

	test('cache - bounded', function () {
		const cache = new Cache<number>(5);

		cache.set('1', 1);
		cache.set('2', 2);
		cache.set('3', 3);
		cache.set('4', 4);
		cache.set('5', 5);

		assert.equal(5, cache.size);

		assert.equal(cache.get('1'), 1);
		assert.equal(cache.get('2'), 2);
		assert.equal(cache.get('3'), 3);
		assert.equal(cache.get('4'), 4);
		assert.equal(cache.get('5'), 5);

		cache.set('6', 6);

		assert.equal(5, cache.size);
		assert.ok(!cache.get('1'));
		assert.equal(cache.get('2'), 2);
		assert.equal(cache.get('3'), 3);
		assert.equal(cache.get('4'), 4);
		assert.equal(cache.get('5'), 5);
		assert.equal(cache.get('6'), 6);

		cache.set('7', 7);
		cache.set('8', 8);
		cache.set('9', 9);

		assert.equal(5, cache.size);
		assert.ok(!cache.get('1'));
		assert.ok(!cache.get('2'));
		assert.ok(!cache.get('3'));
		assert.ok(!cache.get('4'));

		assert.equal(cache.get('5'), 5);
		assert.equal(cache.get('6'), 6);
		assert.equal(cache.get('7'), 7);
		assert.equal(cache.get('8'), 8);
		assert.equal(cache.get('9'), 9);

		cache.remove('5');
		cache.remove('7');

		assert.equal(3, cache.size);
		assert.ok(!cache.get('5'));
		assert.ok(!cache.get('7'));
		assert.equal(cache.get('6'), 6);
		assert.equal(cache.get('8'), 8);
		assert.equal(cache.get('9'), 9);

		cache.set('10', 10);
		cache.set('11', 11);
		cache.set('12', 12);
		cache.set('13', 13);
		cache.set('14', 14);

		assert.equal(5, cache.size);
		assert.equal(cache.get('10'), 10);
		assert.equal(cache.get('11'), 11);
		assert.equal(cache.get('12'), 12);
		assert.equal(cache.get('13'), 13);
		assert.equal(cache.get('14'), 14);
	});
});
