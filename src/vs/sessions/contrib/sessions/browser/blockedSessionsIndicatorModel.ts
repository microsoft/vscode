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
import { IAgentHostFilterService } from '../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { BlockedSessionReason, BlockedSessions, describeBlockedSessions, IBlockedSession } from '../../../../workbench/contrib/sessions/browser/blockedSessions.js';
import { BlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';
import { getFirstApprovalAcrossChats, IApprovedSession } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { readPaneSessions } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';

const LOG_PREFIX = '[BlockedSessionsIndicator]';
const ACKNOWLEDGED_OCCURRENCES_STORAGE_KEY = 'sessions.blockedIndicator.ignoredOccurrences';
const MAX_STORED_ACKNOWLEDGED_SESSIONS = 50;

const enum AcknowledgementKind {
	Ignored = 'ignored',
	Viewed = 'viewed',
}

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
 * A blocked occurrence the user has viewed, explicitly ignored, or approved.
 */
interface IAcknowledgedOccurrence {
	/** The acknowledged occurrence, as produced by `_getBlockOccurrenceId`. */
	readonly occurrenceId: string;
	/** Why the session was blocked when it was acknowledged. */
	readonly reason: BlockedSessionReason;
	/** Whether the occurrence should remain as a reminder or be hidden entirely. */
	readonly kind: AcknowledgementKind;
}

/**
 * Model behind the sessions title bar's "N sessions require input" indicator.
 *
 * It refines the raw {@link BlockedSessions} set into what the title bar should
 * actually surface: a new away occurrence gets the full alert, viewing it dismisses
 * that alert, navigating away leaves a compact reminder, explicitly ignored
 * occurrences stay hidden, and later occurrences surface again.
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
	private readonly _acknowledgedBlockOccurrences = observableValue<ReadonlyMap<string, IAcknowledgedOccurrence>>('acknowledgedBlockOccurrences', new Map());
	private _storedAcknowledgedOccurrences: ReadonlyMap<string, IAcknowledgedOccurrence> = new Map();
	private _writingAcknowledgedOccurrences = false;

	/**
	 * All unresolved blocked sessions away from the visible panes. This is the set
	 * shown by the blocked-sessions dropdown.
	 */
	readonly blockedSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * Away blocked sessions whose initial attention notification has not been
	 * dismissed by viewing the session. These drive the full attention state.
	 */
	readonly unacknowledgedBlockedSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * Away blocked sessions that have been viewed but remain unresolved. These
	 * drive the compact reminder marker.
	 */
	readonly reminderSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * Number of unresolved blocked sessions in the current provider scope,
	 * including sessions visible in a pane. This keeps reminder counts stable
	 * while navigating without changing the away-only reminder visibility.
	 */
	readonly attentionSessionCount: IObservable<number>;

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
		@IAgentHostFilterService agentHostFilterService: IAgentHostFilterService,
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

		this._storedAcknowledgedOccurrences = this._loadAcknowledgedOccurrences();
		this._acknowledgedBlockOccurrences.set(this._storedAcknowledgedOccurrences, undefined);
		if (enabled) {
			this._storeAcknowledgedOccurrences(this._storedAcknowledgedOccurrences);
			this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, ACKNOWLEDGED_OCCURRENCES_STORAGE_KEY, this._store)(() => {
				if (!this._writingAcknowledgedOccurrences) {
					this._storedAcknowledgedOccurrences = this._loadAcknowledgedOccurrences();
					this._acknowledgedBlockOccurrences.set(this._storedAcknowledgedOccurrences, undefined);
				}
			}));
		}
		const allSessions = observableFromEvent(this, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSessions());
		const scopedProviderIds = observableFromEvent(this, agentHostFilterService.onDidChange, () => agentHostFilterService.selectedHost?.providerIds);

		this._logService.trace(`${LOG_PREFIX} created (enabled: ${enabled})`);
		this._register(toDisposable(() => this._logService.trace(`${LOG_PREFIX} disposed`)));

		const eligibleBlockedSessions = derived(this, reader => {
			if (!enabled) {
				return [];
			}
			const providerIds = scopedProviderIds.read(reader);
			const acknowledgedOccurrences = this._acknowledgedBlockOccurrences.read(reader);
			// Sessions whose CI fix is being submitted in the background are hidden
			// immediately (before their status flips to in-progress) so the row
			// disappears the moment the user clicks "Fix CI".
			const ciFixHidden = this._ciFixModel.hiddenSessions.read(reader);
			return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader)
				.filter(blocked => (!providerIds || providerIds.includes(blocked.session.providerId))
					&& !ciFixHidden.has(blocked.session.sessionId)
					&& !this._isBlockAcknowledgedAs(blocked, acknowledgedOccurrences, AcknowledgementKind.Ignored, reader));
		});
		const visibleSessionIds = derived(this, reader => new Set(readPaneSessions(this._sessionsService.slotPanes, reader).map(session => session.sessionId)));

		this.attentionSessionCount = derived(this, reader => eligibleBlockedSessions.read(reader).length);
		this.blockedSessions = derived(this, reader => {
			const visible = visibleSessionIds.read(reader);
			return eligibleBlockedSessions.read(reader).filter(blocked => !visible.has(blocked.session.sessionId));
		});
		this.unacknowledgedBlockedSessions = derived(this, reader => {
			const acknowledged = this._acknowledgedBlockOccurrences.read(reader);
			return this.blockedSessions.read(reader).filter(blocked => !this._isBlockAcknowledgedAs(blocked, acknowledged, AcknowledgementKind.Viewed, reader));
		});
		this.reminderSessions = derived(this, reader => {
			const acknowledged = this._acknowledgedBlockOccurrences.read(reader);
			return this.blockedSessions.read(reader).filter(blocked => this._isBlockAcknowledgedAs(blocked, acknowledged, AcknowledgementKind.Viewed, reader));
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

		// Keep acknowledgements stable through transient provider/model state, clear
		// stale acknowledgements when a new blocked occurrence appears, and mark an
		// occurrence as viewed while its session is visible.
		let observedInputSessions = new Map<string, ISession>();
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const blockedSessions = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
			const blockedById = new Map(blockedSessions.map(entry => [entry.session.sessionId, entry] as const));
			const visible = visibleSessionIds.read(reader);
			const acknowledgedOccurrences = this._acknowledgedBlockOccurrences.read(reader);
			const sessionsById = new Map(acknowledgedOccurrences.size > 0 ? allSessions.read(reader).map(session => [session.sessionId, session] as const) : []);
			const next = new Map(acknowledgedOccurrences);
			const nextObservedInputSessions = new Map<string, ISession>();
			let changed = false;

			for (const [sessionId, acknowledged] of acknowledgedOccurrences) {
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

			for (const blocked of blockedById.values()) {
				const sessionId = blocked.session.sessionId;
				if (!visible.has(sessionId)) {
					continue;
				}
				const current = next.get(sessionId);
				const occurrenceId = this._getBlockOccurrenceId(blocked, reader, current?.occurrenceId);
				if (current?.occurrenceId === occurrenceId && current.kind === AcknowledgementKind.Ignored) {
					continue;
				}
				if (current?.occurrenceId !== occurrenceId || current?.kind !== AcknowledgementKind.Viewed) {
					next.delete(sessionId);
					next.set(sessionId, { occurrenceId, reason: blocked.reason, kind: AcknowledgementKind.Viewed });
					changed = true;
					this._logService.trace(`${LOG_PREFIX} dismissing initial notification for ${sessionId} (${occurrenceId}): the session is visible`);
				}
			}

			observedInputSessions = nextObservedInputSessions;
			if (changed) {
				this._setAcknowledgedOccurrences(next);
			}
		}));

		// Drive the attention blink. Gated on a blocked-set diff, so a visibility-only
		// change can only ever drop a pending blink, never start one.
		this._register(autorun(reader => {
			if (!enabled) {
				return;
			}
			const acknowledgedOccurrences = this._acknowledgedBlockOccurrences.read(reader);
			const modelBlocked = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
			const currentOccurrences = new Map(modelBlocked.map(blocked => [
				blocked.session.sessionId,
				this._getBlockOccurrenceId(blocked, reader, acknowledgedOccurrences.get(blocked.session.sessionId)?.occurrenceId),
			] as const));
			const previousOccurrences = this._lastBlockedOccurrences;
			this._lastBlockedOccurrences = currentOccurrences;

			const surfacedSessionIds = new Set(this.unacknowledgedBlockedSessions.read(reader).map(blocked => blocked.session.sessionId));

			// Scope changes may drop queued blinks, but never create new occurrences.
			for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
				if (currentOccurrences.get(sessionId) !== occurrenceId || !surfacedSessionIds.has(sessionId)) {
					this._pendingBlinkOccurrences.delete(sessionId);
				}
			}

			// Only a genuinely new block the user cannot already see queues a blink.
			let queued = false;
			for (const blocked of modelBlocked) {
				const sessionId = blocked.session.sessionId;
				const occurrenceId = currentOccurrences.get(sessionId)!;
				if (previousOccurrences.get(sessionId) !== occurrenceId && surfacedSessionIds.has(sessionId)) {
					this._pendingBlinkOccurrences.set(sessionId, occurrenceId);
					queued = true;
					this._logService.trace(`${LOG_PREFIX} queued attention blink for ${sessionId} (${occurrenceId})`);
				}
			}
			if (queued) {
				this._onDidRequestBlink.fire();
			}
		}));

		// What the title bar actually surfaces after visibility, acknowledgement,
		// explicit ignores, and in-progress fixes are applied.
		this._register(autorun(reader => {
			const fullAttention = this.unacknowledgedBlockedSessions.read(reader);
			const reminders = this.reminderSessions.read(reader);
			this._logService.trace(`${LOG_PREFIX} surfacing ${fullAttention.length} initial notification(s) and ${reminders.length} reminder(s): ${describeBlockedSessions([...fullAttention, ...reminders])}`);
		}));
	}

	/**
	 * Whether a fresh attention blink is pending. Returns `true` only when a session
	 * queued as newly blocked is still in the unacknowledged full-attention set,
	 * so a blink queued while the pill was suppressed can't fire for a session that has
	 * since become visible or unblocked. The pending queue is cleared as it is read so
	 * a subsequent render won't replay the animation.
	 */
	consumePendingBlink(): boolean {
		if (this._pendingBlinkOccurrences.size === 0) {
			return false;
		}
		const acknowledgedOccurrences = this._acknowledgedBlockOccurrences.get();
		const surfacedOccurrences = new Map(this.unacknowledgedBlockedSessions.get().map(blocked => [
			blocked.session.sessionId,
			this._getBlockOccurrenceId(blocked, undefined, acknowledgedOccurrences.get(blocked.session.sessionId)?.occurrenceId),
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
		this._ignoreOccurrence(blocked, this._getBlockOccurrenceId(blocked, undefined, this._acknowledgedBlockOccurrences.get().get(session.sessionId)?.occurrenceId));
	}

	/** Ignore every blocked occurrence currently surfaced by the indicator. */
	ignoreAllSessions(): void {
		const blockedSessions = this.blockedSessions.get();
		if (blockedSessions.length === 0) {
			return;
		}
		const next = new Map(this._acknowledgedBlockOccurrences.get());
		for (const blocked of blockedSessions) {
			const sessionId = blocked.session.sessionId;
			const occurrenceId = this._getBlockOccurrenceId(blocked, undefined, next.get(sessionId)?.occurrenceId);
			next.delete(sessionId);
			next.set(sessionId, { occurrenceId, reason: blocked.reason, kind: AcknowledgementKind.Ignored });
			this._logService.trace(`${LOG_PREFIX} ignoring ${sessionId} (${occurrenceId}): ignore all`);
		}
		this._setAcknowledgedOccurrences(next);
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

	private _loadAcknowledgedOccurrences(): ReadonlyMap<string, IAcknowledgedOccurrence> {
		const raw = this._storageService.get(ACKNOWLEDGED_OCCURRENCES_STORAGE_KEY, StorageScope.PROFILE);
		if (raw === undefined) {
			return new Map();
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				throw new Error('Expected an array of acknowledged blocked occurrences');
			}
			const occurrences = new Map<string, IAcknowledgedOccurrence>();
			const entries: unknown[] = parsed;
			for (const entry of entries) {
				if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
					throw new Error('Invalid acknowledged blocked occurrence');
				}
				const occurrence: Partial<Record<keyof IAcknowledgedOccurrence, unknown>> | null = entry[1];
				if (!occurrence || typeof occurrence !== 'object'
					|| typeof occurrence.occurrenceId !== 'string'
					|| (occurrence.reason !== BlockedSessionReason.NeedsInput && occurrence.reason !== BlockedSessionReason.FailingCI)
					|| (occurrence.kind !== undefined && occurrence.kind !== AcknowledgementKind.Ignored && occurrence.kind !== AcknowledgementKind.Viewed)) {
					throw new Error('Invalid acknowledged blocked occurrence');
				}
				occurrences.delete(entry[0]);
				occurrences.set(entry[0], {
					occurrenceId: occurrence.occurrenceId,
					reason: occurrence.reason,
					kind: occurrence.kind === AcknowledgementKind.Viewed ? AcknowledgementKind.Viewed : AcknowledgementKind.Ignored,
				});
			}
			return new Map([...occurrences].slice(-MAX_STORED_ACKNOWLEDGED_SESSIONS));
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to load acknowledged occurrences`, error);
			return new Map();
		}
	}

	private _setAcknowledgedOccurrences(next: ReadonlyMap<string, IAcknowledgedOccurrence>): void {
		const previous = this._acknowledgedBlockOccurrences.get();
		const stored = new Map(this._loadAcknowledgedOccurrences());
		for (const [sessionId, occurrence] of previous) {
			if (!next.has(sessionId) && stored.get(sessionId)?.occurrenceId === occurrence.occurrenceId) {
				stored.delete(sessionId);
			}
		}
		for (const [sessionId, occurrence] of next) {
			if (occurrence !== previous.get(sessionId)) {
				const storedOccurrence = stored.get(sessionId);
				const preserveStoredIgnore = occurrence.kind === AcknowledgementKind.Viewed
					&& storedOccurrence?.kind === AcknowledgementKind.Ignored
					&& storedOccurrence.occurrenceId === occurrence.occurrenceId;
				if (!preserveStoredIgnore) {
					stored.delete(sessionId);
					stored.set(sessionId, occurrence);
				}
			}
		}
		const reconciled = new Map(next);
		for (const sessionId of this._storedAcknowledgedOccurrences.keys()) {
			reconciled.delete(sessionId);
		}
		for (const [sessionId, occurrence] of stored) {
			reconciled.set(sessionId, occurrence);
		}
		this._storeAcknowledgedOccurrences(stored);
		this._acknowledgedBlockOccurrences.set(reconciled, undefined);
	}

	private _storeAcknowledgedOccurrences(occurrences: ReadonlyMap<string, IAcknowledgedOccurrence>): void {
		// Bound persisted history without undoing acknowledgements in the current window.
		this._storedAcknowledgedOccurrences = new Map([...occurrences].slice(-MAX_STORED_ACKNOWLEDGED_SESSIONS));
		this._writingAcknowledgedOccurrences = true;
		try {
			if (this._storedAcknowledgedOccurrences.size === 0) {
				this._storageService.remove(ACKNOWLEDGED_OCCURRENCES_STORAGE_KEY, StorageScope.PROFILE);
			} else {
				const serialized = [...this._storedAcknowledgedOccurrences].map(([sessionId, occurrence]) => [
					sessionId,
					occurrence.kind === AcknowledgementKind.Ignored
						? { occurrenceId: occurrence.occurrenceId, reason: occurrence.reason }
						: occurrence,
				]);
				this._storageService.store(ACKNOWLEDGED_OCCURRENCES_STORAGE_KEY, JSON.stringify(serialized), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		} finally {
			this._writingAcknowledgedOccurrences = false;
		}
	}

	private _ignoreOccurrence(blocked: IBlockedSession, occurrenceId: string): void {
		const next = new Map(this._acknowledgedBlockOccurrences.get());
		next.delete(blocked.session.sessionId);
		next.set(blocked.session.sessionId, { occurrenceId, reason: blocked.reason, kind: AcknowledgementKind.Ignored });
		this._setAcknowledgedOccurrences(next);
		this._logService.trace(`${LOG_PREFIX} ignoring ${blocked.session.sessionId} (${occurrenceId})`);
	}

	private _isBlockAcknowledgedAs(blocked: IBlockedSession, acknowledgedOccurrences: ReadonlyMap<string, IAcknowledgedOccurrence>, kind: AcknowledgementKind, reader: IReader): boolean {
		const acknowledged = acknowledgedOccurrences.get(blocked.session.sessionId);
		return acknowledged?.kind === kind && this._getBlockOccurrenceId(blocked, reader, acknowledged.occurrenceId) === acknowledged.occurrenceId;
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
