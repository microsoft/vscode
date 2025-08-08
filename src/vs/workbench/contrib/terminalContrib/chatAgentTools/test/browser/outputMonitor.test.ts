/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { OutputMonitor, OutputMonitorAction } from '../../browser/outputMonitor.js';

class TestOutputMonitor extends OutputMonitor {
	async internalStartMonitoring(extendedPolling: boolean, token: CancellationToken): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
		return super._startMonitoring(extendedPolling, token);
	}
}

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let mockLanguageModelsService: ILanguageModelsService;

	setup(() => {
		mockLanguageModelsService = {
			selectLanguageModels: async () => [{ id: 'test-model' } as any],
			sendChatRequest: async () => ({
				result: 'Mock assessment result',
				stream: (async function* () {
					yield { part: { type: 'text', value: 'Mock assessment result' } };
				})()
			}) as any
		} as unknown as ILanguageModelsService;
	});

	function createMockExecution(outputSequence: string[], isActiveSequence?: boolean[]): { getOutput: () => string; isActive?: () => Promise<boolean> } {
		let outputIndex = 0;
		let isActiveIndex = 0;

		return {
			getOutput: () => {
				const output = outputSequence[outputIndex] || outputSequence[outputSequence.length - 1] || '';
				if (outputIndex < outputSequence.length - 1) {
					outputIndex++;
				}
				return output;
			},
			isActive: isActiveSequence ? async () => {
				const isActive = isActiveSequence[isActiveIndex] !== undefined ? isActiveSequence[isActiveIndex] : false;
				if (isActiveIndex < isActiveSequence.length - 1) {
					isActiveIndex++;
				}
				return isActive;
			} : undefined
		};
	}

	test('should implement IOutputMonitor interface', () => {
		const execution = createMockExecution(['']);
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		// Verify core interface properties exist
		strictEqual(Array.isArray(monitor.actions), true);
		strictEqual(typeof monitor.isIdle, 'boolean');
		strictEqual(monitor.onDidFinishCommand !== undefined, true);
		strictEqual(monitor.onDidIdle !== undefined, true);
		strictEqual(monitor.onDidTimeout !== undefined, true);
		strictEqual(monitor.startMonitoring !== undefined, true);
		strictEqual(monitor.dispose !== undefined, true);
	});

	test('should track actions correctly', async () => {
		const execution = createMockExecution(['output1', 'output1', 'output1']); // No new output to trigger idle
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();
		const result = monitor.internalStartMonitoring(false, tokenSource.token);

		// Give it some time to start and detect idle
		await timeout(100);
		tokenSource.cancel();

		await result.catch(() => { }); // Expect cancellation error

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.CancellationRequested), true);
	});

	test('should detect idle state when no new output', async () => {
		const execution = createMockExecution(['initial output', 'initial output', 'initial output']); // Same output to trigger idle
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		let idleEventFired = false;
		let finishEventFired = false;

		const idleDisposable = monitor.onDidIdle(() => {
			idleEventFired = true;
		});
		store.add(idleDisposable);

		const finishDisposable = monitor.onDidFinishCommand(() => {
			finishEventFired = true;
		});
		store.add(finishDisposable);

		const tokenSource = new CancellationTokenSource();

		const result = await monitor.internalStartMonitoring(false, tokenSource.token);

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		strictEqual(typeof result.output, 'string');
		strictEqual(typeof result.pollDurationMs, 'number');
		strictEqual(typeof result.modelOutputEvalResponse, 'string');
		strictEqual(monitor.isIdle, true);
		strictEqual(idleEventFired, true);
		strictEqual(finishEventFired, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
		strictEqual(actions.includes(OutputMonitorAction.AssessmentCompleted), true);
	});

	test('should handle timeout correctly', async () => {
		// Create execution that continuously produces new output to prevent idle detection
		let outputCounter = 0;
		const execution = {
			getOutput: () => `changing output ${outputCounter++}`,
			isActive: undefined
		};

		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Cancel after a short time to simulate timeout
		setTimeout(() => tokenSource.cancel(), 100);

		await monitor.internalStartMonitoring(false, tokenSource.token);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.CancellationRequested), true);
	}).timeout(5000);

	test('should handle cancellation correctly', async () => {
		const execution = createMockExecution(['output']);
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Cancel immediately
		tokenSource.cancel();

		try {
			await monitor.internalStartMonitoring(false, tokenSource.token);
			strictEqual(true, false, 'Should have thrown cancellation error');
		} catch (error) {
			// Expected cancellation
		}

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.CancellationRequested), true);
	});

	test('should track output received actions', async () => {
		const execution = createMockExecution(['output1', 'output2', 'output2', 'output2']); // Output changes once then stays same
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();

		const result = await monitor.internalStartMonitoring(false, tokenSource.token);

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.OutputReceived), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
	});

	test('should handle extended polling correctly', async () => {
		const execution = createMockExecution(['output', 'output', 'output']); // Same output to trigger idle quickly
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();

		const result = await monitor.internalStartMonitoring(true, tokenSource.token); // Extended polling = true

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		strictEqual(typeof result.modelOutputEvalResponse, 'string');

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.ExtendedPollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
		strictEqual(actions.includes(OutputMonitorAction.AssessmentCompleted), true);
	});

	test('should handle isActive check correctly', async () => {
		const execution = createMockExecution(
			['output', 'output', 'output', 'output'], // Same output to trigger no new data
			[true, false] // Active once, then inactive (should trigger idle quickly)
		);
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Set a timeout to cancel if it takes too long
		setTimeout(() => tokenSource.cancel(), 2000);

		await monitor.internalStartMonitoring(false, tokenSource.token);

		// Check that it didn't timeout (either completed successfully or was cancelled)
		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);

		// Should either be idle or cancelled
		const hasIdleOrCancel = actions.includes(OutputMonitorAction.IdleDetected) || actions.includes(OutputMonitorAction.CancellationRequested);
		strictEqual(hasIdleOrCancel, true);
	}).timeout(5000);

	test('should return immutable copy of actions', () => {
		const execution = createMockExecution(['']);
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);
		store.add(monitor);

		const actions1 = monitor.actions;
		const actions2 = monitor.actions;

		// Should be different array instances
		strictEqual(actions1 !== actions2, true);

		// But should have same content
		deepStrictEqual(actions1, actions2);

		// Modifying returned array should not affect internal state
		actions1.push(OutputMonitorAction.TimeoutReached);
		const actions3 = monitor.actions;
		strictEqual(actions3.includes(OutputMonitorAction.TimeoutReached), false);
	});

	test('should dispose correctly', () => {
		const execution = createMockExecution(['']);
		const monitor = new TestOutputMonitor(execution, mockLanguageModelsService);

		let eventFired = false;
		const disposable = monitor.onDidFinishCommand(() => {
			eventFired = true;
		});

		monitor.dispose();
		disposable.dispose();

		// After disposal, state should be clean
		strictEqual(eventFired, false);
	});
});
