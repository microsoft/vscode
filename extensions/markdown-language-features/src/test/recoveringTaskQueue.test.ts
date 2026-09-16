/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { RecoveringTaskQueue } from '../preview/recoveringTaskQueue';

suite('RecoveringTaskQueue', () => {
	test('invalidates stale tasks after a queued task fails', async () => {
		const errors: unknown[] = [];
		const operations: string[] = [];
		const recoveryEpochs: number[] = [];
		const queue = new RecoveringTaskQueue(
			async (error, epoch) => {
				errors.push(error);
				recoveryEpochs.push(epoch);
			},
			error => errors.push(error),
		);

		const failed = queue.enqueue(0, async () => { throw new Error('failed'); });
		const stale = queue.enqueue(0, async () => { operations.push('stale'); });
		await Promise.all([failed, stale]);
		await queue.enqueue(queue.epoch, async () => { operations.push('fresh'); });

		assert.deepStrictEqual({
			errors: errors.map(error => error instanceof Error ? error.message : String(error)),
			epoch: queue.epoch,
			recoveryEpochs,
			operations,
		}, {
			errors: ['failed'],
			epoch: 1,
			recoveryEpochs: [1],
			operations: ['fresh'],
		});
	});

	test('reload barriers preserve accepted tasks and invalidate later stale tasks', async () => {
		const operations: string[] = [];
		const queue = new RecoveringTaskQueue(
			async () => { throw new Error('Unexpected task failure'); },
			error => operations.push(error instanceof Error ? error.message : String(error)),
		);

		const accepted = queue.enqueue(0, async () => { operations.push('accepted'); });
		const barrier = queue.enqueueBarrier(epoch => { operations.push(`reload:${epoch}`); });
		const stale = queue.enqueue(0, async () => { operations.push('stale'); });
		await Promise.all([accepted, barrier, stale]);

		assert.deepStrictEqual({
			epoch: queue.epoch,
			operations,
		}, {
			epoch: 1,
			operations: ['accepted', 'reload:1'],
		});
	});
});
