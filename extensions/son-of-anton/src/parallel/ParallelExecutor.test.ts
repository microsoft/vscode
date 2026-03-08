/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ParallelExecutor, ParallelTask } from './ParallelExecutor';

describe('ParallelExecutor', () => {
	let executor: ParallelExecutor;

	beforeEach(() => {
		executor = new ParallelExecutor({
			repoRoot: '/tmp/test-repo',
			lockHost: 'localhost',
			lockPort: 6379,
			maxConcurrent: 2,
		});
	});

	afterEach(async () => {
		await executor.dispose();
	});

	describe('planExecution', () => {
		test('non-overlapping tasks are parallelized', () => {
			const tasks: ParallelTask[] = [
				{ id: 't1', agentId: 'agent-1', instruction: 'Update auth', scopeFiles: ['auth.ts'], dependencies: [] },
				{ id: 't2', agentId: 'agent-2', instruction: 'Update config', scopeFiles: ['config.ts'], dependencies: [] },
			];

			const plan = executor.planExecution(tasks);
			assert.deepStrictEqual(
				{
					parallelCount: plan.parallel.length,
					serializedCount: plan.serialized.length,
					parallelIds: plan.parallel.map(t => t.id).sort(),
				},
				{
					parallelCount: 2,
					serializedCount: 0,
					parallelIds: ['t1', 't2'],
				},
			);
		});

		test('overlapping tasks are serialized', () => {
			const tasks: ParallelTask[] = [
				{ id: 't1', agentId: 'agent-1', instruction: 'Update auth', scopeFiles: ['auth.ts', 'shared.ts'], dependencies: [] },
				{ id: 't2', agentId: 'agent-2', instruction: 'Update config', scopeFiles: ['config.ts', 'shared.ts'], dependencies: [] },
			];

			const plan = executor.planExecution(tasks);
			assert.deepStrictEqual(
				{
					parallelCount: plan.parallel.length,
					serializedCount: plan.serialized.length,
					serializedId: plan.serialized[0]?.id,
				},
				{
					parallelCount: 1,
					serializedCount: 1,
					serializedId: 't2',
				},
			);
		});

		test('tasks with dependencies are serialized', () => {
			const tasks: ParallelTask[] = [
				{ id: 't1', agentId: 'agent-1', instruction: 'Create interface', scopeFiles: ['types.ts'], dependencies: [] },
				{ id: 't2', agentId: 'agent-2', instruction: 'Implement interface', scopeFiles: ['impl.ts'], dependencies: ['t1'] },
			];

			const plan = executor.planExecution(tasks);
			assert.deepStrictEqual(
				{
					parallelCount: plan.parallel.length,
					serializedCount: plan.serialized.length,
					hasReason: plan.serializationReasons.has('t2'),
				},
				{
					parallelCount: 1,
					serializedCount: 1,
					hasReason: true,
				},
			);
		});

		test('three tasks with partial overlap produces correct grouping', () => {
			const tasks: ParallelTask[] = [
				{ id: 't1', agentId: 'agent-1', instruction: 'Task 1', scopeFiles: ['a.ts'], dependencies: [] },
				{ id: 't2', agentId: 'agent-2', instruction: 'Task 2', scopeFiles: ['b.ts'], dependencies: [] },
				{ id: 't3', agentId: 'agent-3', instruction: 'Task 3', scopeFiles: ['a.ts'], dependencies: [] },
			];

			const plan = executor.planExecution(tasks);
			assert.deepStrictEqual(
				{
					parallelCount: plan.parallel.length,
					serializedCount: plan.serialized.length,
				},
				{
					parallelCount: 2,
					serializedCount: 1,
				},
			);
		});
	});

	describe('getLockStatus', () => {
		test('returns empty array when no locks held', () => {
			const status = executor.getLockStatus();
			assert.deepStrictEqual(status, []);
		});
	});
});
