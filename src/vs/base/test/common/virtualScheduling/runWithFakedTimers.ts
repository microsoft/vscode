/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../common/cancellation.js';
import { drainMicrotasksEmbedding } from './embedding.js';
import { pushGlobalTimeApi } from './globalTimeApi.js';
import { realTimeApi } from './timeApi.js';
import { untilToken, VirtualTimeProcessor } from './processor.js';
import { createRecordingRealTimeApi, RecordedTimerEvent } from './recordingTimeApi.js';
import { VirtualClock } from './virtualClock.js';
import { createVirtualTimeApi } from './virtualTimeApi.js';

export interface RunWithFakedTimersOptions {
	readonly startTime?: number;
	/** Default `true`. Set `false` to bypass virtual time entirely (for
	 *  cases where the same test is parameterised over real/virtual time). */
	readonly useFakeTimers?: boolean;
	/** No effect in the new processor; accepted for legacy compatibility.
	 *  The drain-microtasks embedding picks the fastest available macrotask
	 *  primitive automatically. */
	readonly useSetImmediate?: boolean;
	/** Maximum number of virtual events the run is allowed to execute
	 *  before being rejected. Default 100. */
	readonly maxTaskCount?: number;
	/**
	 * If set, called once `fn` resolves with the recorded timer events.
	 * In virtual mode the events come from the {@link VirtualTimeProcessor}'s
	 * own history; in real mode a recording wrapper around the host time
	 * API is installed for the duration of `fn`. Useful for swimlane
	 * diagnostics.
	 */
	readonly onHistory?: (history: readonly RecordedTimerEvent[]) => void;
}

/**
 * Run `fn` with a virtual clock installed as the global time API.
 *
 * After `fn` resolves, the virtual queue is drained (so any timers `fn`
 * scheduled and `await`ed for, transitively, complete deterministically).
 * If `fn` throws, the queue is *not* drained — the original error is
 * re-thrown immediately.
 */
export async function runWithFakedTimers<T>(
	options: RunWithFakedTimersOptions,
	fn: () => Promise<T>,
): Promise<T> {
	const useFakeTimers = options.useFakeTimers !== false;
	if (!useFakeTimers) {
		if (!options.onHistory) { return fn(); }
		const history: RecordedTimerEvent[] = [];
		const restore = pushGlobalTimeApi(createRecordingRealTimeApi(history));
		try {
			return await fn();
		} finally {
			restore.dispose();
			options.onHistory(history);
		}
	}

	const clock = new VirtualClock(options.startTime ?? 0);
	const virtualApi = createVirtualTimeApi(clock);
	const restoreGlobals = pushGlobalTimeApi(virtualApi);

	const processor = new VirtualTimeProcessor(
		clock,
		drainMicrotasksEmbedding(realTimeApi),
		realTimeApi,
		{ defaultMaxEvents: options.maxTaskCount ?? 100 },
	);

	const cts = new CancellationTokenSource();
	const runPromise = processor.run({ until: untilToken(cts.token) });

	let didThrow = true;
	let result: T;
	try {
		result = await fn();
		didThrow = false;
	} finally {
		// Stop intercepting real-time scheduling before draining: any tasks
		// scheduled during the drain itself must not land back in the
		// virtual queue.
		restoreGlobals.dispose();
		cts.cancel();

		try {
			if (!didThrow) {
				await runPromise;
			} else {
				// Avoid an unhandled rejection in case disposal rejects the
				// run.
				runPromise.catch(() => { /* swallowed: fn() already failed */ });
			}
		} finally {
			cts.dispose();
			options.onHistory?.(processor.history);
			processor.dispose();
		}
	}

	return result;
}
