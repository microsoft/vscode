/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';

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
	readonly turnId: string;
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
						if (entry.steeringPendingId) {
							this._onSteeringYielded(entry.steeringPendingId);
						}
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
		private readonly _onSteeringYielded: (pendingId: string) => void,
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
	 * Most-recent in-flight or queued entry, used by steering to inherit
	 * its parent's `turnId`. Prefers the in-flight head over the latest
	 * queued entry (matches CONTEXT.md M10: steering folds into the
	 * in-progress protocol Turn).
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
