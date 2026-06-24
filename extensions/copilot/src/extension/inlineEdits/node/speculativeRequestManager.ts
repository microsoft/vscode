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
 * - the `scheduled` speculative deferred until its originating stream completes
 *
 * Centralizes cancellation with typed reasons so every triggered cancellation
 * (reject, supersede, doc-close, trajectory divergence, dispose, ...) goes through
 * one path and is logged on the request's log context.
 */
export class SpeculativeRequestManager extends Disposable {

	private _pending: SpeculativePendingRequest | null = null;
	private _scheduled: ScheduledSpeculativeRequest | null = null;

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

	/** Detaches the pending speculative without cancelling — caller is consuming it. */
	consumePending(): void {
		this._pending = null;
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
		super.dispose();
	}
}
