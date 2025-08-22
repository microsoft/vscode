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
import { Event } from '../../../../../../base/common/event.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; instance: Pick<ITerminalInstance, 'instanceId' | 'sendText'>; sessionId: string };
	let cts: CancellationTokenSource;
	let instantiationService: TestInstantiationService;
	let sendTextCalled: boolean;

	setup(() => {
		sendTextCalled = false;
		execution = {
			getOutput: () => 'test output',
			isActive: async () => true,
			instance: {
				instanceId: 1,
				sendText: async () => { sendTextCalled = true; }
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

		cts = new CancellationTokenSource();
	});

	teardown(() => {
		cts.dispose();
	});

	test('startMonitoring returns immediately when polling succeeds', async () => {
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		assert.strictEqual(pollingResult.output, 'test output');
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
		delete execution.isActive;
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
	});

	test('monitor can be disposed twice without error', async () => {
		monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, { sessionId: '1' }, cts.token, 'test command'));
		await Event.toPromise(monitor.onDidFinishCommand);
		const pollingResult = monitor.pollingResult;
		assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		monitor.dispose();
		monitor.dispose();
	});
	test('startMonitoring returns timeout when polling times out and user does not extend', async () => {
		const forcedTimeoutPoller = async () => ({
			state: OutputMonitorState.Timeout,
			output: execution.getOutput(),
			modelOutputEvalResponse: 'Timed out'
		} satisfies IPollingResult);

		monitor = store.add(
			instantiationService.createInstance(
				OutputMonitor,
				execution,
				forcedTimeoutPoller,
				{ sessionId: '1' },
				cts.token,
				'test command'
			)
		);

		// Wait for completion
		await Event.toPromise(monitor.onDidFinishCommand);

		const pollingResult = monitor.pollingResult!;
		assert.strictEqual(pollingResult.state, OutputMonitorState.Timeout);
		assert.strictEqual(pollingResult.output, 'test output');
		// ensure we recorded duration and no auto replies were sent
		assert.ok(typeof pollingResult.pollDurationMs === 'number');
	});
});
