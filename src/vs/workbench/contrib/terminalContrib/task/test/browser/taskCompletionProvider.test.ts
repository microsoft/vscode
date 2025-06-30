/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomTask } from '../../../../tasks/common/tasks.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { TerminalCompletionItemKind } from '../../../suggest/browser/terminalCompletionItem.js';
import { TaskCompletionProvider } from '../../browser/taskCompletionProvider.js';

suite('TaskCompletionProvider', () => {
	let taskService: ITaskService;
	let provider: TaskCompletionProvider;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		// Mock task service
		taskService = {
			getKnownTasks: async () => [
				{
					_id: 'task1',
					_label: 'build',
					_source: { label: 'npm', kind: 'workspace' },
					configurationProperties: { detail: 'Build the project' }
				} as CustomTask,
				{
					_id: 'task2',
					_label: 'test',
					_source: { label: 'npm', kind: 'workspace' },
					configurationProperties: { detail: 'Run tests' }
				} as CustomTask,
				{
					_id: 'task3',
					_label: 'vs code build',
					_source: { label: 'workspace', kind: 'workspace' },
					configurationProperties: { detail: 'Build VS Code' }
				} as CustomTask
			]
		} as any;

		provider = new TaskCompletionProvider(taskService);
	});

	test('should provide all completions for single word input', async () => {
		const completions = await provider.provideCompletions('bu', 2, true, CancellationToken.None);

		// With the new implementation, all tasks are returned and filtering is done by the suggest system
		strictEqual(completions.length, 3);
		strictEqual(completions[0].label, 'build');
		strictEqual(completions[0].kind, TerminalCompletionItemKind.VscodeCommand);
		strictEqual(completions[0].command?.id, 'workbench.action.tasks.runTask');
		strictEqual(completions[1].label, 'test');
		strictEqual(completions[2].label, 'vs code build');
	});

	test('should provide all completions for any single word input', async () => {
		const completions = await provider.provideCompletions('code', 4, true, CancellationToken.None);

		// All tasks should be returned for single word input
		strictEqual(completions.length, 3);
		strictEqual(completions[0].label, 'build');
		strictEqual(completions[1].label, 'test');
		strictEqual(completions[2].label, 'vs code build');
	});

	test('should provide all completions for empty input', async () => {
		const completions = await provider.provideCompletions('', 0, true, CancellationToken.None);

		// All tasks should be returned for empty input (no spaces)
		strictEqual(completions.length, 3);
	});

	test('should provide matching completions for multi-word input', async () => {
		// Test exact match at beginning of task label
		const completions = await provider.provideCompletions('vs code ', 8, true, CancellationToken.None);

		// Only tasks that start with "vs code" should be returned
		strictEqual(completions.length, 1);
		strictEqual(completions[0].label, 'vs code build');
	});

	test('should not provide completions for non-matching multi-word input', async () => {
		const completions = await provider.provideCompletions('test build ', 11, true, CancellationToken.None);

		// No tasks start with "test build"
		strictEqual(completions.length, 0);
	});

	test('should include task detail and icon', async () => {
		const completions = await provider.provideCompletions('build', 5, true, CancellationToken.None);

		strictEqual(completions.length, 3); // All tasks are returned for single word
		strictEqual(completions[0].detail, 'Build the project');
		strictEqual(completions[0].icon?.id, 'tools');
	});

	test('should set correct provider and replacement properties', async () => {
		const completions = await provider.provideCompletions('test', 4, true, CancellationToken.None);

		strictEqual(completions.length, 3); // All tasks are returned for single word
		strictEqual(completions[0].provider, 'tasks');
		strictEqual(completions[0].replacementLength, 0); // Replacement is handled by the suggest system
	});
});
