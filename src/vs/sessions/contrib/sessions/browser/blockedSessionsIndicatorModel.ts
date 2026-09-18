/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, derived, IObservable, IReader, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { BlockedSessionReason, BlockedSessions, describeBlockedSessions, IBlockedSession } from '../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';
import { getFirstApprovalAcrossChats, IApprovedSession } from './views/sessionsList.js';

const LOG_PREFIX = '[BlockedSessionsIndicator]';
const IGNORED_OCCURRENCES_STORAGE_KEY = 'sessions.blockedIndicator.ignoredOccurrences';
const MAX_STORED_IGNORED_SESSIONS = 50;

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
 * A blocked occurrence the user has acknowledged, either by viewing the session
 * or by explicitly ignoring it.
 */
interface IAcknowledgedOccurrence {
	/** The acknowledged occurrence, as produced by `_getBlockOccurrenceId`. */
	readonly occurrenceId: string;
	/** Why the session was blocked when it was acknowledged. */
	readonly reason: BlockedSessionReason;
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
 * DOM-free so it can be unit tested in isolation. It is owned by the title bar
 * *contribution* rather than the widget, because the command center rebuilds its
 * action view items (and so the widget) whenever its context keys change — e.g.
 * when the new-session view opens — and acknowledgements must survive that.
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

	/** Acknowledged occurrences by session id, in acknowledgement order; the latest 50 survive reloads. */
	private readonly _ignoredBlockOccurrences = observableValue<ReadonlyMap<string, IAcknowledgedOccurrence>>('ignoredBlockOccurrences', new Map());
	private _storedIgnoredOccurrences: ReadonlyMap<string, IAcknowledgedOccurrence> = new Map();
	private _writingIgnoredOccurrences = false;

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
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
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

		this._storedIgnoredOccurrences = this._loadIgnoredOccurrences();
		this._ignoredBlockOccurrences.set(this._storedIgnoredOccurrences, undefined);
		if (enabled) {
			this._storeIgnoredOccurrences(this._storedIgnoredOccurrences);
			this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, IGNORED_OCCURRENCES_STORAGE_KEY, this._store)(() => {
				if (!this._writingIgnoredOccurrences) {
					this._storedIgnoredOccurrences = this._loadIgnoredOccurrences();
					this._ignoredBlockOccurrences.set(this._storedIgnoredOccurrences, undefined);
				}
			}));
		}
		const allSessions = observableFromEvent(this, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSessions());

		this._logService.trace(`${LOG_PREFIX} created (enabled: ${enabled})`);
		this._register(toDisposable(() => this._logService.trace(`${LOG_PREFIX} disposed`)));

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
		let observedInputSessions = new Map<string, ISession>();
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const blockedSessions = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
			const blockedById = new Map(blockedSessions.map(entry => [entry.session.sessionId, entry] as const));
			const visibleSessionIds = new Set(this._sessionsService.visibleSessions.read(reader).filter(session => session !== undefined).map(session => session.sessionId));
			const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
			const sessionsById = new Map(ignoredOccurrences.size > 0 ? allSessions.read(reader).map(session => [session.sessionId, session] as const) : []);
			const next = new Map(ignoredOccurrences);
			const nextObservedInputSessions = new Map<string, ISession>();
			let changed = false;

			for (const [sessionId, acknowledged] of ignoredOccurrences) {
				const session = sessionsById.get(sessionId);
				if (session?.isArchived.read(reader)) {
					next.delete(sessionId);
					changed = true;
					this._logService.trace(`${LOG_PREFIX} releasing acknowledgement of ${sessionId}: archived`);
					continue;
				}
				const connectionStatus = session?.remoteConnectionStatus?.read(reader);
				const connected = !connectionStatus || connectionStatus.kind === 'connected';
				if (session && connected && (session.status.read(reader) === SessionStatus.NeedsInput || observedInputSessions.get(sessionId) === session)) {
					nextObservedInputSessions.set(sessionId, session);
				}
				const blockedSession = blockedById.get(sessionId);
				if (blockedSession) {
					const occurrenceId = this._getBlockOccurrenceId(blockedSession, reader, acknowledged.occurrenceId);
					if (occurrenceId !== acknowledged.occurrenceId) {
						// A genuinely new block on the same session (a later approval, a
						// newer failing commit): surface it again.
						next.delete(sessionId);
						changed = true;
						this._logService.trace(`${LOG_PREFIX} releasing acknowledgement of ${sessionId}: new occurrence ${occurrenceId} replaces ${acknowledged.occurrenceId}`);
					}
					continue;
				}

				// Cached facades and disconnected hosts do not establish that an input request cleared.
				if (!session || !connected || nextObservedInputSessions.get(sessionId) !== session || session.status.read(reader) === SessionStatus.NeedsInput) {
					continue;
				}

				// The session is no longer reported as blocked. A CI acknowledgement is
				// keyed by the failing commit, so it is kept: the session can drop out
				// transiently (its pull request / CI models reload, the session goes
				// in progress) and must not resurface for the very failure the user
				// already dismissed — a new commit yields a new occurrence anyway. An
				// input-needed acknowledgement has no such identity, so it is released
				// here to let the next input request surface.
				if (acknowledged.reason === BlockedSessionReason.FailingCI) {
					this._logService.trace(`${LOG_PREFIX} keeping acknowledgement of ${sessionId} (${acknowledged.occurrenceId}) while it is not reported as blocked`);
					continue;
				}
				next.delete(sessionId);
				changed = true;
				this._logService.trace(`${LOG_PREFIX} releasing acknowledgement of ${sessionId} (${acknowledged.occurrenceId}): no longer blocked`);
			}

			for (const blockedSession of blockedById.values()) {
				const sessionId = blockedSession.session.sessionId;
				if (!visibleSessionIds.has(sessionId)) {
					continue;
				}
				const occurrenceId = this._getBlockOccurrenceId(blockedSession, reader, next.get(sessionId)?.occurrenceId);
				if (next.get(sessionId)?.occurrenceId !== occurrenceId) {
					next.delete(sessionId);
					next.set(sessionId, { occurrenceId, reason: blockedSession.reason });
					changed = true;
					this._logService.trace(`${LOG_PREFIX} acknowledging ${sessionId} (${occurrenceId}): the session is visible`);
				}
			}

			observedInputSessions = nextObservedInputSessions;
			if (changed) {
				this._setIgnoredOccurrences(next);
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
				this._getBlockOccurrenceId(blocked, reader, ignoredOccurrences.get(blocked.session.sessionId)?.occurrenceId),
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
					this._logService.trace(`${LOG_PREFIX} queued attention blink for ${sessionId} (${occurrenceId})`);
				}
			}
			if (queued) {
				this._onDidRequestBlink.fire();
			}
		}));

		// What the title bar actually surfaces, after visible / acknowledged /
		// being-fixed sessions are filtered out. Traced so a resurfacing session can
		// be correlated with the raw blocked set and the acknowledgements above.
		this._register(autorun(reader => {
			const surfaced = this.blockedSessions.read(reader);
			this._logService.trace(`${LOG_PREFIX} surfacing ${surfaced.length} blocked session(s): ${describeBlockedSessions(surfaced)}`);
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
			this._getBlockOccurrenceId(blocked, undefined, ignoredOccurrences.get(blocked.session.sessionId)?.occurrenceId),
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
			this._logService.trace(`${LOG_PREFIX} ignore requested for ${session.sessionId}, but it is not reported as blocked`);
			return;
		}
		this._ignoreOccurrence(blocked, this._getBlockOccurrenceId(blocked, undefined, this._ignoredBlockOccurrences.get().get(session.sessionId)?.occurrenceId));
	}

	/** Ignore every blocked occurrence currently surfaced by the indicator. */
	ignoreAllSessions(): void {
		const blockedSessions = this.blockedSessions.get();
		if (blockedSessions.length === 0) {
			return;
		}
		const next = new Map(this._ignoredBlockOccurrences.get());
		for (const blocked of blockedSessions) {
			const sessionId = blocked.session.sessionId;
			const occurrenceId = this._getBlockOccurrenceId(blocked, undefined, next.get(sessionId)?.occurrenceId);
			next.delete(sessionId);
			next.set(sessionId, { occurrenceId, reason: blocked.reason });
			this._logService.trace(`${LOG_PREFIX} ignoring ${sessionId} (${occurrenceId}): ignore all`);
		}
		this._setIgnoredOccurrences(next);
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

	private _loadIgnoredOccurrences(): ReadonlyMap<string, IAcknowledgedOccurrence> {
		const raw = this._storageService.get(IGNORED_OCCURRENCES_STORAGE_KEY, StorageScope.PROFILE);
		if (raw === undefined) {
			return new Map();
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				throw new Error('Expected an array of ignored blocked occurrences');
			}
			const occurrences = new Map<string, IAcknowledgedOccurrence>();
			const entries: unknown[] = parsed;
			for (const entry of entries) {
				if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
					throw new Error('Invalid ignored blocked occurrence');
				}
				const occurrence: Partial<Record<keyof IAcknowledgedOccurrence, unknown>> | null = entry[1];
				if (!occurrence || typeof occurrence !== 'object'
					|| typeof occurrence.occurrenceId !== 'string'
					|| (occurrence.reason !== BlockedSessionReason.NeedsInput && occurrence.reason !== BlockedSessionReason.FailingCI)) {
					throw new Error('Invalid ignored blocked occurrence');
				}
				occurrences.delete(entry[0]);
				occurrences.set(entry[0], { occurrenceId: occurrence.occurrenceId, reason: occurrence.reason });
			}
			return new Map([...occurrences].slice(-MAX_STORED_IGNORED_SESSIONS));
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to load ignored occurrences`, error);
			return new Map();
		}
	}

	private _setIgnoredOccurrences(next: ReadonlyMap<string, IAcknowledgedOccurrence>): void {
		const previous = this._ignoredBlockOccurrences.get();
		const stored = new Map(this._loadIgnoredOccurrences());
		for (const [sessionId, occurrence] of previous) {
			if (!next.has(sessionId) && stored.get(sessionId)?.occurrenceId === occurrence.occurrenceId) {
				stored.delete(sessionId);
			}
		}
		for (const [sessionId, occurrence] of next) {
			if (occurrence !== previous.get(sessionId)) {
				stored.delete(sessionId);
				stored.set(sessionId, occurrence);
			}
		}
		const reconciled = new Map(next);
		for (const sessionId of this._storedIgnoredOccurrences.keys()) {
			reconciled.delete(sessionId);
		}
		for (const [sessionId, occurrence] of stored) {
			reconciled.set(sessionId, occurrence);
		}
		this._storeIgnoredOccurrences(stored);
		this._ignoredBlockOccurrences.set(reconciled, undefined);
	}

	private _storeIgnoredOccurrences(occurrences: ReadonlyMap<string, IAcknowledgedOccurrence>): void {
		// Bound persisted history without undoing acknowledgements in the current window.
		this._storedIgnoredOccurrences = new Map([...occurrences].slice(-MAX_STORED_IGNORED_SESSIONS));
		this._writingIgnoredOccurrences = true;
		try {
			if (this._storedIgnoredOccurrences.size === 0) {
				this._storageService.remove(IGNORED_OCCURRENCES_STORAGE_KEY, StorageScope.PROFILE);
			} else {
				this._storageService.store(IGNORED_OCCURRENCES_STORAGE_KEY, JSON.stringify([...this._storedIgnoredOccurrences]), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		} finally {
			this._writingIgnoredOccurrences = false;
		}
	}

	private _ignoreOccurrence(blocked: IBlockedSession, occurrenceId: string): void {
		const next = new Map(this._ignoredBlockOccurrences.get());
		next.delete(blocked.session.sessionId);
		next.set(blocked.session.sessionId, { occurrenceId, reason: blocked.reason });
		this._setIgnoredOccurrences(next);
		this._logService.trace(`${LOG_PREFIX} ignoring ${blocked.session.sessionId} (${occurrenceId})`);
	}

	private _isBlockIgnored(blocked: IBlockedSession, ignoredOccurrences: ReadonlyMap<string, IAcknowledgedOccurrence>, reader: IReader): boolean {
		const acknowledged = ignoredOccurrences.get(blocked.session.sessionId);
		return acknowledged !== undefined && this._getBlockOccurrenceId(blocked, reader, acknowledged.occurrenceId) === acknowledged.occurrenceId;
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
