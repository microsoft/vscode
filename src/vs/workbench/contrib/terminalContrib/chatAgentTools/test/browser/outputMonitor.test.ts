/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IChatService } from '../../../../chat/common/chatService.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { AsyncIterableObject } from '../../../../../../base/common/async.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>;
	let taskService: Pick<ITaskService, 'getActiveTasks'>;
	let chatService: Pick<IChatService, 'getSession'>;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; instance: Pick<ITerminalInstance, 'instanceId' | 'sendText'> };
	let cts: CancellationTokenSource;
	let chatWidgetService: Pick<IChatWidgetService, 'getWidgetsByLocations'>;

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
		chatWidgetService = {
			getWidgetsByLocations: () => []
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
			instance: {
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
		monitor = store.add(new OutputMonitor(
			execution,
			languageModelsService,
			taskService as ITaskService,
			chatWidgetService,
		));

		const result = await monitor.startMonitoring(
			chatService as IChatService,
			'test command',
			{ sessionId: '1' },
			cts.token
		);

		assert.strictEqual(result.state, OutputMonitorState.Idle);
		assert.strictEqual(result.output, 'test output');
	});
});
