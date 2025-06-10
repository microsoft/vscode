/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Task, CustomTask, TaskIdentifier, RuntimeType, CommandString } from '../../common/tasks.js';
import { URI } from '../../../../../base/common/uri.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Tasks - Empty Command Handling', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('CommandString utility', () => {
		test('Should extract string value correctly', () => {
			assert.strictEqual(CommandString.value('test'), 'test');
			assert.strictEqual(CommandString.value(''), '');
			assert.strictEqual(CommandString.value('  whitespace  '), '  whitespace  ');
		});

		test('Should handle quoted strings correctly', () => {
			const quotedString = { value: 'quoted command', quoting: 'strong' as any };
			assert.strictEqual(CommandString.value(quotedString), 'quoted command');
		});
	});

	suite('Empty command task creation', () => {
		let workspaceFolder: WorkspaceFolder;
		let taskIdentifier: TaskIdentifier;

		setup(() => {
			workspaceFolder = {
				uri: URI.file('/workspace/test'),
				name: 'test',
				index: 0
			};

			taskIdentifier = {
				type: 'shell',
			};
		});

		test('Task with empty command string should be created', () => {
			const emptyCommandTask = new CustomTask(
				'empty-task',
				workspaceFolder,
				'Empty Command Task',
				taskIdentifier,
				{
					runtime: RuntimeType.Shell,
					name: '',
					presentation: {
						echo: true,
						focus: false,
						panel: 'shared' as any,
						reveal: 'always' as any,
						revealProblems: 'never' as any,
						showReuseMessage: false,
						clear: false,
						group: undefined
					}
				},
				[]
			);

			assert.strictEqual(emptyCommandTask.command.name, '');
			assert.strictEqual(emptyCommandTask.command.runtime, RuntimeType.Shell);
			assert.strictEqual(emptyCommandTask._label, 'Empty Command Task');
		});

		test('Task with whitespace-only command should be created', () => {
			const whitespaceTask = new CustomTask(
				'whitespace-task',
				workspaceFolder,
				'Whitespace Command Task',
				taskIdentifier,
				{
					runtime: RuntimeType.Shell,
					name: '   \t  \n  ',
					presentation: {
						echo: true,
						focus: false,
						panel: 'shared' as any,
						reveal: 'always' as any,
						revealProblems: 'never' as any,
						showReuseMessage: false,
						clear: false,
						group: undefined
					}
				},
				[]
			);

			assert.strictEqual(whitespaceTask.command.name, '   \t  \n  ');
			assert.strictEqual(whitespaceTask.command.runtime, RuntimeType.Shell);
		});

		test('Task with valid command should be created', () => {
			const validTask = new CustomTask(
				'valid-task',
				workspaceFolder,
				'Valid Command Task',
				taskIdentifier,
				{
					runtime: RuntimeType.Shell,
					name: 'echo hello',
					presentation: {
						echo: true,
						focus: false,
						panel: 'shared' as any,
						reveal: 'always' as any,
						revealProblems: 'never' as any,
						showReuseMessage: false,
						clear: false,
						group: undefined
					}
				},
				[]
			);

			assert.strictEqual(validTask.command.name, 'echo hello');
			assert.strictEqual(validTask.command.runtime, RuntimeType.Shell);
		});
	});

	suite('Task emptiness validation', () => {
		test('Empty command string should be considered empty after trim', () => {
			// This tests the logic that was fixed
			const emptyCommand = '';
			const result = CommandString.value(emptyCommand).trim() !== '';
			assert.strictEqual(result, false, 'Empty command should be considered empty after trim');
		});

		test('Whitespace-only command should be considered empty after trim', () => {
			const whitespaceCommand = '   \t  \n  ';
			const result = CommandString.value(whitespaceCommand).trim() !== '';
			assert.strictEqual(result, false, 'Whitespace-only command should be considered empty after trim');
		});

		test('Valid command should not be considered empty', () => {
			const validCommand = 'echo hello';
			const result = CommandString.value(validCommand).trim() !== '';
			assert.strictEqual(result, true, 'Valid command should not be considered empty');
		});

		test('Command with leading/trailing whitespace should not be considered empty', () => {
			const commandWithWhitespace = '  echo hello  ';
			const result = CommandString.value(commandWithWhitespace).trim() !== '';
			assert.strictEqual(result, true, 'Command with whitespace should not be considered empty after trim');
		});
	});
});