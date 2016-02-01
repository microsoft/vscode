/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { RangeMap } from '../rangeMap';

suite('RangeMap', () => {
	var rangeMap: RangeMap;

	setup(() => {
		rangeMap = new RangeMap();
	});

	teardown(() => {
		rangeMap.dispose();
	});

	test('empty', () => {
		assert.equal(rangeMap.length, 0);
		assert.equal(rangeMap.count, 0);
	});

	test('length & count', () => {
		rangeMap.splice(0, 0, { count: 1, size: 1 });
		assert.equal(rangeMap.length, 1);
		assert.equal(rangeMap.count, 1);
	});

	test('length & count #2', () => {
		rangeMap.splice(0, 0, { count: 5, size: 1 });
		assert.equal(rangeMap.length, 5);
		assert.equal(rangeMap.count, 5);
	});

	test('length & count #3', () => {
		rangeMap.splice(0, 0, { count: 1, size: 5 });
		assert.equal(rangeMap.length, 5);
		assert.equal(rangeMap.count, 1);
	});

	test('length & count #4', () => {
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		assert.equal(rangeMap.length, 25);
		assert.equal(rangeMap.count, 5);
	});

	test('insert', () => {
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		assert.equal(rangeMap.length, 50);
		assert.equal(rangeMap.count, 10);
	});

	test('delete', () => {
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		rangeMap.splice(0, 5, { count: 5, size: 5 });
		assert.equal(rangeMap.length, 25);
		assert.equal(rangeMap.count, 5);
	});
});
