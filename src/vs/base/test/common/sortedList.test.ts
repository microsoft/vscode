/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import SortedList = require('vs/base/common/sortedList');

function getCuisineKeys(): string[] {
	return ['german', 'swiss', 'french', 'italian', 'english','scotish', 'turksih', 'hungarian', 'serbian', 'swedish', 'russian',
		'portugesse', 'american', 'japenesse', 'chinesse', 'bosnian', 'makedonian', 'libanese', 'mexican', 'thailand'];
}

function getCuisineValues(): string[] {
	return ['beer', 'cheese', 'wine', 'pizza', 'chips', 'whiskey', 'kebab', 'gulash', 'pljeska', 'salmon', 'vodka',
		'shrimp', 'burger', 'susshi', 'sechuan', 'cevapcici', 'burek', 'falafel', 'burito', 'curryduck'];
}

function shouldThrow(func: (key: any) => any, key: any): void {
	try {
		func(key);
		assert(false);
	} catch (e) {
		assert(true);
	}
}

var keys = getCuisineKeys();
var values = getCuisineValues();

function getCuisineList(withoutIterator:boolean = false): SortedList.ISortedList<string, string> {
	var result = new SortedList.SortedList<string, string>(withoutIterator ? null : (first: string, second: string) => {
		return first.localeCompare(second);
	});
	for (var i = 0; i < keys.length; i++) {
		result.add(keys[i], values[i]);
	}

	return result;
}

suite('SortedList', () => {
	test('sorted list add', function() {
		var sortedList = getCuisineList();
		assert.equal(sortedList.count, keys.length);

		for (var i = 0; i < keys.length; i++) {
			assert.equal(sortedList.getValue(keys[i]), values[i]);
			assert(sortedList.indexOfKey(keys[i]) >= 0);
			assert.notEqual(sortedList.getValueByIndex(i), null);
		}
	});

	test('sorted list add with default comparator', function() {
		var sortedList = getCuisineList(true /* without comparator */);
		assert.equal(sortedList.count, keys.length);

		for (var i = 0; i < keys.length; i++) {
			assert.equal(sortedList.getValue(keys[i]), values[i]);
			assert(sortedList.indexOfKey(keys[i]) >= 0);
			assert.notEqual(sortedList.getValueByIndex(i), null);
		}
	});

	test('sorted list remove', function() {
		var sortedList = getCuisineList();
		for (var i = 0; i < keys.length; i++) {
			assert(sortedList.remove(keys[i]));
		}
		assert.equal(sortedList.count, 0);
	});

	test('sorted list iterator', function() {
		var sortedList = getCuisineList();
		// <any> cast due to TS bug.
		var iterator = <any>sortedList.getIterator();
		var elementCount = 0;
		while (iterator.moveNext()) {
			elementCount++;
			assert(keys.indexOf(iterator.current.key) >= 0);
			assert(values.indexOf(iterator.current.value) >= 0);
		}
		assert.equal(elementCount, sortedList.count);

		iterator.reset();
		elementCount = 0;
		assert(iterator.hasNext());
		while (iterator.moveNext()) {
			elementCount++;
			assert(keys.indexOf(iterator.current.key) >= 0);
			assert(values.indexOf(iterator.current.value) >= 0);
		}
		assert(!iterator.hasNext());
		assert.equal(elementCount, sortedList.count);
	});

	test('sorted list bad op', function() {
		var sortedList = getCuisineList();
		assert.equal(sortedList.getKey(127), null);
		assert.equal(sortedList.getKey(-1), null);
		assert.equal(sortedList.getValue('banana'), null);
		assert.equal(sortedList.remove('unexistingKey'), false);
		assert.equal(sortedList.getValueByIndex(-4), null);
		assert.equal(sortedList.getValueByIndex(1114), null);
		assert.equal(sortedList.indexOfKey('fakeKey'), -1);
		shouldThrow(sortedList.indexOfKey, null);
		shouldThrow(sortedList.getValue, null);
		shouldThrow(sortedList.remove, null);
	});
});