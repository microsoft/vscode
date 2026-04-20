/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { BackgroundSummarizationState, BackgroundSummarizationThresholds, BackgroundSummarizer, IBackgroundSummarizationResult, shouldKickOffBackgroundSummarization } from '../backgroundSummarizer';

describe('BackgroundSummarizer', () => {

	test('initial state is Idle', () => {
		const summarizer = new BackgroundSummarizer(100_000);
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
		expect(summarizer.error).toBeUndefined();
		expect(summarizer.token).toBeUndefined();
	});

	test('start transitions to InProgress', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => {
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		expect(summarizer.state).toBe(BackgroundSummarizationState.InProgress);
		expect(summarizer.token).toBeDefined();
		await summarizer.waitForCompletion();
	});

	test('successful work transitions to Completed', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		const result: IBackgroundSummarizationResult = { summary: 'test summary', toolCallRoundId: 'round1' };
		summarizer.start(async _token => result);
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Completed);
	});

	test('failed work transitions to Failed', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => {
			throw new Error('summarization failed');
		});
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Failed);
		expect(summarizer.error).toBeInstanceOf(Error);
	});

	test('consumeAndReset returns result and resets to Idle', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		const expected: IBackgroundSummarizationResult = { summary: 'test summary', toolCallRoundId: 'round1' };
		summarizer.start(async _token => expected);
		await summarizer.waitForCompletion();

		const result = summarizer.consumeAndReset();
		expect(result).toEqual(expected);
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
		expect(summarizer.token).toBeUndefined();
	});

	test('consumeAndReset returns undefined while InProgress', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });
		summarizer.start(async _token => {
			await gate;
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		expect(summarizer.consumeAndReset()).toBeUndefined();
		expect(summarizer.state).toBe(BackgroundSummarizationState.InProgress);
		summarizer.cancel();
		resolveFn!();
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	});

	test('consumeAndReset returns undefined after failure', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => {
			throw new Error('fail');
		});
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Failed);

		const result = summarizer.consumeAndReset();
		expect(result).toBeUndefined();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
	});

	test('start is a no-op when already InProgress', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let callCount = 0;
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });
		summarizer.start(async _token => {
			callCount++;
			await gate;
			return { summary: 'first', toolCallRoundId: 'r1' };
		});
		// Second start should be ignored
		summarizer.start(async _token => {
			callCount++;
			return { summary: 'second', toolCallRoundId: 'r2' };
		});
		resolveFn!();
		await summarizer.waitForCompletion();
		expect(callCount).toBe(1);
		expect(summarizer.consumeAndReset()?.summary).toBe('first');
	});

	test('start is a no-op when already Completed', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => ({ summary: 'first', toolCallRoundId: 'r1' }));
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Completed);

		// Second start should be ignored because state is Completed
		summarizer.start(async _token => ({ summary: 'second', toolCallRoundId: 'r2' }));
		expect(summarizer.state).toBe(BackgroundSummarizationState.Completed);
		expect(summarizer.consumeAndReset()?.summary).toBe('first');
	});

	test('start retries after Failed state', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => {
			throw new Error('fail');
		});
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Failed);

		// Should be allowed to retry
		summarizer.start(async _token => ({ summary: 'retry', toolCallRoundId: 'r2' }));
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Completed);
		expect(summarizer.consumeAndReset()?.summary).toBe('retry');
	});

	test('cancel resets state to Idle', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });
		summarizer.start(async _token => {
			await gate;
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		expect(summarizer.state).toBe(BackgroundSummarizationState.InProgress);

		summarizer.cancel();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
		expect(summarizer.token).toBeUndefined();
		expect(summarizer.error).toBeUndefined();
		resolveFn!();
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	});

	test('cancel prevents .then() from setting state to Completed', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });

		summarizer.start(async _token => {
			await gate;
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		expect(summarizer.state).toBe(BackgroundSummarizationState.InProgress);

		// Cancel before the work completes
		summarizer.cancel();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);

		// Let the work complete — the .then() should NOT overwrite the Idle state.
		// Use setTimeout to yield to the macrotask queue, guaranteeing all
		// microtasks (including the .then() handler) have drained first.
		resolveFn!();
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
	});

	test('cancel prevents .catch() from setting state to Failed', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let rejectFn: (err: Error) => void;
		const gate = new Promise<void>((_, reject) => { rejectFn = reject; });

		summarizer.start(async _token => {
			await gate;
			return { summary: 'unreachable', toolCallRoundId: 'r1' };
		});

		summarizer.cancel();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);

		// Let the work fail — the .catch() should NOT overwrite the Idle state.
		// Use setTimeout to yield to the macrotask queue, guaranteeing all
		// microtasks (including the .catch() handler) have drained first.
		rejectFn!(new Error('fail'));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
		expect(summarizer.error).toBeUndefined();
	});

	test('waitForCompletion is a no-op when nothing started', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
	});

	test('multiple waitForCompletion calls resolve correctly', async () => {
		const summarizer = new BackgroundSummarizer(100_000);
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });
		summarizer.start(async _token => {
			await gate;
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		resolveFn!();
		// Both should resolve without error
		await Promise.all([
			summarizer.waitForCompletion(),
			summarizer.waitForCompletion(),
		]);
		expect(summarizer.state).toBe(BackgroundSummarizationState.Completed);
	});

	test('waitForCompletion resolves without error even when work fails', async () => {
		// agentIntent.ts calls waitForCompletion without try/catch in the
		// blocking paths — verify it swallows the error.
		const summarizer = new BackgroundSummarizer(100_000);
		summarizer.start(async _token => {
			throw new Error('network timeout');
		});
		// Should not throw
		await summarizer.waitForCompletion();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Failed);
	});

	test('cancel during waitForCompletion leaves state Idle with no result', async () => {
		// Tests the race where a caller is awaiting completion and cancellation happens
		const summarizer = new BackgroundSummarizer(100_000);
		let resolveFn: () => void;
		const gate = new Promise<void>(resolve => { resolveFn = resolve; });
		summarizer.start(async _token => {
			await gate;
			return { summary: 'test', toolCallRoundId: 'r1' };
		});
		// Start awaiting completion (captures the promise but doesn't resolve yet)
		const completionPromise = summarizer.waitForCompletion();
		// Cancel while waitForCompletion is pending
		summarizer.cancel();
		// Let the work resolve so the promise settles
		resolveFn!();
		await completionPromise;
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		// State should be Idle (cancel resets) and no result available
		const result = summarizer.consumeAndReset();
		expect(result).toBeUndefined();
		expect(summarizer.state).toBe(BackgroundSummarizationState.Idle);
	});
});

const { base, warmJitterMin, warmJitterSpan, emergency } = BackgroundSummarizationThresholds;

// rng that always returns 0.5 -> threshold sits exactly at the center of the
// jitter range. With [0.78, 0.82) that's 0.80.
const midRng = () => 0.5;
// rng that forces the maximum of the jitter range.
const maxRng = () => 1 - Number.EPSILON;
// rng that should never be called on cold/non-inline branches.
const unusedRng = () => {
	throw new Error('rng should not be consumed');
};

describe('shouldKickOffBackgroundSummarization', () => {
	describe('inline + cold cache', () => {
		test('defers kick-off below the emergency threshold', () => {
			// Cold turn sitting in the old 0.80 trigger band — must not fire.
			expect(shouldKickOffBackgroundSummarization(0.85, true, false, unusedRng)).toBe(false);
		});

		test('kicks off at the emergency threshold', () => {
			expect(shouldKickOffBackgroundSummarization(emergency, true, false, unusedRng)).toBe(true);
			expect(shouldKickOffBackgroundSummarization(0.91, true, false, unusedRng)).toBe(true);
		});

		test('does not consume the rng on the cold branch', () => {
			// The unusedRng would throw if consumed — asserting no throw is the check.
			expect(() => shouldKickOffBackgroundSummarization(0.85, true, false, unusedRng)).not.toThrow();
			expect(() => shouldKickOffBackgroundSummarization(0.91, true, false, unusedRng)).not.toThrow();
		});
	});

	describe('inline + warm cache', () => {
		test('kicks off at the jittered midpoint (0.80) when ratio meets it', () => {
			expect(shouldKickOffBackgroundSummarization(0.80, true, true, midRng)).toBe(true);
			expect(shouldKickOffBackgroundSummarization(0.81, true, true, midRng)).toBe(true);
		});

		test('defers when ratio is under the jittered threshold', () => {
			// midRng -> 0.80; 0.77 is below the entire jitter window.
			expect(shouldKickOffBackgroundSummarization(0.77, true, true, midRng)).toBe(false);
			// Also below the minimum of the window regardless of rng.
			expect(shouldKickOffBackgroundSummarization(warmJitterMin - 0.0001, true, true, () => 0)).toBe(false);
		});

		test('respects the top of the jitter range', () => {
			// With maxRng, threshold approaches warmJitterMin + warmJitterSpan = 0.82.
			// 0.81 lands below it, so we defer.
			expect(shouldKickOffBackgroundSummarization(0.81, true, true, maxRng)).toBe(false);
			// 0.82 meets it.
			expect(shouldKickOffBackgroundSummarization(warmJitterMin + warmJitterSpan, true, true, maxRng)).toBe(true);
		});
	});

	describe('non-inline path', () => {
		test('uses the fixed base threshold and ignores cache warmth', () => {
			// Warm, cold — both behave the same on non-inline.
			expect(shouldKickOffBackgroundSummarization(base, false, false, unusedRng)).toBe(true);
			expect(shouldKickOffBackgroundSummarization(base, false, true, unusedRng)).toBe(true);
			expect(shouldKickOffBackgroundSummarization(base - 0.0001, false, true, unusedRng)).toBe(false);
		});
	});
});
