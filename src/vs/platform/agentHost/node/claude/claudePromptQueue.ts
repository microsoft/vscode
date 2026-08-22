/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';

/**
 * One {@link SDKUserMessage} the queue has handed to (or is about to
 * hand to) the SDK. Lifecycle:
 *   1. Created by the caller and pushed via {@link ClaudePromptQueue.push}.
 *   2. Shifted off the to-yield list and pushed to the yielded list when
 *      the prompt iterable hands it to the SDK.
 *   3. Shifted off the yielded list and {@link deferred} settled when
 *      the matching SDK `result` message arrives (via
 *      {@link ClaudePromptQueue.settleHead}).
 */
export interface IPendingSdkMessage {
	readonly sdkMessage: SDKUserMessage;
	readonly sdkUuid: string;
	/** Protocol turn these events belong to; reassigned by {@link ClaudePromptQueue.retargetTurn}. */
	turnId: string;
	readonly clientContext?: IAgentHostClientTelemetryContext;
	/** Times the protocol turn; replaced along with {@link turnId}. */
	stopWatch: StopWatch;
	readonly deferred: DeferredPromise<void>;
	readonly steeringPendingId?: string;
}

/**
 * Owns the prompt queue + the async iterable handed to
 * `WarmQuery.query()`. Knows nothing about the SDK Query lifecycle,
 * config push, or message dispatch — those live on the pipeline.
 *
 * Invariants:
 *   • Pushing wakes the iterable's parked `next()`.
 *   • The iterable returns `done` when the supplied `getAbortSignal()`
 *     is aborted; pipeline calls {@link notifyAborted} after flipping
 *     the controller so the parked `next()` returns immediately.
 *   • {@link settleHead} pops the head of the yielded list (called by
 *     the consumer loop on every `result` message).
 *   • {@link failAll} rejects every pending deferred and clears both
 *     lists; used by abort and crash fan-out.
 *   • {@link resetForRebind} re-creates the parked deferred for a fresh
 *     Query binding (the queue itself survives across rebinds).
 */
export class ClaudePromptQueue extends Disposable {

	private _toYield: IPendingSdkMessage[] = [];
	private _yielded: IPendingSdkMessage[] = [];
	/**
	 * Entries that have been popped by {@link settleHead} during the
	 * current turn but whose deferreds haven't been completed yet — we
	 * batch-complete them when the turn fully drains so an intermediate
	 * `result` (steering preempt; CONTEXT.md M10) does NOT settle the
	 * original `sendMessage`'s deferred.
	 */
	private _popped: IPendingSdkMessage[] = [];
	private _pendingPromptDeferred = new DeferredPromise<void>();

	readonly iterable: AsyncIterable<SDKUserMessage> = {
		[Symbol.asyncIterator]: () => ({
			next: async () => {
				while (true) {
					if (this._getAbortSignal().aborted) {
						return { done: true, value: undefined };
					}
					if (this._toYield.length > 0) {
						const entry = this._toYield.shift()!;
						this._yielded.push(entry);
						this._logService.info(`[Claude:${this._sessionId}] queue yielded sdkUuid=${entry.sdkUuid} turnId=${entry.turnId}${entry.steeringPendingId ? ` steeringPendingId=${entry.steeringPendingId}` : ''}`);
						return { done: false, value: entry.sdkMessage };
					}
					await this._pendingPromptDeferred.p;
					this._pendingPromptDeferred = new DeferredPromise<void>();
				}
			},
		}),
	};

	constructor(
		private readonly _sessionId: string,
		private readonly _getAbortSignal: () => AbortSignal,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/** True iff no entries are queued or in-flight. */
	get isEmpty(): boolean {
		return this._toYield.length === 0 && this._yielded.length === 0;
	}
	/**
	 * Push an entry. Resolves with the entry's deferred (which the
	 * consumer settles on `result` via {@link settleHead}).
	 */
	push(entry: IPendingSdkMessage): Promise<void> {
		this._toYield.push(entry);
		this._pendingPromptDeferred.complete();
		return entry.deferred.p;
	}

	/**
	 * Most-recent in-flight or queued entry, whose `turnId` a steer inherits
	 * until it preempts that turn and is promoted to its own.
	 */
	peekParent(): IPendingSdkMessage | undefined {
		return this._yielded[0] ?? this._toYield[this._toYield.length - 1];
	}

	/**
	 * Pop the head of the yielded list. If the queue is now fully
	 * drained (no more pending or in-flight entries), batch-complete
	 * every popped-but-deferred deferred from this turn including the
	 * one we just popped. Otherwise hold the popped entry's deferred
	 * until the turn ends — the M10 invariant for steering preempt.
	 * Called by the consumer on every `result` message.
	 */
	settleHead(): IPendingSdkMessage | undefined {
		const completed = this._yielded.shift();
		if (!completed) {
			return undefined;
		}
		if (this.isEmpty) {
			completed.deferred.complete();
			for (const e of this._popped) {
				if (!e.deferred.isSettled) {
					e.deferred.complete();
				}
			}
			this._popped = [];
		} else {
			this._popped.push(completed);
		}
		return completed;
	}

	/** Moves every entry to a new protocol turn, so later events and the final completion follow a promoted steer. */
	retargetTurn(turnId: string, stopWatch: StopWatch): void {
		for (const list of [this._toYield, this._yielded, this._popped]) {
			for (const entry of list) {
				entry.turnId = turnId;
				entry.stopWatch = stopWatch;
			}
		}
	}

	/** Reject every pending deferred with `err` and clear all lists. */
	failAll(err: Error): void {
		const rejectAll = (list: IPendingSdkMessage[]) => {
			for (const entry of list) {
				if (!entry.deferred.isSettled) {
					entry.deferred.error(err);
				}
			}
		};
		rejectAll(this._toYield);
		rejectAll(this._yielded);
		rejectAll(this._popped);
		this._toYield = [];
		this._yielded = [];
		this._popped = [];
	}

	/** Wake any parked `next()` — call after the controller is aborted so the iterable returns `done`. */
	notifyAborted(): void {
		this._pendingPromptDeferred.complete();
	}

	/** Re-create the parked deferred for a fresh Query binding. */
	resetForRebind(): void {
		this._pendingPromptDeferred = new DeferredPromise<void>();
	}
}
