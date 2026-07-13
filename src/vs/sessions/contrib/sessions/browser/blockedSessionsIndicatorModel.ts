/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../blockedSessions/browser/blockedSessions.js';
import { getFirstApprovalAcrossChats, IApprovedSession } from './views/sessionsList.js';

/**
 * The specific reason a homogeneous set of blocked sessions needs attention,
 * used to render a more helpful requires-input message. `undefined` (a mix of
 * reasons, or an indeterminate one) falls back to the generic message.
 */
export const enum RequiresInputKind {
	/** All sessions are waiting to run a terminal command. */
	TerminalApproval,
	/** All sessions are asking the user a question. */
	Question,
	/** All sessions have failing CI checks. */
	FailingCI,
	/** All sessions have unresolved pull request comments. */
	UnresolvedComments,
}

/**
 * Model behind the sessions title bar's "N sessions require input" indicator.
 *
 * It refines the raw {@link BlockedSessions} set into what the title bar should
 * actually surface: it drops sessions the user can already see, applies optimistic
 * dismissals for approvals the user just allowed, classifies the homogeneous
 * requires-input reason, and decides when the attention blink should play.
 *
 * Blink detection keys off *changes to* the blocked-session ids, so visibility can
 * only ever suppress a blink, never trigger one — navigating between sessions never
 * blinks.
 *
 * The DOM rendering of the indicator lives in the title bar widget; this class is
 * DOM-free so it can be unit tested in isolation.
 */
export class BlockedSessionsIndicatorModel extends Disposable {

	/** Computes the raw set of blocked sessions (needs input / failing CI / comments). */
	private readonly _blockedSessionsModel: BlockedSessions;

	/** Tracks pending tool approvals per chat; distinguishes terminal vs question. */
	private readonly _approvalModel: AgentSessionApprovalModel;

	/** The approval model, shared with the dropdown list so both agree on each session's pending action. */
	get approvalModel(): AgentSessionApprovalModel {
		return this._approvalModel;
	}

	/**
	 * Sessions whose current pending approval the user just allowed, keyed by
	 * `sessionId` → the approved approval's identity. Such a session is optimistically
	 * hidden from the blocked set until its approval resolves into a NEW distinct
	 * block (or it stops being blocked), so an approved row disappears immediately
	 * instead of lingering until the provider updates the session status.
	 */
	private readonly _dismissedApprovals = observableValue<ReadonlyMap<string, string>>('dismissedApprovals', new Map());

	/**
	 * Blocked sessions that are NOT currently visible on screen and not optimistically
	 * dismissed. A session the user can already see doesn't need the titlebar indicator
	 * or a dropdown row, so it is excluded from both the "N sessions require input" count
	 * and the list.
	 */
	readonly blockedSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * The homogeneous reason the blocked sessions need attention (all terminal
	 * approvals, all failing CI, etc.), or `undefined` when they are a mix — which
	 * drives whether a specific or the generic requires-input message is shown.
	 */
	readonly requiresInputKind: IObservable<RequiresInputKind | undefined>;

	/**
	 * Ids of the sessions the underlying model reports as blocked, kept in sync
	 * with the model (independent of which sessions happen to be visible). Used to
	 * detect when a *genuinely new* session becomes blocked so the attention blink
	 * only fires for real new blocks — and never merely because the user navigated
	 * to a different session, which changes the visible set but not the model.
	 */
	private _lastBlockedSessionIds: ReadonlySet<string> = new Set();

	/**
	 * Ids of not-yet-visible sessions that genuinely became blocked and whose
	 * attention blink hasn't played yet. Keyed by session id so a queued blink can be
	 * individually dropped once its session becomes visible or stops being blocked.
	 */
	private readonly _pendingBlinkSessionIds = new Set<string>();

	private readonly _onDidRequestBlink = this._register(new Emitter<void>());
	/**
	 * Fires when a genuinely new, not-yet-visible session becomes blocked and the
	 * indicator should play its attention blink. Consumers should re-render and
	 * call {@link consumePendingBlink}.
	 */
	readonly onDidRequestBlink: Event<void> = this._onDidRequestBlink.event;

	constructor(
		approvalModel: AgentSessionApprovalModel | undefined,
		blockedSessions: BlockedSessions | undefined,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
	) {
		super();

		// The model owns the approval model and blocked-sessions model; the optional
		// parameters are test seams so fixtures/tests can supply preset instances (only
		// register — and thus dispose — the ones we created ourselves).
		this._approvalModel = approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
		this._blockedSessionsModel = blockedSessions ?? this._register(instantiationService.createInstance(BlockedSessions));

		// The blocked-sessions feature is only enabled outside of stable builds.
		const enabled = productService.quality !== 'stable';

		// A session that is currently visible on screen is not treated as blocked:
		// exclude visible sessions from the requires-input indicator and the dropdown.
		this.blockedSessions = derived(this, reader => {
			if (!enabled) {
				return [];
			}
			const visibleSessionIds = new Set<string>();
			for (const session of this._sessionsService.visibleSessions.read(reader)) {
				if (session) {
					visibleSessionIds.add(session.sessionId);
				}
			}
			const dismissed = this._dismissedApprovals.read(reader);
			return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader)
				.filter(blocked => !visibleSessionIds.has(blocked.session.sessionId) && !this._isApprovalDismissed(blocked, dismissed, reader));
		});

		// The homogeneous reason across all blocked sessions (or `undefined` for a
		// mix), refining `NeedsInput` into terminal-approval vs question via the
		// approval model. Drives the specific requires-input message.
		this.requiresInputKind = derived(this, reader => {
			const blocked = this.blockedSessions.read(reader);
			if (blocked.length === 0) {
				return undefined;
			}
			let common: RequiresInputKind | undefined;
			let hasCommon = false;
			for (const entry of blocked) {
				const kind = this._kindOf(entry, reader);
				if (kind === undefined) {
					return undefined;
				}
				if (!hasCommon) {
					common = kind;
					hasCommon = true;
				} else if (common !== kind) {
					return undefined;
				}
			}
			return common;
		});

		// Drop optimistic dismissals once the session is no longer blocked or its
		// pending approval has been superseded by a new, distinct one — so a stale
		// dismissal can't keep hiding a genuinely new block.
		this._register(autorun(reader => {
			const dismissed = this._dismissedApprovals.read(reader);
			if (dismissed.size === 0) {
				return;
			}
			const blockedById = new Map(this._blockedSessionsModel.blockedSessionsWithReasons.read(reader).map(blocked => [blocked.session.sessionId, blocked] as const));
			let next: Map<string, string> | undefined;
			for (const [sessionId, approvalId] of dismissed) {
				const blocked = blockedById.get(sessionId);
				let stale: boolean;
				if (!blocked || blocked.reason !== BlockedSessionReason.NeedsInput) {
					stale = true;
				} else {
					const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
					stale = approval !== undefined && agentSessionApprovalId(approval) !== approvalId;
				}
				if (stale) {
					next ??= new Map(dismissed);
					next.delete(sessionId);
				}
			}
			if (next) {
				this._dismissedApprovals.set(next, undefined);
			}
		}));

		// Drive the attention blink. Gated on a blocked-set diff, so a visibility-only
		// change can only ever drop a pending blink, never start one.
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const modelBlocked = this._blockedSessionsModel.blockedSessions.read(reader);
			const currentIds = new Set(modelBlocked.map(session => session.sessionId));
			const previousIds = this._lastBlockedSessionIds;
			this._lastBlockedSessionIds = currentIds;

			const visibleSessionIds = new Set<string>();
			for (const session of this._sessionsService.visibleSessions.read(reader)) {
				if (session) {
					visibleSessionIds.add(session.sessionId);
				}
			}

			// Drop queued blinks for sessions that unblocked or that the user can now see.
			for (const id of this._pendingBlinkSessionIds) {
				if (!currentIds.has(id) || visibleSessionIds.has(id)) {
					this._pendingBlinkSessionIds.delete(id);
				}
			}

			// Only a genuinely new block the user cannot already see queues a blink.
			let queued = false;
			for (const session of modelBlocked) {
				if (!previousIds.has(session.sessionId) && !visibleSessionIds.has(session.sessionId)) {
					this._pendingBlinkSessionIds.add(session.sessionId);
					queued = true;
				}
			}
			if (queued) {
				this._onDidRequestBlink.fire();
			}
		}));
	}

	/**
	 * Whether a fresh attention blink is pending. Returns `true` only when a session
	 * queued as newly blocked is still in the surfaced (visible-filtered) blocked set,
	 * so a blink queued while the pill was suppressed can't fire for a session that has
	 * since become visible or unblocked. The pending queue is cleared as it is read so
	 * a subsequent render won't replay the animation.
	 */
	consumePendingBlink(): boolean {
		if (this._pendingBlinkSessionIds.size === 0) {
			return false;
		}
		const surfacedIds = new Set(this.blockedSessions.get().map(entry => entry.session.sessionId));
		let shouldBlink = false;
		for (const id of this._pendingBlinkSessionIds) {
			if (surfacedIds.has(id)) {
				shouldBlink = true;
				break;
			}
		}
		this._pendingBlinkSessionIds.clear();
		return shouldBlink;
	}

	/**
	 * Remember that the user allowed this exact approval so the session drops out of
	 * the blocked set immediately (see {@link _isApprovalDismissed}).
	 */
	dismissApproval(approved: IApprovedSession): void {
		const next = new Map(this._dismissedApprovals.get());
		next.set(approved.session.sessionId, approved.approvalId);
		this._dismissedApprovals.set(next, undefined);
	}

	/**
	 * Build the requires-input pill label. A homogeneous set of blocked sessions
	 * gets a specific, more actionable message; a mix (or an unclassified session)
	 * falls back to the generic "N sessions require input".
	 */
	getRequiresInputLabel(count: number, kind: RequiresInputKind | undefined): string {
		switch (kind) {
			case RequiresInputKind.TerminalApproval:
				return count === 1
					? localize('oneSessionTerminalApproval', "1 session requires terminal approval")
					: localize('nSessionsTerminalApproval', "{0} sessions require terminal approval", count);
			case RequiresInputKind.Question:
				return count === 1
					? localize('oneSessionQuestion', "1 session has a question")
					: localize('nSessionsQuestion', "{0} sessions have questions", count);
			case RequiresInputKind.FailingCI:
				return count === 1
					? localize('oneSessionFailingCI', "1 session is failing CI")
					: localize('nSessionsFailingCI', "{0} sessions are failing CI", count);
			case RequiresInputKind.UnresolvedComments:
				return count === 1
					? localize('oneSessionUnresolvedComments', "1 session has unresolved comments")
					: localize('nSessionsUnresolvedComments', "{0} sessions have unresolved comments", count);
			default:
				return count === 1
					? localize('oneSessionRequiresInput', "1 session requires input")
					: localize('nSessionsRequireInput', "{0} sessions require input", count);
		}
	}

	/**
	 * Whether a blocked session should stay hidden because the user just approved
	 * its pending action: hidden while that approval resolves (no current approval,
	 * status lagging) or is unchanged; a new, distinct approval re-surfaces it.
	 */
	private _isApprovalDismissed(blocked: IBlockedSession, dismissed: ReadonlyMap<string, string>, reader: IReader): boolean {
		const dismissedId = dismissed.get(blocked.session.sessionId);
		if (dismissedId === undefined || blocked.reason !== BlockedSessionReason.NeedsInput) {
			return false;
		}
		const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
		return approval === undefined || agentSessionApprovalId(approval) === dismissedId;
	}

	/**
	 * Classify a single blocked session into a specific requires-input kind, or
	 * `undefined` when it can't be classified (which forces the generic message).
	 */
	private _kindOf(blocked: IBlockedSession, reader: IReader): RequiresInputKind | undefined {
		switch (blocked.reason) {
			case BlockedSessionReason.FailingCI:
				return RequiresInputKind.FailingCI;
			case BlockedSessionReason.UnresolvedComments:
				return RequiresInputKind.UnresolvedComments;
			case BlockedSessionReason.NeedsInput: {
				const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
				switch (approval?.kind) {
					case AgentSessionApprovalKind.Terminal:
						return RequiresInputKind.TerminalApproval;
					case AgentSessionApprovalKind.Question:
						return RequiresInputKind.Question;
					default:
						return undefined;
				}
			}
			default:
				return undefined;
		}
	}
}
