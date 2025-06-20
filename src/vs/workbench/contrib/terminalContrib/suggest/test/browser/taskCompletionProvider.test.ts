/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TaskCompletionProvider } from '../../browser/taskCompletionProvider.js';
import { CustomTask } from '../../../../tasks/common/tasks.js';
import { TerminalCompletionItemKind } from '../../browser/terminalCompletionItem.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';

suite('TaskCompletionProvider', () => {
	let instantiationService: TestInstantiationService;
	let taskService: ITaskService;
	let commandService: ICommandService;
	let themeService: IThemeService;
	let provider: TaskCompletionProvider;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		
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

		// Mock command service
		commandService = {
			executeCommand: async () => { }
		} as any;

		// Mock theme service
		themeService = {} as any;

		provider = new TaskCompletionProvider(taskService, commandService, themeService);
	});

	test('should provide completions for task labels starting with input', async () => {
		const completions = await provider.provideCompletions('bu', 2, true, CancellationToken.None);
		
		strictEqual(completions.length, 2);
		strictEqual(completions[0].label, 'build');
		strictEqual(completions[0].kind, TerminalCompletionItemKind.Task);
		strictEqual(completions[0].command?.id, 'workbench.action.tasks.runTask');
		strictEqual(completions[1].label, 'vs code build');
	});

	test('should provide completions for task labels containing input word', async () => {
		const completions = await provider.provideCompletions('code', 4, true, CancellationToken.None);
		
		strictEqual(completions.length, 1);
		strictEqual(completions[0].label, 'vs code build');
		strictEqual(completions[0].kind, TerminalCompletionItemKind.Task);
	});

	test('should not provide completions for empty input', async () => {
		const completions = await provider.provideCompletions('', 0, true, CancellationToken.None);
		
		strictEqual(completions.length, 0);
	});

	test('should not provide completions for non-matching input', async () => {
		const completions = await provider.provideCompletions('xyz', 3, true, CancellationToken.None);
		
		strictEqual(completions.length, 0);
	});

	test('should include task detail and icon', async () => {
		const completions = await provider.provideCompletions('build', 5, true, CancellationToken.None);
		
		strictEqual(completions.length, 2);
		strictEqual(completions[0].detail, 'Build the project');
		strictEqual(completions[0].icon?.id, 'tools');
	});

	test('should set correct provider and replacement properties', async () => {
		const completions = await provider.provideCompletions('test', 4, true, CancellationToken.None);
		
		strictEqual(completions.length, 1);
		strictEqual(completions[0].provider, 'tasks');
		strictEqual(completions[0].replacementLength, 4);
	});
});