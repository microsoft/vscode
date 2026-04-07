/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import sinon from 'sinon';
import { TaskQueue } from '../async';

import { assert, beforeEach, describe, it } from 'vitest';
import { isCancellationError } from '../../vs/base/common/errors';


describe('TaskQueue', () => {
	let taskQueue: TaskQueue;

	beforeEach(() => {
		taskQueue = new TaskQueue();
	});

	it('should schedule and run a single task', async () => {
		const task = sinon.stub().resolves('result');
		const result = await taskQueue.schedule(task);
		sinon.assert.calledOnce(task);
		assert.strictEqual(result, 'result');
	});

	it('should schedule and run multiple tasks in order', async () => {
		const results: string[] = [];
		const task1 = sinon.stub().callsFake(async () => { results.push('task1'); });
		const task2 = sinon.stub().callsFake(async () => { results.push('task2'); });

		await taskQueue.schedule(task1);
		await taskQueue.schedule(task2);

		sinon.assert.callOrder(task1, task2);
		assert.deepStrictEqual(results, ['task1', 'task2']);
	});

	it('should clear pending tasks', async () => {
		try {
			const task1 = sinon.stub().resolves('task1');
			const task2 = sinon.stub().resolves('task2');

			const p1 = taskQueue.schedule(task1);
			const p2 = taskQueue.schedule(task2);
			taskQueue.clearPending();

			sinon.assert.calledOnce(task1);
			sinon.assert.notCalled(task2);
			await p1;
			await p2;
		} catch (e) {
			if (!isCancellationError(e)) {
				throw e;
			}
		}
	});

});
