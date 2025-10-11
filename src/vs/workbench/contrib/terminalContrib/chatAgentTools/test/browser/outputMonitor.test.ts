/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { IPollingResult, OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ChatModel } from '../../../../chat/common/chatModel.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; instance: Pick<ITerminalInstance, 'instanceId' | 'sendText' | 'onData' | 'onDidInputData' | 'focus' | 'registerMarker'>; sessionId: string };
	let cts: CancellationTokenSource;
	let instantiationService: TestInstantiationService;
	let sendTextCalled: boolean;
	let dataEmitter: Emitter<string>;

	setup(() => {
		sendTextCalled = false;
		dataEmitter = new Emitter<string>();
		execution = {
			getOutput: () => 'test output',
			isActive: async () => false,
			instance: {
				instanceId: 1,
				sendText: async () => { sendTextCalled = true; },
				onDidInputData: dataEmitter.event,
				onData: dataEmitter.event,
				focus: () => { },
				// eslint-disable-next-line local/code-no-any-casts
				registerMarker: () => ({ id: 1 } as any)
			},
			sessionId: '1'
		};
		instantiationService = new TestInstantiationService();

		instantiationService.stub(
			ILanguageModelsService,
			{
				selectLanguageModels: async () => []
			}
		);
		instantiationService.stub(
			IChatService,
			{
				// eslint-disable-next-line local/code-no-any-casts
				getSession: () => ({
					sessionId: '1',
					onDidDispose: { event: () => { }, dispose: () => { } },
					onDidChange: { event: () => { }, dispose: () => { } },
					initialLocation: undefined,
					requests: [],
					responses: [],
					addRequest: () => { },
					addResponse: () => { },
					dispose: () => { }
				} as any)
			}
		);
		instantiationService.stub(ILogService, new NullLogService());
		cts = new CancellationTokenSource();
	});

	teardown(() => {
		cts.dispose();
	});

	test('startMonitoring returns immediately when polling succeeds', async () => {
		// Simulate output change after first poll
		let callCount = 0;
		execution.getOutput = () => {
			callCount++;
			return callCount > 1 ? 'changed output' : 'test output';
		};
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		assert.strictEqual(pollingResult.output, 'changed output');
		assert.strictEqual(sendTextCalled, false, 'sendText should not be called');
	});

	test('startMonitoring returns cancelled when token is cancelled', async () => {
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		cts.cancel();
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Cancelled);
	});
	test('startMonitoring returns idle when isActive is false', async () => {
		execution.isActive = async () => false;
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
	});

	test('startMonitoring works when isActive is undefined', async () => {
		// Simulate output change after first poll
		let callCount = 0;
		execution.getOutput = () => {
			callCount++;
			return callCount > 1 ? 'changed output' : 'test output';
		};
		delete execution.isActive;
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
	});

	test('monitor can be disposed twice without error', async () => {
		// Simulate output change after first poll
		let callCount = 0;
		execution.getOutput = () => {
			callCount++;
			return callCount > 1 ? 'changed output' : 'test output';
		};
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		monitor.dispose();
		monitor.dispose();
	});
	test('timeout prompt unanswered → continues polling and completes when idle', async () => {
		// Fake a ChatModel enough to pass instanceof and the two methods used
		const fakeChatModel: any = {
			getRequests: () => [{}],
			acceptResponseProgress: () => { }
		};
		Object.setPrototypeOf(fakeChatModel, ChatModel.prototype);
		instantiationService.stub(IChatService, { getSession: () => fakeChatModel });

		// Poller: first pass times out (to show the prompt), second pass goes idle
		let pass = 0;
		const timeoutThenIdle = async (): Promise<IPollingResult> => {
			pass++;
			return pass === 1
				? { state: OutputMonitorState.Timeout, output: execution.getOutput(), modelOutputEvalResponse: 'Timed out' }
				: { state: OutputMonitorState.Idle, output: execution.getOutput(), modelOutputEvalResponse: 'Done' };
		};

		monitor = store.add(
			instantiationService.createInstance(
				OutputMonitor,
				execution,
				timeoutThenIdle,
				{ sessionId: '1' },
				cts.token,
				'test command'
			)
		);

		await Event.toPromise(monitor.onDidFinishCommand);

		const res = monitor.pollingResult!;
		assert.strictEqual(res.state, OutputMonitorState.Idle);
		assert.strictEqual(res.output, 'test output');
		assert.ok(typeof res.pollDurationMs === 'number');
	});
});
