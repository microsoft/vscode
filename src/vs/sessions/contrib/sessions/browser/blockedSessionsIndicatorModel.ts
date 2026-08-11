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
import { ISession } from '../../../services/sessions/common/session.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';
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
}

/**
 * Model behind the sessions title bar's "N sessions require input" indicator.
 *
 * It refines the raw {@link BlockedSessions} set into what the title bar should
 * actually surface: visible and explicitly ignored occurrences are acknowledged,
 * approvals are dismissed optimistically, and later occurrences surface again.
 *
 * Blink detection keys off blocked occurrences, so navigation can acknowledge a
 * block but never creates one.
 *
 * The DOM rendering of the indicator lives in the title bar widget; this class is
 * DOM-free so it can be unit tested in isolation.
 */
export class BlockedSessionsIndicatorModel extends Disposable {

	/** Computes the raw set of blocked sessions (needs input / failing CI). */
	private readonly _blockedSessionsModel: BlockedSessions;

	/** Tracks pending tool approvals per chat; distinguishes terminal vs question. */
	private readonly _approvalModel: AgentSessionApprovalModel;

	/** The approval model, shared with the dropdown list so both agree on each session's pending action. */
	get approvalModel(): AgentSessionApprovalModel {
		return this._approvalModel;
	}

	/** Drives the per-session "Fix CI" row; shared with the dropdown list. */
	private readonly _ciFixModel: BlockedSessionsCIFixModel;

	/** The CI-fix model, shared with the dropdown list so the fix action and the hide-while-fixing agree. */
	get ciFixModel(): BlockedSessionsCIFixModel {
		return this._ciFixModel;
	}

	/** Current blocked occurrences the user has already acknowledged, keyed by session id. */
	private readonly _ignoredBlockOccurrences = observableValue<ReadonlyMap<string, string>>('ignoredBlockOccurrences', new Map());

	/**
	 * Blocked sessions that are not visible, ignored, being fixed, or already approved.
	 * Visible blocked occurrences stay acknowledged after the user navigates away.
	 */
	readonly blockedSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * The homogeneous reason the blocked sessions need attention (all terminal
	 * approvals, all failing CI, etc.), or `undefined` when they are a mix — which
	 * drives whether a specific or the generic requires-input message is shown.
	 */
	readonly requiresInputKind: IObservable<RequiresInputKind | undefined>;

	/**
	 * Latest blocked occurrence per session, independent of visibility. Used so the
	 * attention blink only fires for a genuinely new input request or CI failure.
	 */
	private _lastBlockedOccurrences: ReadonlyMap<string, string> = new Map();

	/**
	 * Not-yet-visible blocked occurrences whose attention blink has not played yet.
	 */
	private readonly _pendingBlinkOccurrences = new Map<string, string>();

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
		ciFixModel: BlockedSessionsCIFixModel | undefined,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
	) {
		super();

		// The model owns the approval model, blocked-sessions model and CI-fix model;
		// the optional parameters are test seams so fixtures/tests can supply preset
		// instances (only register — and thus dispose — the ones we created ourselves).
		this._approvalModel = approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
		this._blockedSessionsModel = blockedSessions ?? this._register(instantiationService.createInstance(BlockedSessions));
		this._ciFixModel = ciFixModel ?? this._register(instantiationService.createInstance(BlockedSessionsCIFixModel));

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
			const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
			// Sessions whose CI fix is being submitted in the background are hidden
			// immediately (before their status flips to in-progress) so the row
			// disappears the moment the user clicks "Fix CI".
			const ciFixHidden = this._ciFixModel.hiddenSessions.read(reader);
			return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader)
				.filter(blocked => !visibleSessionIds.has(blocked.session.sessionId)
					&& !ciFixHidden.has(blocked.session.sessionId)
					&& !this._isBlockIgnored(blocked, ignoredOccurrences, reader));
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

		// A visible blocked session has been acknowledged. Keep that occurrence
		// ignored after navigation, and clear stale ignores when a new block appears.
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const blockedSessions = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
			const blockedById = new Map(blockedSessions.map(entry => [entry.session.sessionId, entry] as const));
			const visibleSessionIds = new Set(this._sessionsService.visibleSessions.read(reader).filter(session => session !== undefined).map(session => session.sessionId));
			const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
			const next = new Map(ignoredOccurrences);
			let changed = false;

			for (const [sessionId, ignoredOccurrence] of ignoredOccurrences) {
				const blockedSession = blockedById.get(sessionId);
				if (!blockedSession || this._getBlockOccurrenceId(blockedSession, reader, ignoredOccurrence) !== ignoredOccurrence) {
					next.delete(sessionId);
					changed = true;
				}
			}

			for (const blockedSession of blockedById.values()) {
				if (!visibleSessionIds.has(blockedSession.session.sessionId)) {
					continue;
				}
				const occurrenceId = this._getBlockOccurrenceId(blockedSession, reader, next.get(blockedSession.session.sessionId));
				if (next.get(blockedSession.session.sessionId) !== occurrenceId) {
					next.set(blockedSession.session.sessionId, occurrenceId);
					changed = true;
				}
			}

			if (changed) {
				this._ignoredBlockOccurrences.set(next, undefined);
			}
		}));

		// Drive the attention blink. Gated on a blocked-set diff, so a visibility-only
		// change can only ever drop a pending blink, never start one.
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
			const modelBlocked = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
			const currentOccurrences = new Map(modelBlocked.map(blocked => [
				blocked.session.sessionId,
				this._getBlockOccurrenceId(blocked, reader, ignoredOccurrences.get(blocked.session.sessionId)),
			] as const));
			const previousOccurrences = this._lastBlockedOccurrences;
			this._lastBlockedOccurrences = currentOccurrences;

			const visibleSessionIds = new Set<string>();
			for (const session of this._sessionsService.visibleSessions.read(reader)) {
				if (session) {
					visibleSessionIds.add(session.sessionId);
				}
			}

			// Drop queued blinks for sessions that unblocked or that the user can now see.
			for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
				if (currentOccurrences.get(sessionId) !== occurrenceId || visibleSessionIds.has(sessionId)) {
					this._pendingBlinkOccurrences.delete(sessionId);
				}
			}

			// Only a genuinely new block the user cannot already see queues a blink.
			let queued = false;
			for (const blocked of modelBlocked) {
				const sessionId = blocked.session.sessionId;
				const occurrenceId = currentOccurrences.get(sessionId)!;
				if (previousOccurrences.get(sessionId) !== occurrenceId && !visibleSessionIds.has(sessionId)) {
					this._pendingBlinkOccurrences.set(sessionId, occurrenceId);
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
		if (this._pendingBlinkOccurrences.size === 0) {
			return false;
		}
		const ignoredOccurrences = this._ignoredBlockOccurrences.get();
		const surfacedOccurrences = new Map(this.blockedSessions.get().map(blocked => [
			blocked.session.sessionId,
			this._getBlockOccurrenceId(blocked, undefined, ignoredOccurrences.get(blocked.session.sessionId)),
		] as const));
		let shouldBlink = false;
		for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
			if (surfacedOccurrences.get(sessionId) === occurrenceId) {
				shouldBlink = true;
				break;
			}
		}
		this._pendingBlinkOccurrences.clear();
		return shouldBlink;
	}

	/** Ignore this session's current blocked occurrence. */
	ignoreSession(session: ISession): void {
		const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find(entry => entry.session.sessionId === session.sessionId);
		if (!blocked) {
			return;
		}
		this._ignoreOccurrence(blocked, this._getBlockOccurrenceId(blocked, undefined, this._ignoredBlockOccurrences.get().get(session.sessionId)));
	}

	/** Ignore every blocked occurrence currently surfaced by the indicator. */
	ignoreAllSessions(): void {
		const blockedSessions = this.blockedSessions.get();
		if (blockedSessions.length === 0) {
			return;
		}
		const next = new Map(this._ignoredBlockOccurrences.get());
		for (const blocked of blockedSessions) {
			next.set(blocked.session.sessionId, this._getBlockOccurrenceId(blocked, undefined, next.get(blocked.session.sessionId)));
		}
		this._ignoredBlockOccurrences.set(next, undefined);
	}

	/**
	 * Remember that the user allowed this exact approval so the session drops out of
	 * the blocked set immediately.
	 */
	dismissApproval(approved: IApprovedSession): void {
		const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find(entry => entry.session.sessionId === approved.session.sessionId);
		if (!blocked || blocked.reason !== BlockedSessionReason.NeedsInput) {
			return;
		}
		this._ignoreOccurrence(blocked, this._approvalOccurrenceId(blocked, approved.approvalId));
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
			default:
				return count === 1
					? localize('oneSessionRequiresInput', "1 session requires input")
					: localize('nSessionsRequireInput', "{0} sessions require input", count);
		}
	}

	private _ignoreOccurrence(blocked: IBlockedSession, occurrenceId: string): void {
		const next = new Map(this._ignoredBlockOccurrences.get());
		next.set(blocked.session.sessionId, occurrenceId);
		this._ignoredBlockOccurrences.set(next, undefined);
	}

	private _isBlockIgnored(blocked: IBlockedSession, ignoredOccurrences: ReadonlyMap<string, string>, reader: IReader): boolean {
		const ignoredOccurrence = ignoredOccurrences.get(blocked.session.sessionId);
		return ignoredOccurrence !== undefined && this._getBlockOccurrenceId(blocked, reader, ignoredOccurrence) === ignoredOccurrence;
	}

	private _getBlockOccurrenceId(blocked: IBlockedSession, reader: IReader | undefined, ignoredOccurrence?: string): string {
		if (blocked.reason !== BlockedSessionReason.NeedsInput) {
			return blocked.occurrenceId;
		}
		const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
		if (approval) {
			return this._approvalOccurrenceId(blocked, agentSessionApprovalId(approval));
		}
		const approvalPrefix = this._approvalOccurrenceId(blocked, '');
		return ignoredOccurrence?.startsWith(approvalPrefix) ? ignoredOccurrence : blocked.occurrenceId;
	}

	private _approvalOccurrenceId(blocked: IBlockedSession, approvalId: string): string {
		return `${blocked.occurrenceId}:approval:${approvalId}`;
	}

	/**
	 * Classify a single blocked session into a specific requires-input kind, or
	 * `undefined` when it can't be classified (which forces the generic message).
	 */
	private _kindOf(blocked: IBlockedSession, reader: IReader): RequiresInputKind | undefined {
		switch (blocked.reason) {
			case BlockedSessionReason.FailingCI:
				return RequiresInputKind.FailingCI;
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
