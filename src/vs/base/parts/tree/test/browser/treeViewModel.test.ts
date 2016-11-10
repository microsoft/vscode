/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import { ArrayIterator } from 'vs/base/common/iterator';
import { HeightMap, IViewItem } from 'vs/base/parts/tree/browser/treeViewModel';

function makeItem(id, height): any {
	return {
		id: id,
		getHeight: function () { return height; },
		isExpanded: function () { return false; },
		getAllTraits: () => []
	};
}

function makeItems(...args: any[]) {
	var r = [];

	for (var i = 0; i < args.length; i += 2) {
		r.push(makeItem(args[i], args[i + 1]));
	}

	return r;
}

function makeNavigator(...args: any[]): any {
	var items = makeItems.apply(null, args);
	var i = 0;

	return {
		next: function () {
			return items[i++] || null;
		}
	};
}

class TestHeightMap extends HeightMap {

	protected createViewItem(item: any): IViewItem {
		return {
			model: item,
			top: 0,
			height: item.getHeight()
		};
	}
}

suite('TreeView - HeightMap', () => {
	var rangeMap: HeightMap;

	setup(() => {
		rangeMap = new TestHeightMap();
		rangeMap.onInsertItems(makeNavigator('a', 3, 'b', 30, 'c', 25, 'd', 2));
	});

	teardown(() => {
		rangeMap.dispose();
		rangeMap = null;
	});

	test('simple', () => {
		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(32), 'b');
		assert.equal(rangeMap.itemAt(33), 'c');
		assert.equal(rangeMap.itemAt(40), 'c');
		assert.equal(rangeMap.itemAt(57), 'c');
		assert.equal(rangeMap.itemAt(58), 'd');
		assert.equal(rangeMap.itemAt(59), 'd');
		assert.throws(() => rangeMap.itemAt(60));
	});

	test('onInsertItems at beginning', () => {
		var navigator = makeNavigator('x', 4, 'y', 20, 'z', 8);
		rangeMap.onInsertItems(navigator);

		assert.equal(rangeMap.itemAt(0), 'x');
		assert.equal(rangeMap.itemAt(3), 'x');
		assert.equal(rangeMap.itemAt(4), 'y');
		assert.equal(rangeMap.itemAt(23), 'y');
		assert.equal(rangeMap.itemAt(24), 'z');
		assert.equal(rangeMap.itemAt(31), 'z');
		assert.equal(rangeMap.itemAt(32), 'a');
		assert.equal(rangeMap.itemAt(34), 'a');
		assert.equal(rangeMap.itemAt(35), 'b');
		assert.equal(rangeMap.itemAt(64), 'b');
		assert.equal(rangeMap.itemAt(65), 'c');
		assert.equal(rangeMap.itemAt(89), 'c');
		assert.equal(rangeMap.itemAt(90), 'd');
		assert.equal(rangeMap.itemAt(91), 'd');
		assert.throws(() => rangeMap.itemAt(92));
	});

	test('onInsertItems in middle', () => {
		var navigator = makeNavigator('x', 4, 'y', 20, 'z', 8);
		rangeMap.onInsertItems(navigator, 'a');

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'x');
		assert.equal(rangeMap.itemAt(6), 'x');
		assert.equal(rangeMap.itemAt(7), 'y');
		assert.equal(rangeMap.itemAt(26), 'y');
		assert.equal(rangeMap.itemAt(27), 'z');
		assert.equal(rangeMap.itemAt(34), 'z');
		assert.equal(rangeMap.itemAt(35), 'b');
		assert.equal(rangeMap.itemAt(64), 'b');
		assert.equal(rangeMap.itemAt(65), 'c');
		assert.equal(rangeMap.itemAt(89), 'c');
		assert.equal(rangeMap.itemAt(90), 'd');
		assert.equal(rangeMap.itemAt(91), 'd');
		assert.throws(() => rangeMap.itemAt(92));
	});

	test('onInsertItems at end', () => {
		var navigator = makeNavigator('x', 4, 'y', 20, 'z', 8);
		rangeMap.onInsertItems(navigator, 'd');

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(32), 'b');
		assert.equal(rangeMap.itemAt(33), 'c');
		assert.equal(rangeMap.itemAt(57), 'c');
		assert.equal(rangeMap.itemAt(58), 'd');
		assert.equal(rangeMap.itemAt(59), 'd');
		assert.equal(rangeMap.itemAt(60), 'x');
		assert.equal(rangeMap.itemAt(63), 'x');
		assert.equal(rangeMap.itemAt(64), 'y');
		assert.equal(rangeMap.itemAt(83), 'y');
		assert.equal(rangeMap.itemAt(84), 'z');
		assert.equal(rangeMap.itemAt(91), 'z');
		assert.throws(() => rangeMap.itemAt(92));
	});

	test('onRemoveItems at beginning', () => {
		rangeMap.onRemoveItems(new ArrayIterator(['a', 'b']));

		assert.equal(rangeMap.itemAt(0), 'c');
		assert.equal(rangeMap.itemAt(24), 'c');
		assert.equal(rangeMap.itemAt(25), 'd');
		assert.equal(rangeMap.itemAt(26), 'd');
		assert.throws(() => rangeMap.itemAt(27));
	});

	test('onRemoveItems in middle', () => {
		rangeMap.onRemoveItems(new ArrayIterator(['c']));

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(32), 'b');
		assert.equal(rangeMap.itemAt(33), 'd');
		assert.equal(rangeMap.itemAt(34), 'd');
		assert.throws(() => rangeMap.itemAt(35));
	});

	test('onRemoveItems at end', () => {
		rangeMap.onRemoveItems(new ArrayIterator(['c', 'd']));

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(32), 'b');
		assert.throws(() => rangeMap.itemAt(33));
	});

	test('onRefreshItems at beginning', () => {
		var navigator = makeNavigator('a', 1, 'b', 1);
		rangeMap.onRefreshItems(navigator);

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(1), 'b');
		assert.equal(rangeMap.itemAt(2), 'c');
		assert.equal(rangeMap.itemAt(26), 'c');
		assert.equal(rangeMap.itemAt(27), 'd');
		assert.equal(rangeMap.itemAt(28), 'd');
		assert.throws(() => rangeMap.itemAt(29));
	});

	test('onRefreshItems in middle', () => {
		var navigator = makeNavigator('b', 40, 'c', 4);
		rangeMap.onRefreshItems(navigator);

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(42), 'b');
		assert.equal(rangeMap.itemAt(43), 'c');
		assert.equal(rangeMap.itemAt(46), 'c');
		assert.equal(rangeMap.itemAt(47), 'd');
		assert.equal(rangeMap.itemAt(48), 'd');
		assert.throws(() => rangeMap.itemAt(49));
	});

	test('onRefreshItems at end', () => {
		var navigator = makeNavigator('d', 22);
		rangeMap.onRefreshItems(navigator);

		assert.equal(rangeMap.itemAt(0), 'a');
		assert.equal(rangeMap.itemAt(2), 'a');
		assert.equal(rangeMap.itemAt(3), 'b');
		assert.equal(rangeMap.itemAt(32), 'b');
		assert.equal(rangeMap.itemAt(33), 'c');
		assert.equal(rangeMap.itemAt(57), 'c');
		assert.equal(rangeMap.itemAt(58), 'd');
		assert.equal(rangeMap.itemAt(79), 'd');
		assert.throws(() => rangeMap.itemAt(80));
	});

	test('withItemsInRange', () => {
		var i = 0;
		var itemsInRange = ['a', 'b'];
		rangeMap.withItemsInRange(2, 27, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['a', 'b'];
		rangeMap.withItemsInRange(0, 3, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['a'];
		rangeMap.withItemsInRange(0, 2, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['a'];
		rangeMap.withItemsInRange(0, 2, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['b', 'c'];
		rangeMap.withItemsInRange(15, 39, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['a', 'b', 'c', 'd'];
		rangeMap.withItemsInRange(1, 58, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);

		i = 0;
		itemsInRange = ['c', 'd'];
		rangeMap.withItemsInRange(45, 58, function (item) { assert.equal(item, itemsInRange[i++]); });
		assert.equal(i, itemsInRange.length);
	});
});
