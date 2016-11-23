/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import collections = require('vs/base/common/collections');

suite('Collections', () => {
	test('contains', () => {
		assert(!collections.contains({}, 'toString'));
		assert(collections.contains({ toString: 123 }, 'toString'));
		assert(!collections.contains(Object.create(null), 'toString'));

		var dict = Object.create(null);
		dict['toString'] = 123;
		assert(collections.contains(dict, 'toString'));
	});

	test('forEach', () => {
		collections.forEach({}, () => assert(false));
		collections.forEach(Object.create(null), () => assert(false));

		var count = 0;
		collections.forEach({ toString: 123 }, () => count++);
		assert.equal(count, 1);

		count = 0;
		var dict = Object.create(null);
		dict['toString'] = 123;
		collections.forEach(dict, () => count++);
		assert.equal(count, 1);

		collections.forEach(dict, () => false);

		collections.forEach(dict, (x, remove) => remove());
		assert.equal(dict['toString'], null);

		// don't iterate over properties that are not on the object itself
		let test = Object.create({ 'derived': true });
		collections.forEach(test, () => assert(false));
	});

	test('lookupOrInsert - should not insert if found', () => {
		const property = 123;

		let from = collections.createNumberDictionary();
		from[property] = 'whatever';

		collections.lookupOrInsert(from, property, () => assert(false));
	});

	test('lookupOrInsert - should insert if not found', () => {

		const expected = 'alternate', property = 'test';

		let fromWithValue = collections.createStringDictionary();
		collections.lookupOrInsert(fromWithValue, property, expected);
		assert.equal(fromWithValue[property], expected);

		let fromWithCallback = collections.createStringDictionary();
		collections.lookupOrInsert(fromWithCallback, property, () => expected);
		assert.equal(fromWithCallback[property], expected);
	});

	test('groupBy', () => {

		const group1 = 'a', group2 = 'b';
		const value1 = 1, value2 = 2, value3 = 3;
		let source = [
			{ key: group1, value: value1 },
			{ key: group1, value: value2 },
			{ key: group2, value: value3 },
		];

		let grouped = collections.groupBy(source, x => x.key);

		// Group 1
		assert.equal(grouped[group1].length, 2);
		assert.equal(grouped[group1][0].value, value1);
		assert.equal(grouped[group1][1].value, value2);

		// Group 2
		assert.equal(grouped[group2].length, 1);
		assert.equal(grouped[group2][0].value, value3);
	});

	test('insert', () => {

		const expected = 'value', hashFn = x => x.toString();

		let into = collections.createStringDictionary();
		collections.insert(into, expected, hashFn);

		assert.equal(into[expected], expected);
	});

	test('remove', () => {
		assert(collections.remove({ 'far': 1 }, 'far'));
		assert(!collections.remove({ 'far': 1 }, 'boo'));
	});
});
