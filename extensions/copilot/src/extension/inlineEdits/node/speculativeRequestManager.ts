/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { StatelessNextEditRequest } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { CachedOrRebasedEdit } from './nextEditCache';
import { NextEditResult } from './nextEditResult';

/**
 * Reasons why a speculative request was cancelled. Recorded on the request's
 * log context so each cancellation has an attributable cause.
 */
export const enum SpeculativeCancelReason {

	/** The originating suggestion was rejected by the user. */
	Rejected = 'rejected',

	/** The originating suggestion was dismissed without being superseded. */
	IgnoredDismissed = 'ignoredDismissed',

	/** A new fetch is starting whose `(docId, postEditContent)` doesn't match. */
	Superseded = 'superseded',

	/** A newer speculative is being installed in this slot. */
	Replaced = 'replaced',

	/** The user's edits moved off the type-through trajectory toward `postEditContent`. */
	DivergedFromTrajectoryForm = 'divergedFromTrajectoryForm',
	DivergedFromTrajectoryPrefix = 'divergedFromTrajectoryPrefix',
	DivergedFromTrajectoryMiddle = 'divergedFromTrajectoryMiddle',
	DivergedFromTrajectorySuffix = 'divergedFromTrajectorySuffix',

	/** `clearCache()` was invoked. */
	CacheCleared = 'cacheCleared',

	/** The target document was removed from the workspace. */
	DocumentClosed = 'documentClosed',

	/** The provider was disposed. */
	Disposed = 'disposed',
}

export interface SpeculativePendingRequest {
	readonly request: StatelessNextEditRequest<CachedOrRebasedEdit>;
	readonly docId: DocumentId;
	readonly postEditContent: string;
	/** preEditDocument[0..editStart] — the doc text before the edit window. */
	readonly trajectoryPrefix: string;
	/** preEditDocument[editEnd..] — the doc text after the edit window. */
	readonly trajectorySuffix: string;
	/** The replacement text the user would type to reach `postEditContent`. */
	readonly trajectoryNewText: string;
}

export interface ScheduledSpeculativeRequest {
	readonly suggestion: NextEditResult;
	readonly headerRequestId: string;
}

/**
 * Owns the lifecycle of NES speculative requests:
 *
 * - the in-flight `pending` speculative (the bet on a specific post-accept document state)
 * - the `claimed` speculatives, already picked up by a `getNextEdit` caller but kept
 *   discoverable so concurrent callers join them instead of duplicating the request
 * - the `scheduled` speculative deferred until its originating stream completes
 *
 * Centralizes cancellation with typed reasons so every triggered cancellation
 * (reject, supersede, doc-close, trajectory divergence, dispose, ...) goes through
 * one path and is logged on the request's log context.
 */
export class SpeculativeRequestManager extends Disposable {

	private _pending: SpeculativePendingRequest | null = null;
	private _scheduled: ScheduledSpeculativeRequest | null = null;

	/**
	 * Speculatives that a `getNextEdit` caller has claimed and is awaiting.
	 *
	 * They stay discoverable here until they settle so that *concurrent* callers for the
	 * same post-edit state join the same request instead of issuing a duplicate one. Keyed
	 * by request identity: several may be in flight at once (e.g. one per document), and
	 * evicting one on the arrival of another would reintroduce the duplicate-request bug.
	 */
	private readonly _claimed = new Map<StatelessNextEditRequest<CachedOrRebasedEdit>, SpeculativePendingRequest>();

	constructor(private readonly _logger: ILogger) {
		super();
	}

	get pending(): SpeculativePendingRequest | null {
		return this._pending;
	}

	/** Replaces the current pending speculative; cancels the prior one as `Replaced`. */
	setPending(req: SpeculativePendingRequest): void {
		if (this._pending && this._pending.request !== req.request) {
			this._cancelPending(SpeculativeCancelReason.Replaced);
		}
		this._pending = req;
	}

	/**
	 * Detaches the pending speculative without cancelling — the caller is consuming it —
	 * and keeps it discoverable via {@link findClaimed} until it settles.
	 */
	claimPending(): void {
		const p = this._pending;
		if (!p) {
			return;
		}
		this._pending = null;
		this._claimed.set(p.request, p);
		// Release once the request settles, whatever the outcome.
		//
		// Deliberately `then(fn, fn)` and not `finally(fn)`: `setResultError` rejects
		// `result`, and `finally` returns a *derived* promise that re-raises that rejection.
		// Nothing holds that derived promise, so it would surface as an unhandled rejection
		// even though the joining caller already awaits (and handles) `result` itself.
		// `then(fn, fn)` consumes the rejection instead.
		p.request.result.then(() => this._releaseClaimed(p), () => this._releaseClaimed(p));
	}

	/** Returns the first claimed speculative matching `predicate`, if any. */
	findClaimed(predicate: (req: SpeculativePendingRequest) => boolean): SpeculativePendingRequest | undefined {
		for (const claimed of this._claimed.values()) {
			if (predicate(claimed)) {
				return claimed;
			}
		}
		return undefined;
	}

	private _releaseClaimed(req: SpeculativePendingRequest): void {
		this._claimed.delete(req.request);
	}

	schedule(s: ScheduledSpeculativeRequest): void {
		this._scheduled = s;
	}

	clearScheduled(): void {
		this._scheduled = null;
	}

	/**
	 * Removes and returns the scheduled entry iff its `headerRequestId` matches.
	 * Used by the streaming path so that each stream only ever consumes its own
	 * schedule, never another stream's.
	 */
	consumeScheduled(headerRequestId: string): ScheduledSpeculativeRequest | null {
		if (this._scheduled?.headerRequestId !== headerRequestId) {
			return null;
		}
		const s = this._scheduled;
		this._scheduled = null;
		return s;
	}

	cancelAll(reason: SpeculativeCancelReason): void {
		this._scheduled = null;
		this._cancelPending(reason);
	}

	/** Cancels the pending speculative iff `(docId, postEditContent)` doesn't match. */
	cancelIfMismatch(docId: DocumentId, postEditContent: string, reason: SpeculativeCancelReason): void {
		if (this._pending && (this._pending.docId !== docId || this._pending.postEditContent !== postEditContent)) {
			this._cancelPending(reason);
		}
	}

	/** Cancels the pending and clears any scheduled targeting this document. */
	onDocumentClosed(docId: DocumentId): void {
		if (this._scheduled?.suggestion.result?.targetDocumentId === docId) {
			this._scheduled = null;
		}
		if (this._pending?.docId === docId) {
			this._cancelPending(SpeculativeCancelReason.DocumentClosed);
		}
		this.invalidateClaimed(SpeculativeCancelReason.DocumentClosed, req => req.docId === docId);
	}

	/**
	 * Trajectory check. The pending speculative is alive iff the current document
	 * value is a *type-through prefix* toward the speculative's `postEditContent`:
	 *
	 *     cur === trajectoryPrefix + middle + trajectorySuffix
	 *     where middle is some prefix of trajectoryNewText
	 *
	 * If not, the user's edits cannot reach `postEditContent` via continued typing
	 * and the speculative will never be consumed — cancel now.
	 */
	onActiveDocumentChanged(docId: DocumentId, currentDocValue: string): void {
		const p = this._pending;
		if (!p || p.docId !== docId) {
			return;
		}
		// Cheap structural failure: doc shorter than the unedited frame.
		if (currentDocValue.length < p.trajectoryPrefix.length + p.trajectorySuffix.length) {
			this._cancelPending(SpeculativeCancelReason.DivergedFromTrajectoryForm);
			return;
		}
		if (!currentDocValue.startsWith(p.trajectoryPrefix)) {
			this._cancelPending(SpeculativeCancelReason.DivergedFromTrajectoryPrefix);
			return;
		}
		if (!currentDocValue.endsWith(p.trajectorySuffix)) {
			this._cancelPending(SpeculativeCancelReason.DivergedFromTrajectorySuffix);
			return;
		}
		const middle = currentDocValue.slice(p.trajectoryPrefix.length, currentDocValue.length - p.trajectorySuffix.length);
		if (!p.trajectoryNewText.startsWith(middle)) {
			this._cancelPending(SpeculativeCancelReason.DivergedFromTrajectoryMiddle);
		}
	}

	private _cancelPending(reason: SpeculativeCancelReason): void {
		const p = this._pending;
		if (!p) {
			return;
		}
		this._pending = null;
		this._cancelRequest(p, reason);
	}

	/**
	 * Hard invalidation for claimed speculatives.
	 *
	 * Claimed speculatives deliberately survive the "nobody will want this anymore" reasons
	 * ({@link SpeculativeCancelReason.Replaced}, `Superseded`, `Rejected`, `IgnoredDismissed`,
	 * trajectory divergence): they have a live consumer awaiting them, and their lifetime is
	 * already governed by `liveDependentants` plus that consumer's cancellation token.
	 *
	 * They must not survive reasons that invalidate the *result itself* — a cleared cache, a
	 * closed document, or disposal — since a later caller could otherwise join a request built
	 * on now-stale state.
	 */
	invalidateClaimed(reason: SpeculativeCancelReason, filter?: (req: SpeculativePendingRequest) => boolean): void {
		for (const claimed of [...this._claimed.values()]) {
			if (filter && !filter(claimed)) {
				continue;
			}
			this._claimed.delete(claimed.request);
			this._cancelRequest(claimed, reason);
		}
	}

	private _cancelRequest(p: SpeculativePendingRequest, reason: SpeculativeCancelReason): void {
		const headerRequestId = p.request.headerRequestId;
		this._logger.trace(`cancelling speculative request: ${reason} (headerRequestId=${headerRequestId})`);
		p.request.logContext.addLog(`speculative request cancelled: ${reason}`);
		const cts = p.request.cancellationTokenSource;
		cts.cancel();
		// Dispose to release the cancel-event listeners that the in-flight
		// provider call hooked onto the token. Safe even though the runner may
		// observe cancellation asynchronously — `cancel()` already fired the event.
		cts.dispose();
	}

	override dispose(): void {
		this.cancelAll(SpeculativeCancelReason.Disposed);
		this.invalidateClaimed(SpeculativeCancelReason.Disposed);
		super.dispose();
	}
}
