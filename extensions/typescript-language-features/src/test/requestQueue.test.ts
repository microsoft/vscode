/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { RequestQueue } from '../tsServer/requestQueue';

suite('RequestQueue', () => {
	test('should be empty on creation', async () => {
		const queue = new RequestQueue();
		assert.strictEqual(queue.length, 0);
		assert.strictEqual(queue.shift(), undefined);
	});

	suite('RequestQueue.createRequest', () => {
		test('should create items with increasing sequence numbers', async () => {
			const queue = new RequestQueue();

			for (let i = 0; i < 100; ++i) {
				const command = `command-${i}`;
				const request = queue.createRequest(command, i);
				assert.strictEqual(request.seq, i);
				assert.strictEqual(request.command, command);
				assert.strictEqual(request.arguments, i);
			}
		});
	});

	test('should queue normal requests in first in first out order', async () => {
		const queue = new RequestQueue();
		assert.strictEqual(queue.length, 0);

		const request1 = queue.createRequest('a', 1);
		queue.push({ request: request1, expectsResponse: true, isAsync: false });
		assert.strictEqual(queue.length, 1);

		const request2 = queue.createRequest('b', 2);
		queue.push({ request: request2, expectsResponse: true, isAsync: false });
		assert.strictEqual(queue.length, 2);

		{
			const item = queue.shift();
			assert.strictEqual(queue.length, 1);
			assert.strictEqual(item!.request.command, 'a');
		}
		{
			const item = queue.shift();
			assert.strictEqual(queue.length, 0);
			assert.strictEqual(item!.request.command, 'b');
		}
		{
			const item = queue.shift();
			assert.strictEqual(item, undefined);
			assert.strictEqual(queue.length, 0);
		}
	});

	test('should put normal requests in front of low priority requests', async () => {
		const queue = new RequestQueue();
		assert.strictEqual(queue.length, 0);

		const request1 = queue.createRequest('low', 1);
		queue.push({ request: request1, expectsResponse: true, isAsync: false, lowPriority: true });

		const request2 = queue.createRequest('normal', 2);
		queue.push({ request: request2, expectsResponse: true, isAsync: false });

		{
			const item = queue.shift();
			assert.strictEqual(queue.length, 1);
			assert.strictEqual(item!.request.command, 'normal');
		}
		{
			const item = queue.shift();
			assert.strictEqual(queue.length, 0);
			assert.strictEqual(item!.request.command, 'low');
		}
	});
});

