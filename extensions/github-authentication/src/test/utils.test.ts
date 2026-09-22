/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Sequencer } from '../common/utils';

suite('Sequencer', () => {
	test('runs each task only after the preceding task completes', async () => {
		const sequencer = new Sequencer();
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const order: string[] = [];
		const first = sequencer.queue(async () => {
			order.push('first started');
			started.resolve();
			await release.promise;
			order.push('first completed');
			return 1;
		});
		const second = sequencer.queue(async () => {
			order.push('second');
			return 2;
		});
		await started.promise;
		const whileBlocked = [...order];
		release.resolve();
		const values = await Promise.all([first, second]);

		assert.deepStrictEqual({ whileBlocked, order, values }, {
			whileBlocked: ['first started'],
			order: ['first started', 'first completed', 'second'],
			values: [1, 2],
		});
	});

	for (const synchronous of [true, false]) {
		test(`reports ${synchronous ? 'a synchronous' : 'an asynchronous'} failure without blocking the next task`, async () => {
			const sequencer = new Sequencer();
			const failure = new Error('mutation failed');
			const failed = sequencer.queue(() => {
				if (synchronous) {
					throw failure;
				}
				return Promise.reject(failure);
			});
			const next = sequencer.queue(async () => 'next task');

			await assert.rejects(failed, failure);
			assert.strictEqual(await next, 'next task');
		});
	}
});
