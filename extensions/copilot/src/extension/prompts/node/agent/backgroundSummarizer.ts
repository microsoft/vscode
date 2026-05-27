/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAIContextManagementResponse } from '../../../../platform/networking/common/openai';
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

export interface IBackgroundResponsesApiCompactionResult {
	readonly kind: 'responsesApiCompaction';
	readonly compaction: OpenAIContextManagementResponse;
	/** Round IDs represented by the prompt sent to the background compaction request. */
	readonly includedRoundIds: readonly string[];
	readonly promptTokens?: number;
	readonly promptCacheTokens?: number;
	readonly outputTokens?: number;
	readonly durationMs?: number;
	readonly model?: string;
}

export type IBackgroundCompactionResult = IBackgroundSummarizationResult | IBackgroundResponsesApiCompactionResult;

export function isBackgroundResponsesApiCompactionResult(result: IBackgroundCompactionResult): result is IBackgroundResponsesApiCompactionResult {
	return 'kind' in result && result.kind === 'responsesApiCompaction';
}

/**
 * Thresholds used by {@link shouldKickOffBackgroundSummarization}. Exported so
 * tests can reference the same numbers without repeating them.
 */
export const BackgroundSummarizationThresholds = {
	/** Temporary testing threshold: minimum of the warm-cache token range. */
	warmTokenJitterMin: 100,
	/** Width of the warm-cache token range; together with `warmTokenJitterMin` yields [100, 110). */
	warmTokenJitterSpan: 10,
	/**
	 * Cold-cache emergency ratio. Above this we kick off even without a warmed
	 * cache to avoid forcing a foreground sync compaction on the next render.
	 * Tuned low enough that long-running sessions stay ahead of the budget
	 * without relying on foreground compaction.
	 */
	emergency: 0.90,
} as const;

/**
 * Decide whether to kick off post-render background compaction.
 *
 * Prompt-cache parity matters, so we:
 *   - require a completed tool call in this turn ("warm" cache) before
 *     firing at the temporary testing threshold of ~100 tokens;
 *   - allow an emergency kick-off at >= 0.90 even with a cold cache to
 *     avoid forcing a foreground sync compaction on the next render.
 *
 * The production threshold was historically ratio-based and jittered around
 * 0.80; this local value is lowered for testing.
 *
 * `rng` is only consumed on the warm-cache branch, which keeps deterministic
 * tests straightforward.
 */
export function shouldKickOffBackgroundSummarization(
	postRenderTokenCount: number,
	postRenderRatio: number,
	cacheWarm: boolean,
	rng: () => number,
): boolean {
	const t = BackgroundSummarizationThresholds;
	if (!cacheWarm) {
		return postRenderRatio >= t.emergency;
	}
	const jitteredTokenThreshold = t.warmTokenJitterMin + rng() * t.warmTokenJitterSpan;
	return postRenderTokenCount >= jitteredTokenThreshold;
}

/**
 * Tracks a single background summarization pass for one chat session.
 *
 * The singleton `AgentIntent` owns one instance per session (keyed by
 * `sessionId`). `AgentIntentInvocation.buildPrompt` queries the state
 * on every tool-call iteration to decide whether to start, wait for, or
 * apply a background summary.
 */
export class BackgroundSummarizer<TResult extends IBackgroundCompactionResult = IBackgroundSummarizationResult> {

	private _state: BackgroundSummarizationState = BackgroundSummarizationState.Idle;
	private _result: TResult | undefined;
	private _error: unknown;
	private _promise: Promise<void> | undefined;
	private _cts: CancellationTokenSource | undefined;

	readonly modelMaxPromptTokens: number;

	get state(): BackgroundSummarizationState { return this._state; }
	get error(): unknown { return this._error; }
	/** Peek at a completed result without resetting state, for results awaiting a safe replay boundary. */
	get completedResult(): TResult | undefined { return this._state === BackgroundSummarizationState.Completed ? this._result : undefined; }

	get token() { return this._cts?.token; }

	constructor(modelMaxPromptTokens: number) {
		this.modelMaxPromptTokens = modelMaxPromptTokens;
	}

	start(work: (token: CancellationToken) => Promise<TResult>, parentToken?: CancellationToken): void {
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

	consumeAndReset(): TResult | undefined {
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
