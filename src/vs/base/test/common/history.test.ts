/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { HistoryNavigator } from 'vs/base/common/history';

suite('History Navigator', () => {

	test('create reduces the input to limit', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 2);

		assert.deepEqual(['3', '4'], toArray(testObject));
	});

	test('create sets the position to last', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		assert.equal('4', testObject.current());
		assert.equal(null, testObject.next());
		assert.equal('3', testObject.previous());
	});

	test('last returns last element', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();

		assert.equal('4', testObject.last());
	});

	test('first returns first element', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		assert.equal('2', testObject.first());
	});

	test('next returns next element', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();

		assert.equal('3', testObject.next());
		assert.equal('4', testObject.next());
		assert.equal(null, testObject.next());
	});

	test('previous returns previous element', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		assert.equal('3', testObject.previous());
		assert.equal('2', testObject.previous());
		assert.equal(null, testObject.previous());
	});

	test('next on last element returs null and remains on last', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();
		testObject.last();

		assert.equal('4', testObject.current());
		assert.equal(null, testObject.next());
	});

	test('previous on first element returs null and remains on first', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();

		assert.equal('2', testObject.current());
		assert.equal(null, testObject.previous());
	});

	test('add reduces the input to limit', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 2);

		testObject.add('5');

		assert.deepEqual(['4', '5'], toArray(testObject));
	});

	test('adding existing element changes the position', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 2);

		testObject.add('2');

		assert.deepEqual(['4', '2'], toArray(testObject));
	});

	test('add resets the navigator to last', function () {
		let testObject = new HistoryNavigator(['1', '2', '3', '4'], 3);

		testObject.first();
		testObject.add('5');

		assert.equal('5', testObject.current());
		assert.equal(null, testObject.next());
	});

	test('adding an existing item changes the order', function () {
		let testObject = new HistoryNavigator(['1', '2', '3']);

		testObject.add('1');

		assert.deepEqual(['2', '3', '1'], toArray(testObject));
	});

	function toArray(historyNavigator: HistoryNavigator<string>): string[] {
		let result = [];
		historyNavigator.first();
		if (historyNavigator.current()) {
			do {
				result.push(historyNavigator.current());
			} while (historyNavigator.next());
		}
		return result;
	}
});

