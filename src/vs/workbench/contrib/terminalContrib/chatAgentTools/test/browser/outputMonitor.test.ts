/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { OutputMonitor, OutputMonitorAction } from '../../browser/outputMonitor.js';

suite('OutputMonitor', () => {
	let disposables: DisposableStore;
	let mockLanguageModelsService: ILanguageModelsService;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		mockLanguageModelsService = {} as ILanguageModelsService;
	});

	teardown(() => {
		disposables.dispose();
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
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		// Verify interface implementation
		strictEqual(typeof monitor.actions, 'object');
		strictEqual(Array.isArray(monitor.actions), true);
		strictEqual(typeof monitor.isIdle, 'boolean');
		strictEqual(typeof monitor.onDidFinishCommand, 'object');
		strictEqual(typeof monitor.onDidIdle, 'object');
		strictEqual(typeof monitor.onDidTimeout, 'object');
		strictEqual(typeof monitor.startMonitoring, 'function');
		strictEqual(typeof monitor.dispose, 'function');
	});

	test('should track actions correctly', async () => {
		const execution = createMockExecution(['output1', 'output1', 'output1']); // No new output to trigger idle
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		const tokenSource = new CancellationTokenSource();
		const result = monitor.startMonitoringLegacy(false, tokenSource.token);

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
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		let idleEventFired = false;
		let finishEventFired = false;

		monitor.onDidIdle(() => {
			idleEventFired = true;
		});

		monitor.onDidFinishCommand(() => {
			finishEventFired = true;
		});

		const tokenSource = new CancellationTokenSource();

		// Mock the assessment function to return quickly
		const originalAssess = require('../../browser/bufferOutputPolling.js').assessOutputForErrors;
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = async () => 'Mock assessment';

		const result = await monitor.startMonitoringLegacy(false, tokenSource.token);		// Restore original function
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = originalAssess;

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		strictEqual(typeof result.output, 'string');
		strictEqual(typeof result.pollDurationMs, 'number');
		strictEqual(result.modelOutputEvalResponse, 'Mock assessment');
		strictEqual(monitor.isIdle, true);
		strictEqual(idleEventFired, true);
		strictEqual(finishEventFired, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
		strictEqual(actions.includes(OutputMonitorAction.AssessmentCompleted), true);
	});

	test('should handle timeout correctly', async () => {
		const execution = createMockExecution(['changing output 1', 'changing output 2', 'changing output 3']); // Always changing output
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		let timeoutEventFired = false;
		monitor.onDidTimeout(() => {
			timeoutEventFired = true;
		});

		const tokenSource = new CancellationTokenSource();

		// Mock PollingConsts to use shorter durations for testing
		const originalPollingConsts = require('../../browser/bufferOutputPolling.js').PollingConsts;
		require('../../browser/bufferOutputPolling.js').PollingConsts = {
			...originalPollingConsts,
			FirstPollingMaxDuration: 50, // 50ms timeout for testing
			MinPollingDuration: 10
		};

		const result = await monitor.startMonitoringLegacy(false, tokenSource.token);

		// Restore original constants
		require('../../browser/bufferOutputPolling.js').PollingConsts = originalPollingConsts;

		strictEqual(result.terminalExecutionIdleBeforeTimeout, false);
		strictEqual(timeoutEventFired, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.TimeoutReached), true);
	});

	test('should handle cancellation correctly', async () => {
		const execution = createMockExecution(['output']);
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Cancel immediately
		tokenSource.cancel();

		try {
			await monitor.startMonitoringLegacy(false, tokenSource.token);
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
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Mock the assessment function to return quickly
		const originalAssess = require('../../browser/bufferOutputPolling.js').assessOutputForErrors;
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = async () => 'Mock assessment';

		const result = await monitor.startMonitoringLegacy(false, tokenSource.token);

		// Restore original function
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = originalAssess;

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.OutputReceived), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
	});

	test('should handle extended polling correctly', async () => {
		const execution = createMockExecution(['output', 'output', 'output']); // Same output to trigger idle quickly
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Mock the assessment function to return quickly
		const originalAssess = require('../../browser/bufferOutputPolling.js').assessOutputForErrors;
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = async () => 'Extended polling assessment';

		const result = await monitor.startMonitoringLegacy(true, tokenSource.token); // Extended polling = true

		// Restore original function
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = originalAssess;

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		strictEqual(result.modelOutputEvalResponse, 'Extended polling assessment');

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.ExtendedPollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
		strictEqual(actions.includes(OutputMonitorAction.AssessmentCompleted), true);
	});

	test('should handle isActive check correctly', async () => {
		const execution = createMockExecution(
			['output', 'output', 'output', 'output'], // Same output to trigger no new data
			[true, true, false] // Active, then active, then inactive (should trigger idle)
		);
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

		const tokenSource = new CancellationTokenSource();

		// Mock the assessment function to return quickly
		const originalAssess = require('../../browser/bufferOutputPolling.js').assessOutputForErrors;
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = async () => 'isActive test assessment';

		const result = await monitor.startMonitoringLegacy(false, tokenSource.token);

		// Restore original function
		require('../../browser/bufferOutputPolling.js').assessOutputForErrors = originalAssess;

		strictEqual(result.terminalExecutionIdleBeforeTimeout, true);
		strictEqual(monitor.isIdle, true);

		const actions = monitor.actions;
		strictEqual(actions.includes(OutputMonitorAction.PollingStarted), true);
		strictEqual(actions.includes(OutputMonitorAction.IdleDetected), true);
	});

	test('should return immutable copy of actions', () => {
		const execution = createMockExecution(['']);
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);
		disposables.add(monitor);

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
		const monitor = new OutputMonitor(execution, mockLanguageModelsService);

		let eventFired = false;
		monitor.onDidFinishCommand(() => {
			eventFired = true;
		});

		monitor.dispose();

		// Events should be disposed and not fire
		try {
			(monitor as any)._onDidFinishCommand.fire();
		} catch {
			// Expected - disposed emitter should throw or be no-op
		}

		strictEqual(eventFired, false);
	});
});
