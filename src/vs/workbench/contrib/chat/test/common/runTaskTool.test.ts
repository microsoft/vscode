/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITaskService } from '../../../tasks/common/taskService.js';
import { Task } from '../../../tasks/common/tasks.js';
import { RunTaskTool, IRunTaskToolInput } from '../../common/tools/runTaskTool.js';

suite('RunTaskTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let mockTaskService: ITaskService;
	let tool: RunTaskTool;

	setup(() => {
		const instantiationService = new TestInstantiationService();

		// Mock task service
		mockTaskService = {
			tasks: async () => [],
			run: async () => ({ exitCode: 0 }),
		} as any;

		instantiationService.stub(ITaskService, mockTaskService);
		tool = store.add(instantiationService.createInstance(RunTaskTool));
	});

	test('resolveToolInput with undefined task should return first available task', async () => {
		// Setup mock tasks
		const mockTasks = [
			{ _label: 'build', type: 'npm' },
			{ _label: 'test', type: 'npm' },
			{ _label: 'start', type: 'npm' },
		] as Task[];

		mockTaskService.tasks = async () => mockTasks;

		const input: IRunTaskToolInput = { task: 'undefined' };
		const resolved = await tool.resolveToolInput(input);

		// Should pick 'start' as it's in the priority list
		assert.strictEqual(resolved.task, 'start');
	});

	test('resolveToolInput with undefined task should pick build if start not available', async () => {
		// Setup mock tasks without start
		const mockTasks = [
			{ _label: 'build', type: 'npm' },
			{ _label: 'test', type: 'npm' },
		] as Task[];

		mockTaskService.tasks = async () => mockTasks;

		const input: IRunTaskToolInput = { task: 'undefined' };
		const resolved = await tool.resolveToolInput(input);

		// Should pick 'build' as it's next in priority
		assert.strictEqual(resolved.task, 'build');
	});

	test('resolveToolInput with undefined task should pick first npm task if no common scripts', async () => {
		// Setup mock tasks with uncommon script names
		const mockTasks = [
			{ _label: 'custom-script', type: 'npm' },
			{ _label: 'another-script', type: 'npm' },
		] as Task[];

		mockTaskService.tasks = async () => mockTasks;

		const input: IRunTaskToolInput = { task: 'undefined' };
		const resolved = await tool.resolveToolInput(input);

		// Should pick first npm task
		assert.strictEqual(resolved.task, 'custom-script');
	});

	test('resolveToolInput with valid task should return unchanged', async () => {
		const input: IRunTaskToolInput = { task: 'my-task' };
		const resolved = await tool.resolveToolInput(input);

		// Should return unchanged
		assert.strictEqual(resolved.task, 'my-task');
	});

	test('resolveToolInput with no tasks should return original input', async () => {
		// Setup empty tasks
		mockTaskService.tasks = async () => [];

		const input: IRunTaskToolInput = { task: 'undefined' };
		const resolved = await tool.resolveToolInput(input);

		// Should return original input when no tasks available
		assert.strictEqual(resolved.task, 'undefined');
	});

	test('invoke with resolved task should call taskService.run', async () => {
		const mockTasks = [
			{ _label: 'start', type: 'npm', configurationProperties: {} },
		] as Task[];

		let runCalled = false;
		let runTask: Task | undefined;

		mockTaskService.tasks = async () => mockTasks;
		mockTaskService.run = async (task) => {
			runCalled = true;
			runTask = task;
			return { exitCode: 0 };
		};

		const result = await tool.invoke(
			{
				parameters: { task: 'start' },
				callId: 'test',
				modelId: 'test',
			} as any,
			async () => 0,
			{ report: () => { } } as any,
			CancellationToken.None
		);

		assert.strictEqual(runCalled, true);
		assert.strictEqual(runTask?._label, 'start');
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok((result.content[0] as any).value.includes('started successfully'));
	});
});