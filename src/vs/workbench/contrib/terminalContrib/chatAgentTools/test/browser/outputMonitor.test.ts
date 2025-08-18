/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IChatService } from '../../../../chat/common/chatService.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { OutputMonitor } from '../../browser/outputMonitor.js';
import { CancellationTokenSource, CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { IExecution, IPollingResult } from '../../browser/bufferOutputPollingTypes.js';
import { AsyncIterableObject } from '../../../../../../base/common/async.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>;
	let taskService: Pick<ITaskService, 'getActiveTasks'>;
	let chatService: Pick<IChatService, 'getSession'>;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; terminal: Pick<ITerminalInstance, 'instanceId' | 'sendText'> };
	let cts: CancellationTokenSource;

	setup(() => {
		languageModelsService = {
			selectLanguageModels: async () => ['model1'],
			sendChatRequest: async () => ({
				stream: new AsyncIterableObject<any>((emitter) => {
					// No stream items for test
					emitter.emitOne(undefined);
					return () => { };
				}),
				result: Promise.resolve('')
			})
		};

		taskService = {
			getActiveTasks: async () => []
		};

		chatService = {
			getSession: () => undefined
		};

		execution = {
			getOutput: () => 'test output',
			isActive: async () => true,
			terminal: {
				instanceId: 1,
				sendText: async () => { }
			}
		};


		cts = new CancellationTokenSource();
	});

	teardown(() => {
		cts.dispose();
	});

	test('startMonitoring returns immediately when polling succeeds', async () => {
		const pollFn = async () => ({
			terminalExecutionIdleBeforeTimeout: true,
			output: 'success output'
		});

		monitor = store.add(new OutputMonitor(
			execution,
			languageModelsService,
			taskService as ITaskService,
			pollFn
		));

		const result = await monitor.startMonitoring(
			chatService as IChatService,
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		assert.strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		assert.strictEqual(result.output, 'success output');
	});

	test('startMonitoring shows prompt when initial polling times out', async () => {
		let callCount = 0;
		const pollFn = async (_execution: IExecution, _token: CancellationToken, _idle: boolean, _pollStartTime: number, _extendedPolling: boolean) => {
			callCount++;
			if (callCount === 1) {
				return {
					terminalExecutionIdleBeforeTimeout: false,
					output: 'timeout output'
				};
			}
			return {
				terminalExecutionIdleBeforeTimeout: true,
				output: 'success after prompt'
			};
		};

		monitor = store.add(new OutputMonitor(
			execution,
			languageModelsService,
			taskService as ITaskService,
			pollFn
		));

		const result = await monitor.startMonitoring(
			chatService as IChatService,
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		assert.strictEqual(result.terminalExecutionIdleBeforeTimeout, false);
		assert.strictEqual(result.output, 'timeout output');
	});

	test('startMonitoring handles cancellation', async () => {
		const pollFn = async (_execution: IExecution, _token: CancellationToken, _idle: boolean, _pollStartTime: number, _extendedPolling: boolean): Promise<IPollingResult> => {
			return new Promise(() => {
				// Never resolve to simulate long-running operation
			});
		};

		monitor = store.add(new OutputMonitor(
			execution,
			languageModelsService,
			taskService as ITaskService,
			pollFn
		));

		const monitorPromise = monitor.startMonitoring(
			chatService as IChatService,
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		cts.cancel();

		const result = await monitorPromise;
		assert.strictEqual(result.terminalExecutionIdleBeforeTimeout, false);
	});

	test('startMonitoring handles polling without prompt response', async () => {
		const pollFn = async (_execution: IExecution, _token: CancellationToken, _idle: boolean, _pollStartTime: number, _extendedPolling: boolean) => ({
			terminalExecutionIdleBeforeTimeout: false,
			output: 'final output'
		});

		monitor = store.add(new OutputMonitor(
			execution,
			languageModelsService,
			taskService as ITaskService,
			pollFn
		));

		const result = await monitor.startMonitoring(
			chatService as IChatService,
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		assert.strictEqual(result.terminalExecutionIdleBeforeTimeout, false);
		assert.strictEqual(result.output, 'final output');
	});
});
