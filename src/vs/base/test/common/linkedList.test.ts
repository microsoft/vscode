/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	test('Push/Iter', () => {
		const list = new LinkedList<number>();
		list.push(0);
		list.push(1);
		list.push(2);
		assertElements(list, 0, 1, 2);
	});

	test('Push/Remove', () => {
		let list = new LinkedList<number>();
		let disp = list.push(0);
		list.push(1);
		list.push(2);
		disp();
		assertElements(list, 1, 2);

		list = new LinkedList<number>();
		list.push(0);
		disp = list.push(1);
		list.push(2);
		disp();
		assertElements(list, 0, 2);

		list = new LinkedList<number>();
		list.push(0);
		list.push(1);
		disp = list.push(2);
		disp();
		assertElements(list, 0, 1);
	});

	test('Push/toArray', () => {
		let list = new LinkedList<string>();
		list.push('foo');
		list.push('bar');
		list.push('far');
		list.push('boo');

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

	test('unshift/Iter', () => {
		const list = new LinkedList<number>();
		list.unshift(0);
		list.unshift(1);
		list.unshift(2);
		assertElements(list, 2, 1, 0);
	});

	test('unshift/Remove', () => {
		let list = new LinkedList<number>();
		let disp = list.unshift(0);
		list.unshift(1);
		list.unshift(2);
		disp();
		assertElements(list, 2, 1);

		list = new LinkedList<number>();
		list.unshift(0);
		disp = list.unshift(1);
		list.unshift(2);
		disp();
		assertElements(list, 2, 0);

		list = new LinkedList<number>();
		list.unshift(0);
		list.unshift(1);
		disp = list.unshift(2);
		disp();
		assertElements(list, 1, 0);
	});

	test('unshift/toArray', () => {
		let list = new LinkedList<string>();
		list.unshift('foo');
		list.unshift('bar');
		list.unshift('far');
		list.unshift('boo');

		assert.deepEqual(
			list.toArray(),
			[
				'boo',
				'far',
				'bar',
				'foo',
			]
		);
	});
});
