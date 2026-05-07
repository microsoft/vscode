/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { BackgroundTodoProcessor, BackgroundTodoProcessorState, IBackgroundTodoExecutionContext, IBackgroundTodoResult } from '../backgroundTodoProcessor';
import { IBackgroundTodoDelta } from '../backgroundTodoDelta';
import { CancellationTokenSource } from '../../../../../util/vs/base/common/cancellation';

function makeDelta(rounds: string[] = []): IBackgroundTodoDelta {
	return {
		userRequest: 'fix the bug',
		newRounds: rounds.map(id => ({
			id,
			response: '',
			toolInputRetry: 0,
			toolCalls: [],
		})),
		history: [],
		sessionResource: undefined,
		metadata: {
			newRoundCount: rounds.length,
			newToolCallCount: 0,
			meaningfulToolCallCount: 0,
			contextToolCallCount: 0,
			isInitialDelta: true,
			isRequestOnly: rounds.length === 0,
		},
	};
}

interface IExecutionContextTestOptions {
	readonly endpointDelayMs?: number;
	readonly logMessages?: string[];
	readonly telemetryEvents?: string[];
}

function makeLogService(logMessages?: string[]) {
	return {
		debug: (message: string) => logMessages?.push(message),
		warn: (message: string) => logMessages?.push(message),
	} as any;
}

function makeExecutionContext(rounds: string[] = [], options: IExecutionContextTestOptions = {}): IBackgroundTodoExecutionContext {
	return {
		instantiationService: { invokeFunction: async () => {
			if (options.endpointDelayMs !== undefined) {
				await new Promise(resolve => setTimeout(resolve, options.endpointDelayMs));
			}
			throw new Error('no endpoint');
		} } as any,
		logService: makeLogService(options.logMessages),
		toolsService: { invokeTool: async () => undefined } as any,
		telemetryService: { sendMSFTTelemetryEvent: (eventName: string) => options.telemetryEvents?.push(eventName) } as any,
		promptContext: {
			query: 'fix the bug',
			history: [],
			chatVariables: { hasVariables: () => false } as any,
			toolCallRounds: rounds.map(id => ({ id, response: '', toolInputRetry: 0, toolCalls: [] })),
		} as any,
	};
}

describe('BackgroundTodoProcessor', () => {

	test('initial state is Idle', () => {
		const processor = new BackgroundTodoProcessor();
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});

	test('start transitions to InProgress then Idle on success', async () => {
		const processor = new BackgroundTodoProcessor();
		const result: IBackgroundTodoResult = { outcome: 'success' };
		processor.start(makeDelta(['r1']), async () => result);
		expect(processor.state).toBe(BackgroundTodoProcessorState.InProgress);
		await processor.waitForCompletion();
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});

	test('failed work transitions to Failed', async () => {
		const processor = new BackgroundTodoProcessor();
		processor.start(makeDelta(['r1']), async () => {
			throw new Error('model error');
		});
		await processor.waitForCompletion();
		expect(processor.state).toBe(BackgroundTodoProcessorState.Failed);
		expect(processor.lastError).toBeInstanceOf(Error);
	});

	test('delta cursor advances on success', async () => {
		const processor = new BackgroundTodoProcessor();
		processor.start(makeDelta(['r1']), async () => ({ outcome: 'noop' }));
		await processor.waitForCompletion();

		// The delta tracker should now have r1 marked as processed
		// So a context with only r1 should produce no new delta
		expect(processor.deltaTracker.getDelta({
			query: 'fix',
			history: [],
			chatVariables: { hasVariables: () => false } as any,
			toolCallRounds: [{ id: 'r1', response: '', toolInputRetry: 0, toolCalls: [] }],
		})).toBeUndefined();
	});

	test('delta cursor does NOT advance on failure (retryable)', async () => {
		const processor = new BackgroundTodoProcessor();
		processor.start(makeDelta(['r1']), async () => {
			throw new Error('oops');
		});
		await processor.waitForCompletion();

		// r1 should NOT be marked processed on failure — a later pass can retry
		expect(processor.deltaTracker.getDelta({
			query: 'fix',
			history: [],
			chatVariables: { hasVariables: () => false } as any,
			toolCallRounds: [{ id: 'r1', response: '', toolInputRetry: 0, toolCalls: [] }],
		})).toBeDefined();
	});

	test('delta cursor does NOT advance when advanceCursor is false', async () => {
		const processor = new BackgroundTodoProcessor();
		processor.start(makeDelta(['r1']), async () => ({ outcome: 'success' }), undefined, false);
		await processor.waitForCompletion();

		expect(processor.deltaTracker.getDelta({
			query: 'fix',
			history: [],
			chatVariables: { hasVariables: () => false } as any,
			toolCallRounds: [{ id: 'r1', response: '', toolInputRetry: 0, toolCalls: [] }],
		})).toBeDefined();
	});

	test('coalesces concurrent updates', async () => {
		const processor = new BackgroundTodoProcessor();
		let workCallCount = 0;

		// Start a pass that will be slow
		processor.start(makeDelta(['r1']), async () => {
			workCallCount++;
			await new Promise(resolve => setTimeout(resolve, 50));
			return { outcome: 'success' };
		});

		// While in-progress, stash two more deltas (only latest should survive)
		processor.start(makeDelta(['r2']), async () => {
			workCallCount++;
			return { outcome: 'success' };
		});
		processor.start(makeDelta(['r3']), async () => {
			workCallCount++;
			return { outcome: 'success' };
		});

		// Wait for everything
		await processor.waitForCompletion();
		// First pass + latest pending = 2 invocations (r2 delta was replaced by r3)
		expect(workCallCount).toBe(2);
	});

	test('requestRegularPass skips queued work when only in-flight rounds were present', async () => {
		const telemetryEvents: string[] = [];
		const context = makeExecutionContext(['r1'], { endpointDelayMs: 20, telemetryEvents });
		const processor = new BackgroundTodoProcessor();

		processor.requestRegularPass(makeDelta(['r1']), context);
		processor.requestRegularPass(makeDelta(['r1']), context);
		await processor.waitForCompletion();

		expect({
			state: processor.state,
			telemetryEventCount: telemetryEvents.length,
			hasRemainingDelta: processor.deltaTracker.getDelta(context.promptContext) !== undefined,
		}).toEqual({
			state: BackgroundTodoProcessorState.Idle,
			telemetryEventCount: 1,
			hasRemainingDelta: false,
		});
	});

	test('cancel stops in-flight work', async () => {
		const processor = new BackgroundTodoProcessor();
		let completed = false;
		processor.start(makeDelta(['r1']), async () => {
			await new Promise(resolve => setTimeout(resolve, 200));
			completed = true;
			return { outcome: 'success' };
		});
		processor.cancel();
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
		// Give time for the cancelled work to settle
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(completed).toBe(false);
	});

	test('respects parent cancellation token', async () => {
		const processor = new BackgroundTodoProcessor();
		const cts = new CancellationTokenSource();
		let sawCancellation = false;

		processor.start(makeDelta(['r1']), async (_delta, token) => {
			// Wait and check cancellation
			await new Promise(resolve => setTimeout(resolve, 50));
			sawCancellation = token.isCancellationRequested;
			return { outcome: 'noop' };
		}, cts.token);

		cts.cancel();
		await processor.waitForCompletion();
		expect(sawCancellation).toBe(true);
		cts.dispose();
	});

	// ── requestFinalReview ──────────────────────────────────────

	test('requestFinalReview is a no-op when no context has been recorded', () => {
		const processor = new BackgroundTodoProcessor();
		processor.requestFinalReview('turn-1');
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});

	test('requestFinalReview is a no-op when no todos have been created', async () => {
		const processor = new BackgroundTodoProcessor();
		// Simulate a noop pass so a context exists but hasCreatedTodos remains false
		processor.start(makeDelta(['r1']), async () => ({ outcome: 'noop' }));
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(false);
		processor.requestFinalReview('turn-1');
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});

	test('requestFinalReview runs when processor is idle and todos exist', async () => {
		const processor = new BackgroundTodoProcessor();
		// Use requestRegularPass so _lastExecutionContext is recorded
		processor.requestRegularPass(makeDelta(['r1']), makeExecutionContext(['r1']));
		// Force hasCreatedTodos
		await processor.waitForCompletion();
		// The work threw because the mock context has no real endpoint, but
		// we need hasCreatedTodos = true. Use the low-level start() for that.
		processor.start(makeDelta(['r2']), async () => ({ outcome: 'success' }));
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(true);
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);

		// Now request final review — it should transition to InProgress
		processor.requestFinalReview('turn-1');
		expect(processor.state).toBe(BackgroundTodoProcessorState.InProgress);
		await processor.waitForCompletion();
	});

	test('requestFinalReview deduplicates by turn ID', async () => {
		const processor = new BackgroundTodoProcessor();
		processor.start(makeDelta(['r1']), async () => ({ outcome: 'success' }));
		await processor.waitForCompletion();
		// Record a context
		processor.requestRegularPass(makeDelta(['r2']), makeExecutionContext(['r2']));
		await processor.waitForCompletion();

		// First request should be accepted
		processor.requestFinalReview('turn-1');
		expect(processor.state).toBe(BackgroundTodoProcessorState.InProgress);
		await processor.waitForCompletion();

		// Second request with same turn ID should be a no-op
		processor.requestFinalReview('turn-1');
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});

	test('requestFinalReview drains after a regular pass completes', async () => {
		const logMessages: string[] = [];
		const telemetryEvents: string[] = [];
		const processor = new BackgroundTodoProcessor(makeLogService(logMessages));
		const ranWork: string[] = [];

		processor.start(makeDelta(['r0']), async () => ({ outcome: 'success' }));
		await processor.waitForCompletion();
		logMessages.length = 0;

		// Start a slow regular pass
		processor.start(makeDelta(['r1']), async () => {
			ranWork.push('regular');
			await new Promise(resolve => setTimeout(resolve, 50));
			return { outcome: 'success' };
		});

		// While in progress, record context and request final review
		processor.requestRegularPass(makeDelta(['r2']), makeExecutionContext(['r1', 'r2'], { telemetryEvents }));
		processor.requestFinalReview('turn-1');

		await processor.waitForCompletion();

		const passStartIndexes = logMessages
			.map((message, index) => message.includes('starting pass #') ? index : -1)
			.filter(index => index !== -1);
		const finalReviewIndex = logMessages.findIndex(message => message.includes('draining final review'));
		expect({
			state: processor.state,
			ranWork,
			telemetryEventCount: telemetryEvents.length,
			passStartCount: passStartIndexes.length,
			coalescedRegularBeforeFinalReview: passStartIndexes[1] !== undefined && passStartIndexes[1] < finalReviewIndex,
			finalReviewBeforeFinalPass: passStartIndexes[2] !== undefined && finalReviewIndex < passStartIndexes[2],
		}).toEqual({
			state: BackgroundTodoProcessorState.Idle,
			ranWork: ['regular'],
			telemetryEventCount: 2,
			passStartCount: 3,
			coalescedRegularBeforeFinalReview: true,
			finalReviewBeforeFinalPass: true,
		});
	});

	test('coalesced pending delta runs with its own queued work callback', async () => {
		const processor = new BackgroundTodoProcessor();
		const ranWork: string[] = [];

		// Start a slow first pass with workA.
		processor.start(makeDelta(['r1']), async () => {
			ranWork.push('A');
			await new Promise(resolve => setTimeout(resolve, 50));
			return { outcome: 'success' };
		});
		expect(processor.state).toBe(BackgroundTodoProcessorState.InProgress);

		// Queue a second pass with a *different* work callback (workB).
		processor.start(makeDelta(['r2']), async () => {
			ranWork.push('B');
			return { outcome: 'success' };
		});

		await processor.waitForCompletion();
		expect(ranWork).toEqual(['A', 'B']);
	});

	test('cancel clears pending coalesced work and final review', async () => {
		const processor = new BackgroundTodoProcessor();
		const ranWork: string[] = [];

		processor.start(makeDelta(['r1']), async () => {
			ranWork.push('A');
			await new Promise(resolve => setTimeout(resolve, 50));
			return { outcome: 'success' };
		});

		processor.start(makeDelta(['r2']), async () => {
			ranWork.push('B');
			return { outcome: 'success' };
		});

		processor.cancel();
		await new Promise(resolve => setTimeout(resolve, 80));

		expect(ranWork).toEqual(['A']);
		expect(processor.state).toBe(BackgroundTodoProcessorState.Idle);
	});
});
