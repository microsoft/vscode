/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';

/**
 * State machine for background conversation summarization.
 *
 * Lifecycle:
 *   Idle → InProgress → Completed / Failed
 *                              ↓          ↓
 *                        (consumeAndReset → Idle)
 *                                    Failed → InProgress (retry)
 */

export const enum BackgroundSummarizationState {
	/** No summarization running. */
	Idle = 'Idle',
	/** An LLM summarization request is in flight. */
	InProgress = 'InProgress',
	/** Summarization finished successfully — summary text is available. */
	Completed = 'Completed',
	/** Summarization failed. */
	Failed = 'Failed',
}

export interface IBackgroundSummarizationResult {
	readonly summary: string;
	readonly toolCallRoundId: string;
	readonly promptTokens?: number;
	readonly promptCacheTokens?: number;
	readonly outputTokens?: number;
	readonly durationMs?: number;
	readonly model?: string;
	readonly summarizationMode?: string;
	readonly numRounds?: number;
	readonly numRoundsSinceLastSummarization?: number;
}

/**
 * Thresholds used by {@link shouldKickOffBackgroundSummarization}. Exported so
 * tests can reference the same numbers without repeating them.
 */
export const BackgroundSummarizationThresholds = {
	/** Trigger ratio for the non-inline path (no prompt-cache benefit). */
	base: 0.80,
	/** Minimum of the jittered warm-cache range for the inline path. */
	warmJitterMin: 0.78,
	/** Width of the jittered warm-cache range; together with `warmJitterMin` yields [0.78, 0.82). */
	warmJitterSpan: 0.04,
	/**
	 * Cold-cache emergency ratio for the inline path. Above this we kick off
	 * even without a warmed cache to avoid forcing a foreground sync compaction
	 * on the next render. Tuned low enough that long-running sessions stay
	 * ahead of the budget without relying on foreground compaction.
	 */
	emergency: 0.90,
} as const;

/**
 * Decide whether to kick off post-render background compaction.
 *
 * For the inline-summarization path prompt-cache parity matters, so we:
 *   - require a completed tool call in this turn ("warm" cache) before
 *     firing at the normal, jittered ~0.80 threshold;
 *   - allow an emergency kick-off at >= 0.90 even with a cold cache to
 *     avoid forcing a foreground sync compaction on the next render.
 *
 * The jitter range straddles the historical 0.80 threshold (not "lower the
 * bar") — the goal is to avoid always firing at the exact same boundary,
 * not to kick off systematically earlier.
 *
 * The non-inline path forks its own prompt (no cache benefit) and keeps the
 * simple >= 0.80 behavior. `rng` is only consumed on the warm-cache inline
 * branch, which keeps deterministic tests straightforward.
 */
export function shouldKickOffBackgroundSummarization(
	postRenderRatio: number,
	useInlineSummarization: boolean,
	cacheWarm: boolean,
	rng: () => number,
): boolean {
	const t = BackgroundSummarizationThresholds;
	if (!useInlineSummarization) {
		return postRenderRatio >= t.base;
	}
	if (!cacheWarm) {
		return postRenderRatio >= t.emergency;
	}
	const jittered = t.warmJitterMin + rng() * t.warmJitterSpan;
	return postRenderRatio >= jittered;
}

/**
 * Tracks a single background summarization pass for one chat session.
 *
 * The singleton `AgentIntent` owns one instance per session (keyed by
 * `sessionId`). `AgentIntentInvocation.buildPrompt` queries the state
 * on every tool-call iteration to decide whether to start, wait for, or
 * apply a background summary.
 */
export class BackgroundSummarizer {

	private _state: BackgroundSummarizationState = BackgroundSummarizationState.Idle;
	private _result: IBackgroundSummarizationResult | undefined;
	private _error: unknown;
	private _promise: Promise<void> | undefined;
	private _cts: CancellationTokenSource | undefined;

	readonly modelMaxPromptTokens: number;

	get state(): BackgroundSummarizationState { return this._state; }
	get error(): unknown { return this._error; }

	get token() { return this._cts?.token; }

	constructor(modelMaxPromptTokens: number) {
		this.modelMaxPromptTokens = modelMaxPromptTokens;
	}

	start(work: (token: CancellationToken) => Promise<IBackgroundSummarizationResult>, parentToken?: CancellationToken): void {
		if (this._state !== BackgroundSummarizationState.Idle && this._state !== BackgroundSummarizationState.Failed) {
			return; // already running or completed
		}

		this._state = BackgroundSummarizationState.InProgress;
		this._error = undefined;
		this._cts = new CancellationTokenSource(parentToken);
		const token = this._cts.token;
		this._promise = work(token).then(
			result => {
				if (this._state !== BackgroundSummarizationState.InProgress) {
					return; // cancelled while in flight
				}
				this._result = result;
				this._state = BackgroundSummarizationState.Completed;
			},
			err => {
				if (this._state !== BackgroundSummarizationState.InProgress) {
					return; // cancelled while in flight
				}
				this._error = err;
				this._state = BackgroundSummarizationState.Failed;
			},
		);
	}

	async waitForCompletion(): Promise<void> {
		if (this._promise) {
			await this._promise;
		}
	}

	consumeAndReset(): IBackgroundSummarizationResult | undefined {
		if (this._state === BackgroundSummarizationState.InProgress) {
			return undefined;
		}
		const result = this._result;
		this._state = BackgroundSummarizationState.Idle;
		this._result = undefined;
		this._error = undefined;
		this._promise = undefined;
		this._cts?.dispose();
		this._cts = undefined;
		return result;
	}

	cancel(): void {
		this._cts?.cancel();
		this._cts?.dispose();
		this._cts = undefined;
		this._state = BackgroundSummarizationState.Idle;
		this._result = undefined;
		this._error = undefined;
		this._promise = undefined;
	}
}
