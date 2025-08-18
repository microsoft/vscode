/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OutputMonitor } from '../../browser/outputMonitor.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';


suite('OutputMonitor', () => {
	let disposables: DisposableStore;

	const mockLanguageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'> = {
		selectLanguageModels: () => Promise.resolve(['test']),
		sendChatRequest: () => Promise.resolve({
			stream: (async function* () { yield { type: 'text', value: 'test' }; })(),
			result: Promise.resolve('test')
		})
	};

	const mockTaskService: Pick<ITaskService, 'getTask'> = {
		getTask: () => Promise.resolve(undefined)
	};

	const mockChatService: Pick<IChatService, 'getSession'> = {
		getSession: () => undefined
	};

	const mockTerminalInstance: Pick<ITerminalInstance, 'instanceId' | 'sendText'> = {
		instanceId: 1,
		sendText: () => Promise.resolve()
	};

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('OutputMonitor should be created and disposed correctly', () => {
		const monitor = new OutputMonitor(
			{ getOutput: () => '', terminal: mockTerminalInstance },
			mockLanguageModelsService,
			mockTaskService as ITaskService
		);
		ok(monitor);
		monitor.dispose();
	});

	test('isIdle should be false initially', () => {
		const monitor = disposables.add(new OutputMonitor(
			{ getOutput: () => '', terminal: mockTerminalInstance },
			mockLanguageModelsService,
			mockTaskService as ITaskService
		));
		strictEqual(monitor.isIdle, false);
	});

	test('startMonitoring should handle simple terminal output', async () => {
		const testOutput = 'test output';
		const monitor = disposables.add(new OutputMonitor(
			{
				getOutput: () => testOutput,
				isActive: () => Promise.resolve(false),
				terminal: mockTerminalInstance
			},
			mockLanguageModelsService,
			mockTaskService as ITaskService
		));

		const result = await monitor.startMonitoring(
			mockChatService as IChatService,
			'test command',
			{ sessionId: 'test' },
			CancellationToken.None
		);

		strictEqual(result.output, testOutput);
		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
	});

	test('startMonitoring should handle cancellation', async () => {
		const monitor = disposables.add(new OutputMonitor(
			{
				getOutput: () => 'test',
				isActive: () => Promise.resolve(true),
				terminal: mockTerminalInstance
			},
			mockLanguageModelsService,
			mockTaskService as ITaskService
		));

		const token = CancellationToken.None;
		const result = await monitor.startMonitoring(
			mockChatService as IChatService,
			'test command',
			{ sessionId: 'test' },
			token
		);

		ok(result, 'Result should be returned even when cancelled');
	});

	test('startMonitoring should handle custom polling function', async () => {
		let pollFnCalled = false;
		const customPollFn = async () => {
			pollFnCalled = true;
			return { terminalExecutionIdleBeforeTimeout: true, output: 'custom poll' };
		};

		const monitor = disposables.add(new OutputMonitor(
			{
				getOutput: () => 'test',
				isActive: () => Promise.resolve(false),
				terminal: mockTerminalInstance
			},
			mockLanguageModelsService,
			mockTaskService as ITaskService,
			customPollFn
		));

		await monitor.startMonitoring(
			mockChatService as IChatService,
			'test command',
			{ sessionId: 'test' },
			CancellationToken.None
		);

		ok(pollFnCalled, 'Custom poll function should have been called');
	});

});
