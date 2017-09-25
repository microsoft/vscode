/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { LinkedList } from 'vs/base/common/linkedList';

suite('LinkedList', function () {

	function assertElements<E>(list: LinkedList<E>, ...elements: E[]) {
		// first: assert toArray
		assert.deepEqual(list.toArray(), elements);

		// second: assert iterator
		for (let iter = list.iterator(), element = iter.next(); !element.done; element = iter.next()) {
			assert.equal(elements.shift(), element.value);
		}
		assert.equal(elements.length, 0);
	}

	test('Insert/Iter', function () {
		const list = new LinkedList<number>();
		list.insert(0);
		list.insert(1);
		list.insert(2);
		assertElements(list, 0, 1, 2);
	});

	test('Insert/Remove', function () {
		let list = new LinkedList<number>();
		let disp = list.insert(0);
		list.insert(1);
		list.insert(2);
		disp();
		assertElements(list, 1, 2);

		list = new LinkedList<number>();
		list.insert(0);
		disp = list.insert(1);
		list.insert(2);
		disp();
		assertElements(list, 0, 2);

		list = new LinkedList<number>();
		list.insert(0);
		list.insert(1);
		disp = list.insert(2);
		disp();
		assertElements(list, 0, 1);
	});

	test('Insert/toArray', function () {
		let list = new LinkedList<string>();
		list.insert('foo');
		list.insert('bar');
		list.insert('far');
		list.insert('boo');

		assert.deepEqual(
			list.toArray(),
			[
				'foo',
				'bar',
				'far',
				'boo',
			]
		);
	});
});
