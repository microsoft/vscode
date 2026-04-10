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
