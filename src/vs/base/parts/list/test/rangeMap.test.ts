/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import {
	RangeMap,
	intersect,
	groupIntersect,
	IRangedGroup,
	consolidate
} from '../rangeMap';

suite('RangeMap', () => {
	var rangeMap: RangeMap;

	setup(() => {
		rangeMap = new RangeMap();
	});

	teardown(() => {
		rangeMap.dispose();
	});

	test('intersection', () => {
		assert.deepEqual(intersect({ start: 0, end: 0 }, { start: 0, end: 0 }), null);
		assert.deepEqual(intersect({ start: 0, end: 0 }, { start: 5, end: 5 }), null);
		assert.deepEqual(intersect({ start: 0, end: 1 }, { start: 5, end: 6 }), null);
		assert.deepEqual(intersect({ start: 5, end: 6 }, { start: 0, end: 1 }), null);
		assert.deepEqual(intersect({ start: 0, end: 5 }, { start: 2, end: 2 }), null);
		assert.deepEqual(intersect({ start: 0, end: 1 }, { start: 0, end: 1 }), { start: 0, end: 1 });
		assert.deepEqual(intersect({ start: 0, end: 10 }, { start: 0, end: 5 }), { start: 0, end: 5 });
		assert.deepEqual(intersect({ start: 0, end: 5 }, { start: 0, end: 10 }), { start: 0, end: 5 });
		assert.deepEqual(intersect({ start: 0, end: 10 }, { start: 5, end: 10 }), { start: 5, end: 10 });
		assert.deepEqual(intersect({ start: 5, end: 10 }, { start: 0, end: 10 }), { start: 5, end: 10 });
		assert.deepEqual(intersect({ start: 0, end: 10 }, { start: 2, end: 8 }), { start: 2, end: 8 });
		assert.deepEqual(intersect({ start: 2, end: 8 }, { start: 0, end: 10 }), { start: 2, end: 8 });
		assert.deepEqual(intersect({ start: 0, end: 10 }, { start: 5, end: 15 }), { start: 5, end: 10 });
		assert.deepEqual(intersect({ start: 5, end: 15 }, { start: 0, end: 10 }), { start: 5, end: 10 });
	});

	test('multiIntersect', () => {
		assert.deepEqual(
			groupIntersect(
				{ start: 0, end: 0 },
				[{ range: { start: 0, end: 10 }, size: 1 }]
			),
			[]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 10, end: 20 },
				[{ range: { start: 0, end: 10 }, size: 1 }]
			),
			[]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 2, end: 8 },
				[{ range: { start: 0, end: 10 }, size: 1 }]
			),
			[{ range: { start: 2, end: 8 }, size: 1 }]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 2, end: 8 },
				[{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
			),
			[{ range: { start: 2, end: 8 }, size: 1 }]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 12, end: 18 },
				[{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
			),
			[{ range: { start: 12, end: 18 }, size: 5 }]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 2, end: 18 },
				[{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
			),
			[{ range: { start: 2, end: 10 }, size: 1 }, { range: { start: 10, end: 18 }, size: 5 }]
		);

		assert.deepEqual(
			groupIntersect(
				{ start: 2, end: 28 },
				[{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }, { range: { start: 20, end: 30 }, size: 10 }]
			),
			[{ range: { start: 2, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }, { range: { start: 20, end: 28 }, size: 10 }]
		);
	});

	test('consolidate', () => {
		assert.deepEqual(consolidate([]), []);

		assert.deepEqual(
			consolidate([{ range: { start: 0, end: 10 }, size: 1 }]),
			[{ range: { start: 0, end: 10 }, size: 1 }]
		);

		assert.deepEqual(
			consolidate([
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 20 }, size: 1 }
			]),
			[{ range: { start: 0, end: 20 }, size: 1 }]
		);

		assert.deepEqual(
			consolidate([
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 20 }, size: 1 },
				{ range: { start: 20, end: 100 }, size: 1 }
			]),
			[{ range: { start: 0, end: 100 }, size: 1 }]
		);

		assert.deepEqual(
			consolidate([
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 20 }, size: 5 },
				{ range: { start: 20, end: 30 }, size: 10 }
			]),
			[
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 20 }, size: 5 },
				{ range: { start: 20, end: 30 }, size: 10 }
			]
		);

		assert.deepEqual(
			consolidate([
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 20 }, size: 2 },
				{ range: { start: 20, end: 100 }, size: 2 }
			]),
			[
				{ range: { start: 0, end: 10 }, size: 1 },
				{ range: { start: 10, end: 100 }, size: 2 }
			]
		);
	});

	test('empty', () => {
		assert.equal(rangeMap.size, 0);
		assert.equal(rangeMap.count, 0);
	});

	test('length & count', () => {
		rangeMap.splice(0, 0, { count: 1, size: 1 });
		assert.equal(rangeMap.size, 1);
		assert.equal(rangeMap.count, 1);
	});

	test('length & count #2', () => {
		rangeMap.splice(0, 0, { count: 5, size: 1 });
		assert.equal(rangeMap.size, 5);
		assert.equal(rangeMap.count, 5);
	});

	test('length & count #3', () => {
		rangeMap.splice(0, 0, { count: 1, size: 5 });
		assert.equal(rangeMap.size, 5);
		assert.equal(rangeMap.count, 1);
	});

	test('length & count #4', () => {
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		assert.equal(rangeMap.size, 25);
		assert.equal(rangeMap.count, 5);
	});

	test('insert', () => {
		rangeMap.splice(0, 0, { count: 5, size: 5 });
		assert.equal(rangeMap.size, 25);
		assert.equal(rangeMap.count, 5);

		rangeMap.splice(0, 0, { count: 5, size: 5 });
		assert.equal(rangeMap.size, 50);
		assert.equal(rangeMap.count, 10);

		rangeMap.splice(5, 0, { count: 2, size: 10 });
		assert.equal(rangeMap.size, 70);
		assert.equal(rangeMap.count, 12);

		rangeMap.splice(12, 0, { count: 1, size: 200 });
		assert.equal(rangeMap.size, 270);
		assert.equal(rangeMap.count, 13);
	});

	test('delete', () => {
		rangeMap.splice(0, 0, { count: 20, size: 5 });
		assert.equal(rangeMap.size, 100);
		assert.equal(rangeMap.count, 20);

		rangeMap.splice(10, 5);
		assert.equal(rangeMap.size, 75);
		assert.equal(rangeMap.count, 15);

		rangeMap.splice(0, 1);
		assert.equal(rangeMap.size, 70);
		assert.equal(rangeMap.count, 14);

		rangeMap.splice(1, 13);
		assert.equal(rangeMap.size, 5);
		assert.equal(rangeMap.count, 1);

		rangeMap.splice(1, 1);
		assert.equal(rangeMap.size, 5);
		assert.equal(rangeMap.count, 1);
	});

	test('insert & delete', () => {
		assert.equal(rangeMap.size, 0);
		assert.equal(rangeMap.count, 0);

		rangeMap.splice(0, 0, { count: 1, size: 1 });
		assert.equal(rangeMap.size, 1);
		assert.equal(rangeMap.count, 1);

		rangeMap.splice(0, 1);
		assert.equal(rangeMap.size, 0);
		assert.equal(rangeMap.count, 0);
	});
});