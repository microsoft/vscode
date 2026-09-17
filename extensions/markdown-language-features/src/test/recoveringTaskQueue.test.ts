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

	test('reload barriers preserve tasks accepted while waiting', async () => {
		const operations: string[] = [];
		const queue = new RecoveringTaskQueue(
			async () => { throw new Error('Unexpected task failure'); },
			error => operations.push(error instanceof Error ? error.message : String(error)),
		);
		let finishFirstTask!: () => void;
		const firstTaskGate = new Promise<void>(resolve => finishFirstTask = resolve);

		const accepted = queue.enqueue(0, async () => {
			operations.push('accepted:start');
			await firstTaskGate;
			operations.push('accepted:end');
		});
		const barrier = queue.enqueueBarrier(epoch => { operations.push(`reload:${epoch}`); });
		const acceptedWhileWaiting = queue.enqueue(0, async () => { operations.push('accepted:while-waiting'); });
		finishFirstTask();
		await Promise.all([accepted, acceptedWhileWaiting, barrier]);

		assert.deepStrictEqual({
			epoch: queue.epoch,
			operations,
		}, {
			epoch: 1,
			operations: ['accepted:start', 'accepted:end', 'accepted:while-waiting', 'reload:1'],
		});
	});

	test('reload barriers skip stale tasks enqueued after they start', async () => {
		const operations: string[] = [];
		const queue = new RecoveringTaskQueue(
			async () => { throw new Error('Unexpected task failure'); },
			error => operations.push(error instanceof Error ? error.message : String(error)),
		);
		let barrierStarted!: () => void;
		const barrierStartedPromise = new Promise<void>(resolve => barrierStarted = resolve);
		let finishBarrier!: () => void;
		const barrierGate = new Promise<void>(resolve => finishBarrier = resolve);

		const barrier = queue.enqueueBarrier(async epoch => {
			operations.push(`reload:${epoch}`);
			barrierStarted();
			await barrierGate;
		});
		await barrierStartedPromise;
		const stale = queue.enqueue(0, async () => { operations.push('stale'); });
		finishBarrier();
		await Promise.all([barrier, stale]);

		assert.deepStrictEqual({
			epoch: queue.epoch,
			operations,
		}, {
			epoch: 1,
			operations: ['reload:1'],
		});
	});
});
