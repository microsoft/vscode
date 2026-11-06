/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { PriorityQueue } from '../priorityQueue';

suite('PriorityQueue', function () {
	test('should initialize with size 0', function () {
		const queue = new PriorityQueue<string>();
		assert.equal(queue.size, 0);
	});

	test('peek should return null for empty queue', function () {
		const queue = new PriorityQueue<string>();
		assert.equal(queue.peek(), null);
	});

	test('pop should return null for empty queue', function () {
		const queue = new PriorityQueue<string>();
		assert.equal(queue.pop(), null);
	});

	test('should insert and peek highest priority item', function () {
		const queue = new PriorityQueue<string>();
		queue.insert('low', 1);
		queue.insert('high', 10);
		queue.insert('medium', 5);

		const result = queue.peek();
		assert.equal(result?.item, 'high');
		assert.equal(result?.priority, 10);
		assert.equal(queue.size, 3);
	});

	test('should pop items in priority order', function () {
		const queue = new PriorityQueue<string>();
		queue.insert('low', 1);
		queue.insert('high', 10);
		queue.insert('medium', 5);

		let result = queue.pop();
		assert.equal(result?.item, 'high');
		assert.equal(result?.priority, 10);
		assert.equal(queue.size, 2);

		result = queue.pop();
		assert.equal(result?.item, 'medium');
		assert.equal(result?.priority, 5);
		assert.equal(queue.size, 1);

		result = queue.pop();
		assert.equal(result?.item, 'low');
		assert.equal(result?.priority, 1);
		assert.equal(queue.size, 0);

		result = queue.pop();
		assert.equal(result, null);
	});

	test('should handle items with same priority', function () {
		const queue = new PriorityQueue<string>();
		queue.insert('first', 5);
		queue.insert('second', 5);
		queue.insert('third', 1);

		// The highest priority item could be either 'first' or 'second' depending on implementation
		// but we can at least ensure it's one of them with priority 5
		const result = queue.peek();
		assert.equal(result?.priority, 5);
		assert.ok(result?.item === 'first' || result?.item === 'second');
	});

	test('should handle multiple operations in sequence', function () {
		const queue = new PriorityQueue<string>();

		queue.insert('a', 1);
		queue.insert('b', 2);
		queue.insert('c', 3);

		assert.equal(queue.size, 3);
		assert.equal(queue.peek()?.item, 'c');

		queue.pop(); // removes 'c'
		assert.equal(queue.size, 2);
		assert.equal(queue.peek()?.item, 'b');

		queue.insert('d', 10);
		assert.equal(queue.peek()?.item, 'd');

		queue.pop(); // removes 'd'
		assert.equal(queue.peek()?.item, 'b');
		queue.insert('e', 1);
		assert.equal(queue.peek()?.item, 'b');

		assert.equal(queue.size, 3);
		queue.pop();
		queue.pop();
		queue.pop();
		assert.equal(queue.size, 0);
		assert.equal(queue.pop(), null);
	});

	test('should handle object items with custom identities', function () {
		interface TestObject {
			id: string;
			value: number;
		}

		const obj1 = { id: '1', value: 100 };
		const obj2 = { id: '2', value: 200 };

		const queue = new PriorityQueue<TestObject>();
		queue.insert(obj1, 5);
		queue.insert(obj2, 10);

		assert.equal(queue.peek()?.item, obj2);
	});

	test('should work for a large number of items', function () {
		const queue = new PriorityQueue<number>();
		const n = 1000;
		for (let i = 0; i < n; i++) {
			queue.insert(i, i);
		}

		for (let i = n - 1; i >= 0; i--) {
			const result = queue.pop();
			assert.equal(result?.item, i);
			assert.equal(result?.priority, i);
		}
	});
});
