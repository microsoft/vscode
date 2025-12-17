/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { detectsInputRequiredPattern, OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
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
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IToolInvocationContext } from '../../../../chat/common/languageModelToolsService.js';
import { LocalChatSessionUri } from '../../../../chat/common/chatUri.js';
import { isNumber } from '../../../../../../base/common/types.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let execution: { getOutput: () => string; isActive?: () => Promise<boolean>; instance: Pick<ITerminalInstance, 'instanceId' | 'sendText' | 'onData' | 'onDidInputData' | 'focus' | 'registerMarker' | 'onDisposed'>; sessionId: string };
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
				onDisposed: Event.None,
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
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult.output, 'changed output');
			assert.strictEqual(sendTextCalled, false, 'sendText should not be called');
		});
	});

	test('startMonitoring returns cancelled when token is cancelled', async () => {
		return runWithFakedTimers({}, async () => {
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			cts.cancel();
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Cancelled);
		});
	});
	test('startMonitoring returns idle when isActive is false', async () => {
		return runWithFakedTimers({}, async () => {
			execution.isActive = async () => false;
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		});
	});

	test('startMonitoring works when isActive is undefined', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			delete execution.isActive;
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		});
	});

	test('monitor can be disposed twice without error', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			monitor.dispose();
			monitor.dispose();
		});
	});
	test('timeout prompt unanswered → continues polling and completes when idle', async () => {
		return runWithFakedTimers({}, async () => {
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
					createTestContext('1'),
					cts.token,
					'test command'
				)
			);

			await Event.toPromise(monitor.onDidFinishCommand);

			const res = monitor.pollingResult!;
			assert.strictEqual(res.state, OutputMonitorState.Idle);
			assert.strictEqual(res.output, 'test output');
			assert.ok(isNumber(res.pollDurationMs));
		});
	});

	suite('detectsInputRequiredPattern', () => {
		test('detects yes/no confirmation prompts (pairs and variants)', () => {
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed? (yes/no) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed? [no/yes] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Continue? y/n '), true);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no '), true);

			// No match if there's a response already
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] N'), false);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) Y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Continue? y/n y\/n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no yes\/n'), false);
		});

		test('detects PowerShell multi-option confirmation line', () => {
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): '),
				true
			);
			// also matches without default suffix
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No '),
				true
			);

			// No match if there's a response already
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): Y'),
				false
			);
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No N'),
				false
			);
		});
		test('Line ends with colon', () => {
			assert.strictEqual(detectsInputRequiredPattern('Enter your name: '), true);
			assert.strictEqual(detectsInputRequiredPattern('Password: '), true);
			assert.strictEqual(detectsInputRequiredPattern('File to overwrite: '), true);
		});

		test('detects trailing questions', () => {
			assert.strictEqual(detectsInputRequiredPattern('Continue?'), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed?   '), true);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure?'), true);
		});

		test('detects press any key prompts', () => {
			assert.strictEqual(detectsInputRequiredPattern('Press any key to continue...'), true);
			assert.strictEqual(detectsInputRequiredPattern('Press a key'), true);
		});
	});

});
function createTestContext(id: string): IToolInvocationContext {
	return { sessionId: id, sessionResource: LocalChatSessionUri.forSession(id) };
}

