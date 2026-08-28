/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { ActionType, ActionEnvelope, ActionOrigin, INotification, IRootConfigChangedAction, SessionAction, ChatAction, RootAction, StateAction, TerminalAction, ChangesetAction, ClientChangesetAction, AnnotationsAction, ClientAnnotationsAction, isRootAction, isSessionAction, isChatAction, isChangesetAction, isAnnotationsAction, isAutomationAction, isAutomationRunAction, isPassiveSessionMetadataAction, type AuthRequiredParams, type ClientAutomationAction, type ClientAutomationRunAction, type ProgressParams, type SessionSummaryChangedParams } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer, automationReducer, automationRunReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, createChatState, createDefaultChatSummary, chatSummaryFromState, buildDefaultChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseSubagentSessionUri, isAhpChatChannel, isAhpAutomationCatalogChannel, isAhpAutomationRunChannel, isDefaultChatUri, mergeSessionWithDefaultChat, isAhpRootChannel, readSessionExternal, SessionLifecycle, withHostBuildInfo, withSessionStatusFlag, type AutomationCatalogState, type AutomationRunState, type Changeset, type ChangesetState, type AnnotationsState, type ChatState, type ChatSummary, type Customization, type ISessionWithDefaultChat, type Message, type RootState, type SessionConfigState, type SessionMeta, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI, ChangesetStatus, IHostBuildInfo, SessionStatus } from '../common/state/sessionState.js';
import { AgentHostTelemetryLevelConfigKey, IPermissionsValue, platformRootSchema, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { buildAnnotationsUri, isAnnotationsUri, parseAnnotationsUri } from '../common/annotationsUri.js';
import { AgentHostChangesetStateCache, type IAgentHostChangesetStateRetentionOptions } from './agentHostChangesetStateCache.js';
import { ChangesSummary, ChatInteractivity, type ChatOrigin } from '../common/state/protocol/state.js';
import { arrayEquals, structuralEquals } from '../../../base/common/equals.js';
import { preserveProviderBackedRootConfigValues } from '../common/agentCustomizationSettings.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { readEphemeralSessionMeta } from '../common/meta/agentEphemeralSessionMeta.js';
import { type IChatSurfaceMeta, readChatSurfaceMeta } from '../common/meta/agentChatSurfaceMeta.js';

export interface IAgentHostStateManagerOptions {
	readonly changesetStateRetention?: IAgentHostChangesetStateRetentionOptions;
	/**
	 * Build information about the program hosting the agent host. When
	 * provided, it is published on {@link RootState._meta} so clients can see
	 * which build is hosting them.
	 */
	readonly hostBuildInfo?: IHostBuildInfo;
}

/**
 * Whether a session is still an unused draft: minted by this process and never
 * used. Only such a session is safe to destroy automatically.
 *
 * Deliberately not derived from the current turn count. An empty session is
 * also what a failed history load produces, and what a truncate-to-zero leaves
 * behind — neither means the session is disposable. The flag latches to `false`
 * on first use and never returns to `true`.
 */
const enum SessionUse {
	UnusedDraft,
	Used,
}

/**
 * Authoritative per-session record held by the state manager. Bundles the flat
 * {@link SessionState} with the {@link SessionSummary} catalog-only fields that
 * do not live on the state. The session URI (catalog `resource`) is the map
 * key, and the catalog `_meta` is the same object as {@link SessionState._meta},
 * so the only extra fields the record carries are the timestamps and the
 * aggregate change counts.
 */
interface ISessionEntry {
	state: SessionState;
	/** Creation timestamp (ISO 8601). Catalog-only; immutable after creation. */
	readonly createdAt: string;
	/** Last modification timestamp (ISO 8601). Catalog-only; derived from chat aggregation. */
	modifiedAt: string;
	/** Aggregate file-change counts for the session-wide changeset. Catalog-only. */
	changes?: ChangesSummary;
	/** Whether this session is still an unused draft. Latches to `Used`. */
	use: SessionUse;
}

interface IRestoredChatState {
	readonly turns: Turn[];
	readonly draft?: Message;
}

type RestoredChatResolver = (providerData: string | undefined) => Promise<IRestoredChatState>;

/**
 * Authoritative record for one chat in a session catalog. A restored peer chat
 * has a summary before it has conversation state; resolution atomically
 * installs that state only after its provider history is ready.
 */
interface IChatEntry {
	readonly session: string;
	summary: ChatSummary;
	state?: ChatState;
	providerData?: string;
	inheritedTurnId?: string;
	draft?: Message;
	resolver?: RestoredChatResolver;
	inFlight?: Promise<ChatState | undefined>;
	valid: boolean;
}

/**
 * Encapsulates the root-channel summary-notification bookkeeping for the
 * {@link AgentHostStateManager}: the last {@link SessionSummary} announced to
 * clients per session (the diff baseline) and the set of sessions whose summary
 * changed since the last debounced flush. The snapshot map and the dirty set
 * are always mutated in lockstep, so keeping them together — rather than as two
 * loose fields on the manager — keeps the diffing state cohesive.
 *
 * The current summary for a session is sourced via the injected `getSummary`
 * callback; diff-based `root/sessionSummaryChanged` notifications are emitted
 * through `emit`.
 */
class SessionSummaryNotifier extends Disposable {

	/** Last summary announced to clients (via sessionAdded or sessionSummaryChanged). */
	private readonly _lastNotified = new Map<string, SessionSummary>();

	/** Sessions whose summary changed since the last flush. */
	private readonly _dirty = new Set<string>();

	private readonly _scheduler = this._register(new RunOnceScheduler(() => this._flushAll(), 100));

	constructor(
		private readonly _getSummary: (session: string) => SessionSummary | undefined,
		private readonly _emit: (session: string, changes: Partial<SessionSummary>) => void,
	) {
		super();
	}

	/** Records `summary` as the last value announced to clients for `session`. */
	announce(session: string, summary: SessionSummary): void {
		this._lastNotified.set(session, summary);
	}

	/**
	 * Applies `changes` to the announced summary of a session with no live state,
	 * then emits the delta. Unlike {@link flush}, which re-derives from live
	 * state, the announced summary is the source of truth here, so changes are
	 * pushed in rather than diffed.
	 *
	 * Returns `false` when `session` was never announced.
	 */
	applyAnnouncedChanges(session: string, changes: Partial<SessionSummary>): boolean {
		const lastNotified = this._lastNotified.get(session);
		if (!lastNotified) {
			return false;
		}
		this._lastNotified.set(session, { ...lastNotified, ...changes });
		this._emit(session, changes);
		return true;
	}

	/** Whether `session` has already been announced to clients. */
	isAnnounced(session: string): boolean {
		return this._lastNotified.has(session);
	}

	/** The last summary announced to clients for `session`, if any. */
	getAnnounced(session: string): SessionSummary | undefined {
		return this._lastNotified.get(session);
	}

	/** Marks `session` dirty and schedules a debounced flush. */
	markDirty(session: string): void {
		this._dirty.add(session);
		this._scheduler.schedule();
	}

	/** Whether `session` has a pending (unflushed) summary change. */
	isDirty(session: string): boolean {
		return this._dirty.has(session);
	}

	/** Drops the pending dirty flag for `session` without flushing it. */
	clearDirty(session: string): void {
		this._dirty.delete(session);
	}

	/** Drops all notification bookkeeping for `session`. */
	remove(session: string): void {
		this._lastNotified.delete(session);
		this._dirty.delete(session);
	}

	private _flushAll(): void {
		for (const session of this._dirty) {
			this.flush(session);
		}
		this._dirty.clear();
	}

	/**
	 * Emits a `root/sessionSummaryChanged` notification for `session` if its
	 * current summary differs from the last announced one, then advances the
	 * snapshot. Does NOT clear the dirty flag — callers own that bookkeeping.
	 */
	flush(session: string): void {
		const current = this._getSummary(session);
		const lastNotified = this._lastNotified.get(session);
		if (!current || !lastNotified) {
			return;
		}

		const changes: Partial<SessionSummary> = {};
		if (current.title !== lastNotified.title) { changes.title = current.title; }
		if (current.status !== lastNotified.status) { changes.status = current.status; }
		if (current.activity !== lastNotified.activity) { changes.activity = current.activity; }
		if (current.modifiedAt !== lastNotified.modifiedAt) { changes.modifiedAt = current.modifiedAt; }
		if (current.project !== lastNotified.project) { changes.project = current.project; }
		if (current.changes !== lastNotified.changes) { changes.changes = current.changes; }
		if (current.workingDirectories !== lastNotified.workingDirectories) { changes.workingDirectories = current.workingDirectories; }
		if (current._meta !== lastNotified._meta) { changes._meta = current._meta; }

		this._lastNotified.set(session, current);

		if (Object.keys(changes).length > 0) {
			this._emit(session, changes);
		}
	}
}

/**
 * Server-side state manager for the sessions process protocol.
 *
 * Maintains the authoritative state tree (root + per-session), applies actions
 * through pure reducers, assigns monotonic sequence numbers, and emits
 * {@link ActionEnvelope}s for subscribed clients.
 */
export const IAgentHostStateManager = createDecorator<AgentHostStateManager>('agentHostStateManager');

export class AgentHostStateManager extends Disposable {
	declare readonly _serviceBrand: undefined;

	private _serverSeq = 0;

	private _rootState: RootState;

	/**
	 * Authoritative per-session state, keyed by session URI string. Each entry
	 * bundles the flat {@link SessionState} with the catalog-only fields that
	 * are not part of the state (`createdAt`, `modifiedAt`, `changes`). The
	 * root-channel {@link SessionSummary} catalog view is derived on demand from
	 * an entry via {@link getSessionSummary} (its `_meta` is the same object as
	 * {@link SessionState._meta}); the host streams catalog deltas via
	 * `root/sessionSummaryChanged`.
	 */
	private readonly _sessionStates = new Map<string, ISessionEntry>();

	/**
	 * Authoritative chat catalog, keyed by chat channel URI. Every catalog
	 * summary has an entry, while only resolved chats have a {@link ChatState}.
	 */
	private readonly _chatEntries = new Map<string, IChatEntry>();

	/** Expanded changeset states, separated from protocol sequencing so cache policy stays local. */
	private readonly _changesets: AgentHostChangesetStateCache;

	/**
	 * Per-channel annotation states for the `<session>/annotations` channel.
	 * Unlike changesets (server-owned), annotation actions are
	 * client-dispatchable and lazily create their state on first write.
	 */
	private readonly _annotations = new Map<string, AnnotationsState>();
	private _automationCatalog: AutomationCatalogState | undefined;
	private readonly _automationRuns = new Map<string, AutomationRunState>();

	/**
	 * Active turns per session, keyed by session URI string with the value
	 * being the set of that session's chat channel URIs that currently have an
	 * active turn. A session is "active" while at least one of its chats is
	 * streaming — this stays correct for multi-chat sessions whose chats can run
	 * concurrent turns (e.g. agent-team / sub-agent workers), where the previous
	 * single-flag-per-session model would clear too early. Active state is
	 * derived from `state.activeTurn` (the source of truth maintained by the
	 * session reducer) — never from raw action turn-ids — so that mismatched or
	 * out-of-order turn lifecycle actions can't desync it from reality. The
	 * session count (`size`) drives `RootActiveSessionsChanged` and
	 * `hasActiveSessions`, which together gate `--enable-remote-auto-shutdown`.
	 */
	private readonly _sessionsWithActiveTurn = new Map<string, Set<string>>();

	/**
	 * Root-channel summary notification bookkeeping: the diff baseline (last
	 * announced summary per session) and the dirty set, debounced into
	 * `root/sessionSummaryChanged` notifications. Assigned in the constructor
	 * since it closes over {@link _toSummary} and {@link _onDidEmitNotification}.
	 */
	private readonly _summaryNotifier: SessionSummaryNotifier;
	/** Session summaries exposed to at least one client through `root/listSessions` or `root/sessionAdded`. */
	private readonly _publishedSessionSummaries = new Set<string>();
	/** Session summaries globally published through `root/sessionAdded`. */
	private readonly _addedSessionSummaries = new Set<string>();

	private readonly _onDidEmitEnvelope = this._register(new Emitter<ActionEnvelope>());
	readonly onDidEmitEnvelope: Event<ActionEnvelope> = this._onDidEmitEnvelope.event;

	private readonly _onDidEmitNotification = this._register(new Emitter<INotification>());
	readonly onDidEmitNotification: Event<INotification> = this._onDidEmitNotification.event;
	private readonly _onDidChangeSessionActiveTurn = this._register(new Emitter<{ session: string; active: boolean }>());
	readonly onDidChangeSessionActiveTurn: Event<{ session: string; active: boolean }> = this._onDidChangeSessionActiveTurn.event;
	private readonly _onDidChangeSessionStatus = this._register(new Emitter<{ session: string; status: SessionStatus }>());
	readonly onDidChangeSessionStatus: Event<{ session: string; status: SessionStatus }> = this._onDidChangeSessionStatus.event;
	private readonly _onDidRemoveSession = this._register(new Emitter<string>());
	readonly onDidRemoveSession: Event<string> = this._onDidRemoveSession.event;

	private readonly _onDidChangeSessionTitle = this._register(new Emitter<{ session: string; title: string }>());
	readonly onDidChangeSessionTitle: Event<{ session: string; title: string }> = this._onDidChangeSessionTitle.event;
	private readonly _onDidSnapshotDefaultChatTitle = this._register(new Emitter<{ session: string; chat: string; title: string }>());
	readonly onDidSnapshotDefaultChatTitle: Event<{ session: string; chat: string; title: string }> = this._onDidSnapshotDefaultChatTitle.event;

	private readonly _onDidChangeSessionConfig = this._register(new Emitter<{ session: URI; previous: SessionConfigState | undefined; current: SessionConfigState | undefined; clientContext?: IAgentHostClientTelemetryContext }>());
	readonly onDidChangeSessionConfig: Event<{ session: URI; previous: SessionConfigState | undefined; current: SessionConfigState | undefined; clientContext?: IAgentHostClientTelemetryContext }> = this._onDidChangeSessionConfig.event;

	private readonly _onDidChangeSessionWorkingDirectories = this._register(new Emitter<{ session: string }>());
	readonly onDidChangeSessionWorkingDirectories: Event<{ session: string }> = this._onDidChangeSessionWorkingDirectories.event;
	private readonly _onDidChangeSessionSummary = this._register(new Emitter<{ session: string; changes: SessionSummaryChangedParams['changes'] }>());
	readonly onDidChangeSessionSummary: Event<{ session: string; changes: SessionSummaryChangedParams['changes'] }> = this._onDidChangeSessionSummary.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		options: IAgentHostStateManagerOptions = {},
	) {
		super();
		this._changesets = new AgentHostChangesetStateCache(options.changesetStateRetention);
		this._rootState = createRootState();
		// Seed the host-level configuration schema + default values so that
		// RootConfigChanged actions can merge into it, and clients see the
		// schema immediately upon subscribing to `agenthost:/root`. See
		// `platformRootSchema` for the set of platform-owned properties.
		this._rootState = {
			...this._rootState,
			config: {
				schema: platformRootSchema.toProtocol(),
				values: platformRootSchema.validateOrDefault({}, {
					[SessionConfigKey.Permissions]: { allow: [], deny: [] } satisfies IPermissionsValue,
					[AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE),
				}),
			},
			_meta: withHostBuildInfo(this._rootState._meta, options.hostBuildInfo),
		};
		this._summaryNotifier = this._register(new SessionSummaryNotifier(
			session => {
				const entry = this._sessionStates.get(session);
				return entry ? this._toSummary(session, entry) : undefined;
			},
			(session, changes) => this._emitSessionSummaryChanged(session, changes),
		));
	}

	private _emitSessionSummaryChanged(session: string, changes: SessionSummaryChangedParams['changes']): void {
		this._onDidChangeSessionSummary.fire({ session, changes });
		if (this._publishedSessionSummaries.has(session)) {
			this._onDidEmitNotification.fire({
				type: 'root/sessionSummaryChanged',
				channel: ROOT_STATE_URI,
				session,
				changes,
			});
		}
	}

	private _emitSessionAdded(summary: SessionSummary): void {
		if (readEphemeralSessionMeta(summary).isEphemeral) {
			return;
		}
		this._summaryNotifier.announce(summary.resource, summary);
		this._publishedSessionSummaries.add(summary.resource);
		this._addedSessionSummaries.add(summary.resource);
		this._onDidEmitNotification.fire({
			type: 'root/sessionAdded',
			channel: ROOT_STATE_URI,
			summary,
		});
	}

	private readonly _log = (msg: string) => this._logService.warn(`[AgentHostStateManager] ${msg}`);

	get hasActiveSessions(): boolean {
		return this._sessionsWithActiveTurn.size > 0;
	}

	/**
	 * Whether the given session currently has an active turn — i.e. a request is
	 * in progress on any of its chats. Stays `true` while at least one chat is
	 * streaming, so it remains correct for multi-chat sessions running
	 * concurrent turns.
	 */
	hasActiveTurn(sessionKey: string): boolean {
		return this._sessionsWithActiveTurn.has(sessionKey);
	}

	// ---- State accessors ----------------------------------------------------

	get rootState(): RootState {
		return this._rootState;
	}

	getSessionState(sessionOrChat: URI): ISessionWithDefaultChat | undefined {
		// Accept either a session URI or one of its chat channel URIs. When a
		// chat URI is given the conversation contents are taken from that chat,
		// while the session summary/config come from the owning session.
		const isChat = isAhpChatChannel(sessionOrChat);
		const session = this._resolveOwningSession(sessionOrChat);
		if (session === undefined) {
			return undefined;
		}
		const entry = this._sessionStates.get(session);
		if (!entry) {
			return undefined;
		}
		const chatUri = isChat ? sessionOrChat : buildDefaultChatUri(session);
		return mergeSessionWithDefaultChat(entry.state, this._chatEntries.get(chatUri)?.state);
	}

	/**
	 * Whether a session is still an unused draft minted by this process, or
	 * `undefined` when the session is not currently in state. Accepts either a
	 * session URI or one of its chat channel URIs.
	 *
	 * Callers about to destroy durable data must use this rather than checking
	 * whether the session currently looks empty.
	 */
	isUnusedDraft(sessionOrChat: URI): boolean | undefined {
		const session = this._resolveOwningSession(sessionOrChat);
		if (session === undefined) {
			return undefined;
		}
		const entry = this._sessionStates.get(session);
		return entry && entry.use === SessionUse.UnusedDraft;
	}

	/** Permanently marks a session as used, so it is never auto-collected. */
	private _markSessionUsed(session: URI): void {
		const entry = this._sessionStates.get(session);
		if (entry) {
			entry.use = SessionUse.Used;
		}
	}

	private _resolveOwningSession(sessionOrChat: URI): URI | undefined {
		return isAhpChatChannel(sessionOrChat) ? parseDefaultChatUri(sessionOrChat) : sessionOrChat;
	}

	/**
	 * Returns the root-channel {@link SessionSummary} catalog entry for a
	 * session, or `undefined` when the session is unknown. The summary is
	 * derived on demand from the session's {@link ISessionEntry}: its metadata
	 * fields and `_meta` come straight off the live {@link SessionState}, while
	 * the catalog-only `resource` / `createdAt` / `modifiedAt` / `changes` come
	 * from the entry.
	 */
	getSessionSummary(session: URI): SessionSummary | undefined {
		const entry = this._sessionStates.get(session);
		return entry ? this._toSummary(session, entry) : undefined;
	}

	/** Returns an unrestored session's last surfaced summary, if any. */
	getSurfacedSessionSummary(session: string): SessionSummary | undefined {
		return this._sessionStates.has(session) ? undefined : this._summaryNotifier.getAnnounced(session);
	}

	/**
	 * Projects an {@link ISessionEntry} into its root-channel
	 * {@link SessionSummary}. The summary's `_meta` is the same object as
	 * {@link SessionState._meta} — the host treats the two as identical.
	 */
	private _toSummary(session: string, entry: ISessionEntry): SessionSummary {
		const { state } = entry;
		const summary: SessionSummary = {
			resource: session,
			provider: state.provider,
			title: state.title,
			status: state.status,
			createdAt: entry.createdAt,
			modifiedAt: entry.modifiedAt,
		};
		if (state.activity !== undefined) { summary.activity = state.activity; }
		if (state.project !== undefined) { summary.project = state.project; }
		if (state.workingDirectories !== undefined) { summary.workingDirectories = state.workingDirectories; }
		if (state.annotations !== undefined) { summary.annotations = state.annotations; }
		if (entry.changes !== undefined) { summary.changes = entry.changes; }
		if (state._meta !== undefined) { summary._meta = state._meta; }
		return summary;
	}

	/**
	 * Whether the {@link SessionSummary}-relevant fields of two session states
	 * are field-equal. Used to decide whether a session action mutated anything
	 * the root-channel catalog cares about.
	 */
	private _summaryFieldsEqual(a: SessionState, b: SessionState): boolean {
		return a.title === b.title
			&& a.status === b.status
			&& a.activity === b.activity
			&& a.project === b.project
			&& a.workingDirectories === b.workingDirectories
			&& a.annotations === b.annotations
			&& a._meta === b._meta;
	}

	/**
	 * Returns the authoritative {@link ChatState} for a session's default
	 * chat, or `undefined` when the session is unknown. Use this when the
	 * caller specifically needs conversation contents (turns, activeTurn,
	 * pending/input state) rather than the session summary.
	 */
	getDefaultChatState(session: URI): ChatState | undefined {
		return this._chatEntries.get(buildDefaultChatUri(session))?.state;
	}

	/** Returns already-hydrated state without triggering resolution or I/O. */
	getChatState(chat: URI): ChatState | undefined {
		return this._chatEntries.get(chat)?.state;
	}

	/**
	 * Returns a chat's {@link ChatOrigin} from its catalog summary, not its
	 * (lazily-materialized) {@link ChatState}: a restored chat registers its
	 * summary — origin included — up front, before state resolves via
	 * {@link resolveChatState}. Origin is immutable, so no hydration is needed.
	 */
	getChatOrigin(chat: URI): ChatOrigin | undefined {
		return this._chatEntries.get(chat)?.summary.origin;
	}

	/** Returns the provider-derived inherited boundary retained by the host catalog. */
	getChatInheritedTurnId(chat: URI): string | undefined {
		return this._chatEntries.get(chat)?.inheritedTurnId;
	}

	/**
	 * Resolves a restored chat's provider backing and history when necessary.
	 * Concurrent calls for one entry share its resolver; a failed attempt can
	 * be retried unless the entry was removed or replaced.
	 */
	resolveChatState(chat: URI): Promise<ChatState | undefined> {
		const entry = this._chatEntries.get(chat);
		if (!entry || !entry.valid) {
			return Promise.resolve(undefined);
		}
		if (entry.state) {
			return Promise.resolve(entry.state);
		}
		if (!entry.resolver) {
			return Promise.resolve(undefined);
		}
		if (entry.inFlight) {
			return entry.inFlight;
		}

		const inFlight = (async () => {
			const restored = await entry.resolver!(entry.providerData);
			if (!entry.valid || this._chatEntries.get(chat) !== entry) {
				throw new Error(`Restored chat was invalidated while resolving: ${chat}`);
			}
			if (!entry.state) {
				entry.state = { ...createChatState(entry.summary), turns: restored.turns, draft: restored.draft ?? entry.draft };
				entry.resolver = undefined;
				if (restored.turns.length > 0) {
					this._markSessionUsed(entry.session);
				}
			}
			return entry.state;
		})();
		entry.inFlight = inFlight;
		void inFlight.then(
			() => {
				if (entry.inFlight === inFlight) {
					entry.inFlight = undefined;
				}
			},
			() => {
				if (entry.inFlight === inFlight) {
					entry.inFlight = undefined;
				}
			},
		);
		return inFlight;
	}

	/** Replaces a chat's opaque, agent-owned provider data without interpreting it. */
	updateChatProviderData(chat: URI, providerData: string | undefined): void {
		const entry = this._chatEntries.get(chat);
		if (entry) {
			entry.providerData = providerData;
		}
	}

	/**
	 * Seeds the conversation contents (turns) of a session's default chat.
	 * Used by the fork flow, which materializes a new session pre-populated
	 * with a slice of the source session's turns.
	 */
	seedDefaultChatTurns(session: URI, turns: Turn[]): void {
		const chatState = this._chatEntries.get(buildDefaultChatUri(session))?.state;
		if (chatState) {
			chatState.turns = turns;
		}
		if (turns.length > 0) {
			this._markSessionUsed(session);
		}
	}

	get serverSeq(): number {
		return this._serverSeq;
	}

	getSessionUris(): string[] {
		return [...this._sessionStates.keys()];
	}

	/**
	 * Summaries eligible to be overlaid onto a provider's `listSessions`
	 * snapshot when that snapshot is missing them. A session qualifies if it
	 * has materialized (lifecycle !== {@link SessionLifecycle.Creating}) — this
	 * covers the transient-drop case where a provider briefly omits a
	 * just-materialized session — or if it is still provisional but has had any
	 * turn activity (an in-flight turn, or a completed turn whose materialize
	 * event has not landed yet; the first turn can start before materialization
	 * completes). Idle provisional sessions (created but not yet materialized
	 * and with no turn activity, e.g. the new-session composer's eagerly-created
	 * session before its first message) are excluded so they don't leak into
	 * the session list (#321269).
	 */
	getOverlaySessionSummaries(): SessionSummary[] {
		const summaries: SessionSummary[] = [];
		for (const [key, entry] of this._sessionStates) {
			if (this._isIdleProvisional(key, entry.state.lifecycle) || this.isEphemeralSession(key)) {
				continue;
			}
			summaries.push(this._toSummary(key, entry));
		}
		return summaries;
	}

	/**
	 * Whether a session is created but not yet materialized ({@link SessionLifecycle.Creating})
	 * with no turn activity — e.g. the new-session composer's eagerly-created
	 * session before its first message. Such sessions must not leak into the
	 * session list (#321269). Returns `false` if the session has no tracked state.
	 */
	isIdleProvisionalSession(session: string): boolean {
		const entry = this._sessionStates.get(session);
		return entry ? this._isIdleProvisional(session, entry.state.lifecycle) : false;
	}

	/** Whether the session is owned by a throwaway VS Code chat surface. */
	isEphemeralSession(session: string): boolean {
		const entry = this._sessionStates.get(session);
		return entry ? readEphemeralSessionMeta(entry.state).isEphemeral === true : false;
	}

	/** Returns the typed VS Code surface metadata for a tracked session, when present. */
	getSessionSurfaceMeta(session: string): IChatSurfaceMeta | undefined {
		const entry = this._sessionStates.get(session);
		return entry ? readChatSurfaceMeta(entry.state) : undefined;
	}

	private _isIdleProvisional(session: string, lifecycle: SessionLifecycle): boolean {
		// Turn activity lives on the session's default chat after the multi-chat
		// protocol move, so consult that chat's turns/activeTurn.
		const chat = this._chatEntries.get(buildDefaultChatUri(session))?.state;
		return lifecycle === SessionLifecycle.Creating && !chat?.activeTurn && (chat?.turns.length ?? 0) === 0;
	}

	/**
	 * Returns all session URIs whose keys start with the given prefix.
	 * Used to discover subagent sessions for a given parent.
	 */
	getSessionUrisWithPrefix(prefix: string): string[] {
		const result: string[] = [];
		for (const key of this._sessionStates.keys()) {
			if (key.startsWith(prefix)) {
				result.push(key);
			}
		}
		return result;
	}

	// ---- Snapshots ----------------------------------------------------------

	/**
	 * Returns a state snapshot for a given resource URI.
	 * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
	 * the client should process subsequent envelopes with serverSeq > fromSeq.
	 */
	getSnapshot(resource: URI): IStateSnapshot | undefined {
		if (isAhpRootChannel(resource)) {
			return {
				resource: ROOT_STATE_URI,
				state: this._rootState,
				fromSeq: this._serverSeq,
			};
		}

		if (isAhpAutomationCatalogChannel(resource)) {
			if (!this._automationCatalog) {
				return undefined;
			}
			return {
				resource,
				state: this._automationCatalog,
				fromSeq: this._serverSeq,
			};
		}

		if (isAhpAutomationRunChannel(resource)) {
			const state = this._automationRuns.get(resource);
			if (!state) {
				return undefined;
			}
			return {
				resource,
				state,
				fromSeq: this._serverSeq,
			};
		}

		// Changeset URIs are nested under their session URI; check them
		// before falling back to the session map so a session whose URI
		// happens to share a prefix with a changeset never collides.
		const changesetState = this._changesets.get(resource);
		if (changesetState) {
			return {
				resource,
				state: changesetState,
				fromSeq: this._serverSeq,
			};
		}

		// Chat channel URIs resolve to per-chat conversation state.
		if (isAhpChatChannel(resource)) {
			const chatState = this._chatEntries.get(resource)?.state;
			if (!chatState) {
				return undefined;
			}
			return {
				resource,
				state: chatState,
				fromSeq: this._serverSeq,
			};
		}

		// Annotation URIs are nested under their session URI as well. They are
		// client-dispatchable and lazily created, so return an empty state for
		// a well-formed annotations URI even before the first write.
		if (isAnnotationsUri(resource)) {
			return {
				resource,
				state: this._annotations.get(resource) ?? { annotations: [] },
				fromSeq: this._serverSeq,
			};
		}

		const entry = this._sessionStates.get(resource);
		if (!entry) {
			return undefined;
		}

		return {
			resource,
			state: entry.state,
			fromSeq: this._serverSeq,
		};
	}

	/** Installs the durable automation catalogue before accepting subscriptions. */
	setAutomationCatalogState(state: AutomationCatalogState): void {
		this._automationCatalog = state;
	}

	getAutomationCatalogState(): AutomationCatalogState | undefined {
		return this._automationCatalog;
	}

	/** Installs one durable automation run before accepting subscriptions. */
	setAutomationRunState(state: AutomationRunState): void {
		this._automationRuns.set(state.resource, state);
	}

	getAutomationRunState(resource: string): AutomationRunState | undefined {
		return this._automationRuns.get(resource);
	}

	/** Read-only accessor for callers that only need to inspect a changeset (not subscribe). */
	getChangesetState(changeset: URI): ChangesetState | undefined {
		return this._changesets.get(changeset);
	}

	/** Reconsiders changeset state retention after subscribers or computes release their pins. */
	onChangesetLivenessChanged(): void {
		this._changesets.trimEvictableEntries();
	}

	// ---- Session lifecycle --------------------------------------------------

	/**
	 * Creates a new session in state with `lifecycle: 'creating'`.
	 * Returns the initial session state.
	 *
	 * By default a {@link NotificationType.SessionAdded} notification is
	 * emitted so clients see the new session immediately. Pass
	 * `options.emitNotification: false` to defer the notification — a typical
	 * use is for **provisional** sessions that exist on the server but should
	 * not appear in client session lists until they have been persisted by
	 * the agent (e.g. on the first message that materializes an SDK session
	 * and writes its on-disk metadata). Call {@link markSessionPersisted}
	 * afterwards to fire the deferred notification.
	 */
	createSession(summary: SessionSummary, options?: { readonly emitNotification?: boolean }): SessionState {
		const key = summary.resource;
		const existing = this._sessionStates.get(key);
		if (existing) {
			this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
			return existing.state;
		}

		const state = createSessionState(summary);
		this._sessionStates.set(key, this._newEntry(state, summary, SessionUse.UnusedDraft));
		this._ensureDefaultChat(key, summary);

		this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);

		if (options?.emitNotification !== false) {
			// Announcing the summary to the notifier is what makes
			// its later flush emit incremental updates and what makes
			// `markSessionPersisted` a no-op. Provisional sessions
			// intentionally skip both until they are persisted.
			this._emitSessionAdded(summary);
		}

		return state;
	}

	/** Builds the authoritative {@link ISessionEntry} for a freshly seeded state. */
	private _newEntry(state: SessionState, summary: SessionSummary, use: SessionUse): ISessionEntry {
		return { state, createdAt: summary.createdAt, modifiedAt: summary.modifiedAt, changes: summary.changes, use };
	}

	/**
	 * Fire a {@link NotificationType.SessionAdded} notification for a session
	 * whose creation was deferred via `createSession({ emitNotification: false })`.
	 *
	 * Propagates the materialization-resolved catalog fields (`project`,
	 * `workingDirectory`, `modifiedAt`, `changes`) from the supplied summary
	 * onto the session entry so subscribers see them. The reducer-owned metadata
	 * (`title`, `status`, `activity`) is intentionally NOT copied back — the live
	 * state is authoritative for those. No-ops for sessions that were already
	 * announced (idempotent).
	 */
	markSessionPersisted(session: URI, summary: SessionSummary, force = false): void {
		const key = session.toString();
		const entry = this._sessionStates.get(key);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
			return;
		}
		if (!force && this._addedSessionSummaries.has(key)) {
			return;
		}
		// Propagate the materialization-resolved fields so subscribers calling
		// `getSessionState` / `getSessionSummary` see the resolved working
		// directory / project. We don't need to schedule a
		// `SessionSummaryChanged` flush because the upcoming `SessionAdded`
		// notification carries the complete summary already.
		entry.state = { ...entry.state, project: summary.project, workingDirectories: summary.workingDirectories };
		entry.modifiedAt = summary.modifiedAt;
		entry.changes = summary.changes;
		const full = this._toSummary(key, entry);
		this._emitSessionAdded(full);
	}

	/**
	 * Announce a legacy Copilot CLI session that the provider discovered on disk
	 * (surfaced as adoptable) after startup, so clients add it to their list
	 * without a manual reload. Does NOT create persistent state — the session is
	 * materialized on demand when the user opens it (restore/adopt). No-ops if
	 * the session is already in state or was already announced.
	 */
	announceSurfacedSession(summary: SessionSummary): void {
		const key = summary.resource;
		if (this._sessionStates.has(key)) {
			this._logService.trace(`[AgentHostStateManager] announceSurfacedSession: already in state ${key}`);
			return;
		}
		if (this._addedSessionSummaries.has(key)) {
			this._logService.trace(`[AgentHostStateManager] announceSurfacedSession: already added ${key}`);
			return;
		}
		this._emitSessionAdded(summary);
	}

	/**
	 * Retitles a surfaced session (one with no live state) so clients update it
	 * in place. Live sessions are retitled through the reducer instead.
	 */
	updateSurfacedSessionTitle(session: string, title: string): void {
		const announced = this._summaryNotifier.getAnnounced(session);
		if (this._sessionStates.has(session) || !announced || announced.title === title) {
			return;
		}
		this._summaryNotifier.announce(session, { ...announced, title });
		this._emitSessionSummaryChanged(session, { title });
	}

	/** Removes a surfaced session without affecting a live session. */
	retractSurfacedSession(session: string): void {
		if (this._sessionStates.has(session)) {
			return;
		}
		const wasPublished = this._publishedSessionSummaries.delete(session);
		const wasAdded = this._addedSessionSummaries.delete(session);
		if (!wasPublished && !wasAdded) {
			return;
		}
		this._summaryNotifier.remove(session);
		this._onDidEmitNotification.fire({
			type: 'root/sessionRemoved',
			channel: ROOT_STATE_URI,
			session,
		});
	}

	/**
	 * Applies a {@link SessionStatus} flag to a session that has NO live state.
	 *
	 * Archived/read state is durable and mutable whether or not the session is
	 * materialized, and AHP publishes such catalogue mutations via
	 * `root/sessionSummaryChanged` so clients tracking the session list converge
	 * without subscribing to every session.
	 *
	 * No-ops for a live session (the reducer owns that), one never announced, or
	 * a flag already in the requested position.
	 */
	setSurfacedSessionStatusFlag(session: string, flag: SessionStatus, set: boolean): void {
		if (this._sessionStates.has(session)) {
			return;
		}
		const announced = this._summaryNotifier.getAnnounced(session);
		if (!announced) {
			return;
		}
		const status = withSessionStatusFlag(announced.status, flag, set);
		if (status === announced.status) {
			return;
		}
		this._summaryNotifier.applyAnnouncedChanges(session, { status });
	}

	/** Publishes or unpublishes a live session summary without changing its session state. */
	setSessionSummaryPublished(session: string, published: boolean): void {
		if (published) {
			if (this._addedSessionSummaries.has(session)) {
				return;
			}
			const entry = this._sessionStates.get(session);
			if (!entry) {
				return;
			}
			const summary = this._toSummary(session, entry);
			this._emitSessionAdded(summary);
		} else {
			const wasPublished = this._publishedSessionSummaries.delete(session);
			const wasAdded = this._addedSessionSummaries.delete(session);
			if (!wasPublished && !wasAdded) {
				return;
			}
			this._summaryNotifier.remove(session);
			this._onDidEmitNotification.fire({
				type: 'root/sessionRemoved',
				channel: ROOT_STATE_URI,
				session,
			});
		}
	}

	/** Records `root/listSessions` baselines and returns a current snapshot for the response. */
	prepareSessionSummariesForListing(summaries: readonly SessionSummary[]): SessionSummary[] {
		const result: SessionSummary[] = [];
		for (const summary of summaries) {
			const wasPublished = this._publishedSessionSummaries.has(summary.resource);
			if (wasPublished) {
				if (this._summaryNotifier.isDirty(summary.resource)) {
					this._summaryNotifier.flush(summary.resource);
				}
			}

			const entry = this._sessionStates.get(summary.resource);
			const current = entry ? this._toSummary(summary.resource, entry) : summary;
			if (!wasPublished) {
				this._summaryNotifier.announce(summary.resource, current);
				this._publishedSessionSummaries.add(summary.resource);
			}
			result.push(entry ? this._mergeLiveSummaryForListing(summary, current) : summary);
		}
		return result;
	}

	private _mergeLiveSummaryForListing(listed: SessionSummary, current: SessionSummary): SessionSummary {
		const meta = listed._meta !== undefined || current._meta !== undefined
			? { ...listed._meta, ...current._meta }
			: undefined;
		return {
			...listed,
			title: current.title || listed.title,
			status: current.status,
			activity: current.activity,
			modifiedAt: current.modifiedAt,
			project: current.project ?? listed.project,
			workingDirectories: current.workingDirectories ?? listed.workingDirectories,
			changes: current.changes ?? listed.changes,
			...(meta !== undefined ? { _meta: meta } : {}),
		};
	}

	/** Returns external sessions exposed through either listing or global add notification. */
	getExposedExternalSessionKeys(): string[] {
		const result: string[] = [];
		for (const session of this._publishedSessionSummaries) {
			const entry = this._sessionStates.get(session);
			const summary = entry ? this._toSummary(session, entry) : this._summaryNotifier.getAnnounced(session);
			if (readSessionExternal(summary?._meta)) {
				result.push(session);
			}
		}
		return result;
	}

	/**
	 * Restores a session from a previous server lifetime into the state manager
	 * with pre-populated turns. The session is created in `ready` lifecycle
	 * state since it already exists on the backend.
	 *
	 * Unlike {@link createSession}, this does NOT emit a `sessionAdded`
	 * notification because the session is already known to clients via
	 * `listSessions`. When the session was previously surfaced with a different
	 * summary (e.g. adoptable-legacy), a `sessionSummaryChanged` delta is emitted
	 * so clients update the entry in place instead of dropping it.
	 */
	restoreSession(summary: SessionSummary, turns: Turn[], options?: { readonly draft?: Message; readonly defaultChatTitle?: string }): SessionState {
		const key = summary.resource;
		const existing = this._sessionStates.get(key);
		if (existing) {
			this._logService.warn(`[AgentHostStateManager] Session already exists (restore): ${key}`);
			return existing.state;
		}

		const state: SessionState = {
			...createSessionState(summary),
			lifecycle: SessionLifecycle.Ready,
		};
		this._sessionStates.set(key, this._newEntry(state, summary, SessionUse.Used));
		this._ensureDefaultChat(key, summary, turns, options?.draft, options?.defaultChatTitle);
		// A session that was previously surfaced (e.g. announced as an
		// adoptable-legacy session) is already known to clients with a different
		// summary. Emit the delta so they update the entry in place — clearing the
		// adoptable marker — rather than dropping the just-opened session on the
		// next list reconcile. Never-announced sessions record the summary silently
		// and stay hidden until {@link setSessionSummaryPublished}.
		if (this._summaryNotifier.isAnnounced(key)) {
			this._summaryNotifier.flush(key);
		} else {
			this._summaryNotifier.announce(key, summary);
		}

		this._logService.trace(`[AgentHostStateManager] Restored session: ${key} (${turns.length} turns)`);

		return state;
	}

	/**
	 * Creates the default {@link ChatState} for a session and records it as
	 * the session's single chat. VS Code models every session as having
	 * exactly one chat — its default chat — whose URI is derived
	 * deterministically from the session URI. The chat is seeded with any
	 * pre-populated `turns` (used by {@link restoreSession}).
	 *
	 * The session's `chats` catalog and `defaultChat` pointer are updated
	 * in place rather than via dispatched actions: there are no subscribers
	 * at creation/restore time, so the snapshot a client later receives on
	 * subscribe already reflects the default chat.
	 */
	private _ensureDefaultChat(sessionKey: string, summary: SessionSummary, turns?: Turn[], draft?: Message, defaultChatTitle?: string): void {
		const chatUri = buildDefaultChatUri(sessionKey);
		// Empty title means "inherit the session title"; a persisted independent
		// rename (`defaultChatTitle`) is seeded back here so it survives restore.
		const chatSummary: ChatSummary = { ...createDefaultChatSummary(summary, chatUri), title: defaultChatTitle ?? '' };
		this._chatEntries.set(chatUri, {
			session: sessionKey,
			summary: chatSummary,
			state: { ...createChatState(chatSummary), turns: turns ?? [], draft },
			valid: true,
		});
		const entry = this._sessionStates.get(sessionKey);
		if (entry) {
			// Update the session's chat catalog in place so the object
			// identity returned by `createSession`/`restoreSession` stays
			// live in the map. Callers (e.g. `AgentService.createSession`)
			// mutate the returned state directly (`state.config = …`), so
			// replacing the map entry with a fresh clone here would strand
			// those mutations on a detached object.
			entry.state.chats = [chatSummary];
			entry.state.defaultChat = chatUri;
		}
	}

	/**
	 * Adds an additional (non-default) chat to an existing session. Creates
	 * the chat's authoritative {@link ChatState}, registers it in the session's
	 * catalog via a dispatched {@link ActionType.SessionChatAdded} action (so
	 * live subscribers refresh), and returns the new chat's summary.
	 *
	 * The chat inherits the session's model/agent/working-directory scope. It
	 * is a no-op (returning the existing summary) when a chat with the same URI
	 * already exists.
	 *
	 * When `options.providerData` is supplied it is recorded verbatim as the
	 * peer chat's opaque, agent-owned restore blob. The StateManager never
	 * parses it. The default chat never carries `providerData`.
	 *
	 * `options.origin` records how the chat came into existence (fork, side
	 * chat, tool spawn). Omitting it defaults to {@link ChatOriginKind.User}
	 * via {@link createDefaultChatSummary}, so every catalog chat has an origin.
	 */
	addChat(session: URI, chatUri: URI, options?: { readonly title?: string; readonly turns?: Turn[]; readonly origin?: ChatOrigin; readonly providerData?: string; readonly inheritedTurnId?: string; readonly interactivity?: ChatInteractivity }): ChatSummary | undefined {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] addChat for unknown session: ${session}`);
			return undefined;
		}
		const sessionState = entry.state;
		const existing = sessionState.chats.find(c => c.resource === chatUri);
		if (existing) {
			return existing;
		}

		// A session gains its first additional chat here: snapshot the current
		// session title onto the still-inheriting default chat so the two
		// titles become fully independent. Without this the default chat keeps
		// an empty title (= inherit the session title), so renaming the session
		// would also move the default chat tab and vice-versa.
		this._snapshotDefaultChatTitle(session, sessionState);

		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
			title: options?.title ?? '',
			status: SessionStatus.Idle,
			...(options?.origin ? { origin: options.origin } : {}),
			interactivity: options?.interactivity,
		};
		this._chatEntries.set(chatUri, {
			session,
			summary: chatSummary,
			state: { ...createChatState(chatSummary), turns: options?.turns ?? [] },
			providerData: options?.providerData,
			inheritedTurnId: options?.inheritedTurnId,
			valid: true,
		});
		this.dispatchServerAction(session, { type: ActionType.SessionChatAdded, summary: chatSummary });
		return chatSummary;
	}

	/**
	 * Registers a restored peer chat in the parent session's catalog without
	 * creating conversation state. The state-manager-owned resolver installs a
	 * complete state only through {@link resolveChatState}.
	 */
	registerRestoredChatSummary(session: URI, chatUri: URI, options: { readonly title?: string; readonly origin?: ChatOrigin; readonly interactivity?: ChatInteractivity; readonly draft?: Message; readonly providerData?: string; readonly inheritedTurnId?: string; readonly resolver?: RestoredChatResolver }): ChatSummary | undefined {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] registerRestoredChatSummary for unknown session: ${session}`);
			return undefined;
		}
		const sessionState = entry.state;
		const existing = sessionState.chats.find(c => c.resource === chatUri);
		if (existing) {
			const existingEntry = this._chatEntries.get(chatUri);
			if (existingEntry && !existingEntry.state && options.resolver) {
				existingEntry.providerData = options.providerData;
				existingEntry.inheritedTurnId = options.inheritedTurnId;
				existingEntry.draft = options.draft;
				existingEntry.resolver = options.resolver;
			}
			return existing;
		}
		this._snapshotDefaultChatTitle(session, sessionState);
		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
			title: options.title ?? '',
			status: SessionStatus.Idle,
			// A persisted catalog entry with no recorded origin is a plain
			// user-created chat; keep the default rather than restoring it
			// without provenance.
			...(options.origin ? { origin: options.origin } : {}),
			interactivity: options.interactivity,
		};
		entry.state.chats = [...entry.state.chats, chatSummary];
		this._chatEntries.set(chatUri, {
			session,
			summary: chatSummary,
			providerData: options.providerData,
			inheritedTurnId: options.inheritedTurnId,
			draft: options.draft,
			resolver: options.resolver,
			valid: true,
		});
		return chatSummary;
	}

	private _snapshotDefaultChatTitle(session: URI, state: SessionState): void {
		const defaultChat = buildDefaultChatUri(session);
		const summary = state.chats.find(chat => chat.resource === defaultChat);
		if (summary && !summary.title && state.title) {
			this.updateChatTitle(session, defaultChat, state.title);
			this._onDidSnapshotDefaultChatTitle.fire({ session, chat: defaultChat, title: state.title });
		}
	}

	/**
	 * Removes an additional chat from a session. Deletes its
	 * {@link ChatState}, dispatches {@link ActionType.SessionChatRemoved}, and
	 * — if the removed chat was the default — repoints `defaultChat` to the
	 * first remaining chat. The default chat itself cannot be removed in
	 * isolation; it lives and dies with its session.
	 */
	removeChat(session: URI, chatUri: URI): void {
		const entry = this._sessionStates.get(session);
		if (!entry || !entry.state.chats.some(c => c.resource === chatUri)) {
			return;
		}
		const sessionState = entry.state;
		if (chatUri === sessionState.defaultChat || isDefaultChatUri(chatUri)) {
			this._logService.warn(`[AgentHostStateManager] refusing to remove default chat: ${chatUri}`);
			return;
		}
		// Drop the chat from its session's active-turn set before deleting its
		// state. A peer chat can be removed while it still has an active turn;
		// because active-turn tracking is driven by chat state transitions,
		// deleting the ChatState here without this would strand the chat URI in
		// the active set forever, keeping the session permanently "active"
		// (activeSessions > 0) and leaving changeset operations disabled.
		this._removeChatActiveTurn(session, chatUri);
		this._invalidateChatEntry(chatUri);
		this.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: chatUri });
	}

	/**
	 * Invalidates restored chat resolution before a session's asynchronous
	 * teardown starts. Session removal subsequently drops the entries entirely.
	 */
	invalidateSessionChatResolutions(session: URI): void {
		for (const entry of this._chatEntries.values()) {
			if (entry.session === session) {
				entry.valid = false;
			}
		}
	}

	/**
	 * Renames a single chat within a session independently of the session
	 * title. Updates the chat's authoritative {@link ChatState} title (so
	 * later `chatSummaryFromState` projections stay consistent) and dispatches
	 * a {@link ActionType.SessionChatUpdated} so the session's catalog entry and
	 * live subscribers reflect the new title. Works for the default chat too —
	 * giving it a non-empty title that no longer inherits the session title.
	 */
	updateChatTitle(session: URI, chatUri: URI, title: string): void {
		const chatState = this._chatEntries.get(chatUri)?.state;
		if (chatState) {
			const entry = this._chatEntries.get(chatUri)!;
			entry.state = { ...chatState, title };
		}
		this.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: chatUri, changes: { title } });
	}

	/**
	 * Removes a session from in-memory state without emitting a
	 * {@link NotificationType.SessionRemoved} notification.
	 * Use {@link deleteSession} when the session is being permanently deleted
	 * and clients need to be notified of its removal.
	 *
	 * Any pending summary change is flushed synchronously before the session is
	 * torn down, so clients receive the final status (e.g. Idle after a turn
	 * completes) even when the session is evicted before the scheduler fires.
	 * A {@link NotificationType.SessionSummaryChanged} notification may therefore
	 * be emitted as a side-effect of this call.
	 *
	 * Per-session changesets are intentionally NOT torn down here: this method
	 * is also used by `AgentSessionResidency` for residency eviction, and
	 * the session list view keeps a
	 * changeset subscription open per visible row to render the diff chip.
	 * Tearing down on eviction would clear the chip on the list while the row
	 * is still on screen. Permanent-delete paths (`deleteSession`,
	 * `removeSubagentSessions`) call `disposeSessionChangesets` explicitly
	 * before invoking `removeSession`.
	 */
	removeSession(session: URI): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			return;
		}
		this.invalidateSessionChatResolutions(session);

		// Flush any pending summary notification before tearing down state so
		// that the final status (e.g. Idle) reaches clients even if the session
		// is evicted within the scheduler's debounce window.
		if (this._summaryNotifier.isDirty(session)) {
			this._summaryNotifier.flush(session);
		}

		// Clean up active turn tracking. We must dispatch
		// `RootActiveSessionsChanged` if the count actually changes so that
		// downstream consumers (e.g. the server lifetime tracker driving
		// `--enable-remote-auto-shutdown`) release their hold on the process.
		// Without this, evicting a session that still has an active turn
		// silently strands the active-sessions count above zero forever.
		if (this._sessionsWithActiveTurn.delete(session)) {
			this._onDidChangeSessionActiveTurn.fire({ session, active: false });
			this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
		}

		// Tear down every chat owned by the session, not just the default
		// chat: additional peer chats each hold their own ChatState.
		for (const chat of entry.state.chats) {
			this._invalidateChatEntry(chat.resource);
		}
		this._invalidateChatEntry(buildDefaultChatUri(session));
		this._sessionStates.delete(session);
		this._onDidRemoveSession.fire(session);
		// The announced baseline outlives in-memory state: this is also the
		// idle-eviction hook, and eviction emits no `sessionRemoved`, so clients
		// still list the session and can still archive it. Paths that truly
		// retract the entry (`deleteSession`, `retractSurfacedSession`,
		// `setSessionSummaryPublished`) clear it themselves.
		this._summaryNotifier.clearDirty(session);
		this._logService.trace(`[AgentHostStateManager] Removed session: ${session}`);
	}

	/**
	 * Permanently deletes a session from state and emits a
	 * {@link NotificationType.SessionRemoved} notification so that clients
	 * know the session is no longer accessible.
	 *
	 * Sessions whose creation was deferred via
	 * `createSession({ emitNotification: false })` and never persisted via
	 * {@link markSessionPersisted} are removed silently — no client knows
	 * about them, so a `SessionRemoved` would be noise (or worse, would
	 * cause clients to drop a session URI they had eagerly subscribed to).
	 */
	deleteSession(session: URI): void {
		const wasPublished = this._publishedSessionSummaries.has(session.toString());
		// Drop any pending summary diff: the forthcoming SessionRemoved notification
		// supersedes it and we don't want to emit spurious SessionSummaryChanged
		// events just before the session disappears from the client's view.
		this._summaryNotifier.clearDirty(session);
		// Tear down per-session changesets first so subscribers see the
		// final `changeset/cleared` envelope before the session itself goes
		// away. The envelopes flow through the same emitter as everything
		// else, so callers observing `onDidEmitEnvelope` get a deterministic
		// order: changeset/cleared (per changeset) → session removal.
		this.disposeSessionChangesets(session);
		this.disposeSessionAnnotations(session);
		this.removeSession(session);
		// Unlike eviction, deletion retracts the catalogue entry, so the
		// announced baseline that `removeSession` deliberately preserves must go.
		this._summaryNotifier.remove(session.toString());
		if (wasPublished) {
			this._publishedSessionSummaries.delete(session.toString());
			this._addedSessionSummaries.delete(session.toString());
			this._onDidEmitNotification.fire({
				type: 'root/sessionRemoved',
				channel: ROOT_STATE_URI,
				session,
			});
		}
	}

	// ---- Session meta -------------------------------------------------------

	/**
	 * Replaces `state._meta` on a session by dispatching a
	 * {@link ActionType.SessionMetaChanged} action so the change flows
	 * through the action envelope (and thus to all live subscribers).
	 *
	 * The full `_meta` object is replaced (not merged) so callers stay in
	 * control of the convention for their own keys; use the `withSessionXxx`
	 * helpers in `sessionState.ts` to combine slots.
	 */
	setSessionMeta(session: URI, meta: SessionMeta | undefined): void {
		this.dispatchServerAction(session, { type: ActionType.SessionMetaChanged, _meta: meta });
	}

	/**
	 * Seeds or replaces a session's resolved {@link SessionConfigState} on the
	 * live session state. Unlike mid-session {@link ActionType.SessionConfigChanged}
	 * updates (which merge values onto an existing config), this establishes
	 * the initial config and is therefore an in-place mutation of the
	 * authoritative state object so the value is present in the first snapshot
	 * a subscriber receives. Use this from create/restore flows where the
	 * config is resolved asynchronously after the session state already exists
	 * in the map — reading back through {@link getSessionState} would return a
	 * detached composite copy and stranding the mutation there.
	 */
	setSessionConfig(session: URI, config: SessionConfigState | undefined): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] setSessionConfig: unknown session ${session}`);
			return;
		}
		entry.state.config = config;
	}

	/**
	 * Seeds or replaces the session's effective customizations directly on the
	 * authoritative in-memory state. Used by create/restore flows to ensure the
	 * first snapshot already contains customizations.
	 */
	setSessionCustomizations(session: URI, customizations: readonly Customization[] | undefined): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] setSessionCustomizations: unknown session ${session}`);
			return;
		}
		entry.state.customizations = customizations ? [...customizations] : undefined;
	}

	// ---- Changeset registry -------------------------------------------------

	/**
	 * Registers a server-side changeset so that subscribers can attach to its
	 * URI. The changeset is created with the supplied initial status (default
	 * {@link ChangesetStatus.Computing}); subsequent file/operation/status
	 * mutations flow through {@link dispatchChangesetAction} on the
	 * canonical `<sessionUri>/changeset/<changesetId>` URI.
	 *
	 * Idempotent: a second call with the same URI is a no-op so producers
	 * can safely re-register on session resume without double-creating
	 * state.
	 *
	 * Callers construct `changesetUri` via {@link buildSessionChangesetUri}
	 * for the session-wide entry, or {@link buildChangesetUri} for any
	 * other catalogue entry.
	 *
	 * Returns the supplied changeset URI for caller convenience.
	 */
	registerChangeset(changesetUri: URI, initialStatus: ChangesetStatus = ChangesetStatus.Computing): URI {
		this._changesets.register(changesetUri, initialStatus);
		return changesetUri;
	}

	/**
	 * Updates the aggregate `changes` for a session.
	 *
	 * There is no dedicated action for this field: the value is purely
	 * informational (chip rendering on the session list), so the write
	 * piggybacks on the existing `sessionSummaryChanged` notification
	 * path. We update the session entry, mark the session dirty, and let
	 * the summary notifier's flush pick the new value up via its
	 * `current.changes !== lastNotified.changes` diff.
	 */
	setSessionSummaryChanges(session: URI, changes: ChangesSummary | undefined): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] setSessionSummaryChanges: unknown session ${session}`);
			return;
		}
		if (structuralEquals(entry.changes, changes)) {
			return;
		}

		entry.changes = changes;

		this._summaryNotifier.markDirty(session);
	}

	/**
	 * Replaces the catalogue entries on `state.changesets` for `session` by
	 * dispatching a {@link ActionType.SessionChangesetsChanged} action.
	 * Subscribers see the mutation in the standard session action stream —
	 * the catalogue lives on session state and is not its own subscribable
	 * resource. Aggregate `changes` counts (additions / deletions /
	 * files) are propagated separately via {@link setSessionSummaryChanges}.
	 *
	 * Producers call this after each compute pass to keep the list of
	 * available changesets (with their `changeKind`) in sync so observers
	 * can render the correct entries without subscribing to each one.
	 */
	setSessionChangesets(session: URI, changesets: readonly Changeset[] | undefined): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] setSessionChangesets: unknown session ${session}`);
			return;
		}
		const state = entry.state;

		// Skip dispatch when the catalogue is field-equal to the existing one.
		// Producers call this after every compute pass, so duplicate calls
		// are common and would otherwise broadcast a redundant envelope to
		// every subscriber.
		if (arrayEquals(state.changesets ?? [], changesets ?? [], structuralEquals)) {
			return;
		}
		// Take a defensive copy so callers can't mutate the catalogue array
		// after dispatch; the reducer otherwise stores the reference as-is.
		const next = changesets ? changesets.slice() : undefined;
		this.dispatchServerAction(session, {
			type: ActionType.SessionChangesetsChanged,
			changesets: next,
		});
	}

	/**
	 * Tear down a changeset. Dispatches {@link ActionType.ChangesetCleared}
	 * so subscribers see an empty file list, then deletes the local state
	 * so a fresh `getChangesetState` returns `undefined` and forces the
	 * producer to re-create the changeset on next subscribe.
	 *
	 * Per the spec, the server SHOULD also unsubscribe its clients after
	 * dispatching this action; for VS Code-internal clients that happens
	 * via the `notify/sessionRemoved` notification, which the workbench-side
	 * provider correlates to release any held subscriptions.
	 *
	 * Safe to call for a URI that was never registered: producers typically
	 * iterate over a candidate set on session disposal and emit dispose
	 * actions defensively.
	 */
	disposeChangeset(changeset: URI): void {
		if (!this._changesets.has(changeset)) {
			return;
		}
		this.dispatchServerAction(changeset, {
			type: ActionType.ChangesetCleared,
		});
		this._changesets.delete(changeset);
	}

	/**
	 * Disposes every changeset whose URI is nested under `session` (i.e.
	 * matches `<session>/changeset/...`). Used to cascade cleanup when a
	 * session itself is removed.
	 */
	disposeSessionChangesets(session: URI): void {
		// Collect first because `disposeChangeset` mutates the underlying
		// map via its envelope handler.
		const toDispose: URI[] = [];
		for (const uri of this._changesets.keys()) {
			const parsed = parseChangesetUri(uri);
			if (parsed && parsed.sessionUri === session) {
				toDispose.push(uri);
			}
		}
		for (const uri of toDispose) {
			this.disposeChangeset(uri);
		}
	}

	/**
	 * Drops the annotation state nested under `session` (i.e. the
	 * `<session>/annotations` channel). Used to cascade cleanup when a
	 * session itself is removed. Subscriptions are released via the
	 * forthcoming `sessionRemoved` notification.
	 */
	disposeSessionAnnotations(session: URI): void {
		for (const resource of this._annotations.keys()) {
			const annotations = parseAnnotationsUri(resource);
			const subagent = annotations ? parseSubagentSessionUri(annotations.sessionUri) : undefined;
			if (annotations?.sessionUri === session || subagent?.parentSession.toString() === session) {
				this._annotations.delete(resource);
			}
		}
	}

	/** Restores a session's annotations before serving its first snapshot. */
	restoreAnnotations(session: URI, state: AnnotationsState): void {
		this._annotations.set(buildAnnotationsUri(session), state);
	}

	/** Returns the current annotations state for a channel, when materialized. */
	getAnnotationsState(resource: URI): AnnotationsState | undefined {
		return this._annotations.get(resource);
	}

	// ---- Turn tracking ------------------------------------------------------

	/**
	 * Registers a mapping from turnId to session URI so that incoming
	 * provider events (which carry only session URI) can be associated
	 * with the correct active turn.
	 */
	getActiveTurnId(sessionOrChat: URI): string | undefined {
		const chatUri = isAhpChatChannel(sessionOrChat) ? sessionOrChat : buildDefaultChatUri(sessionOrChat);
		return this._chatEntries.get(chatUri)?.state?.activeTurn?.id;
	}

	// ---- Action dispatch ----------------------------------------------------

	/**
	 * Dispatch a server-originated action (from the agent backend).
	 * The action is applied to state via the reducer and emitted as an
	 * envelope with no origin (server-produced).
	 *
	 * `channel` identifies the channel the action targets — `ROOT_STATE_URI`
	 * for root actions, a session URI for session actions, a terminal URI
	 * for terminal actions, an expanded changeset URI for changeset actions.
	 */
	dispatchServerAction(channel: URI, action: StateAction): void {
		this._applyAndEmit(channel, action, undefined);
	}

	/**
	 * Dispatch a client-originated action (write-ahead from a renderer).
	 * The action is applied to state and emitted with the client's origin
	 * so the originating client can reconcile.
	 */
	dispatchClientAction(channel: URI, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction, origin: ActionOrigin, clientContext?: IAgentHostClientTelemetryContext): unknown {
		return this._applyAndEmit(channel, action, origin, clientContext);
	}

	/**
	 * Reject a client-originated action without applying it to state. Emits an
	 * {@link ActionEnvelope} that carries the original {@link ActionOrigin} and a
	 * {@link ActionEnvelope.rejectionReason | rejectionReason} so the originating
	 * client can reconcile (roll back) its optimistic write-ahead action through
	 * the normal path instead of leaving it pending until reconnect. The reducer
	 * is deliberately NOT run, so no synchronized state changes.
	 */
	rejectClientAction(channel: URI, action: StateAction, origin: ActionOrigin, reason: string): void {
		const envelope: ActionEnvelope = {
			channel,
			action,
			serverSeq: ++this._serverSeq,
			origin,
			rejectionReason: reason,
		};
		this._logService.trace(`[AgentHostStateManager] Emitting rejection envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}, origin=${origin.clientId}:${origin.clientSeq}, reason=${reason}`);
		this._onDidEmitEnvelope.fire(envelope);
	}

	// ---- Internal -----------------------------------------------------------

	private _invalidateChatEntry(chat: URI): void {
		const entry = this._chatEntries.get(chat);
		if (entry) {
			entry.valid = false;
			this._chatEntries.delete(chat);
		}
	}

	private _synchronizeChatEntries(session: URI, summaries: readonly ChatSummary[]): void {
		const expected = new Set(summaries.map(summary => summary.resource));
		for (const summary of summaries) {
			const existing = this._chatEntries.get(summary.resource);
			if (existing) {
				existing.summary = summary;
				if (existing.state) {
					existing.state = { ...existing.state, ...summary };
				}
			} else {
				this._chatEntries.set(summary.resource, {
					session,
					summary,
					valid: true,
				});
			}
		}
		for (const [chat, entry] of this._chatEntries) {
			if (entry.session === session && !expected.has(chat)) {
				this._invalidateChatEntry(chat);
			}
		}
	}

	private _applyAndEmit(channel: URI, action: StateAction, origin: ActionOrigin | undefined, clientContext?: IAgentHostClientTelemetryContext): unknown {
		let resultingState: unknown = undefined;
		if (action.type === ActionType.RootConfigChanged && action.replace) {
			action = {
				...action,
				config: preserveProviderBackedRootConfigValues(this._rootState, action.config),
			};
		}
		// Apply to state
		if (isRootAction(action)) {
			// `RootConfigChanged` can be a true no-op: the reducer merges/replaces
			// values even when the patch matches the current state, and re-emitting
			// it would cause clients observing rootState.onDidChange to react and
			// potentially re-dispatch in a loop. Check the action's own patch
			// against current values before running the reducer so we avoid
			// allocating a new state object at all.
			if (action.type === ActionType.RootConfigChanged && this._rootState.config) {
				const current = this._rootState.config.values;
				const patch = action.config;
				const isNoOp = action.replace
					? equals(current, patch)
					: equals({ ...current, ...patch }, current);
				if (isNoOp) {
					return this._rootState;
				}
			}
			this._rootState = rootReducer(this._rootState, action as RootAction, this._log);
			resultingState = this._rootState;
		}

		if (isSessionAction(action)) {
			const sessionAction = action as SessionAction;
			const key = channel;
			const entry = this._sessionStates.get(key);
			if (entry) {
				const previousState = entry.state;
				const newState = sessionReducer(previousState, sessionAction, this._log);
				const summaryChanged = !this._summaryFieldsEqual(previousState, newState);
				entry.state = newState;
				this._synchronizeChatEntries(key, newState.chats);

				if (previousState.title !== newState.title) {
					this._onDidChangeSessionTitle.fire({ session: key, title: newState.title });
				}
				if (sessionAction.type === ActionType.SessionConfigChanged) {
					this._onDidChangeSessionConfig.fire({ session: key, previous: previousState.config, current: newState.config, clientContext });
				}
				// The reducer returns the SAME state object when a working-directory
				// action is a no-op, so a reference change here means the effective
				// set actually changed. Multi-root operation suppression (turn /
				// compare-turns) depends on this set, so consumers refresh operations.
				if (previousState.workingDirectories !== newState.workingDirectories) {
					this._onDidChangeSessionWorkingDirectories.fire({ session: key });
				}

				// When the reducer touched a summary-relevant field, notify
				// root-channel clients of the derived-summary delta.
				if (summaryChanged) {
					this._summaryNotifier.markDirty(key);
				}

				resultingState = newState;
			} else if (!isAhpChatChannel(key) && !isPassiveSessionMetadataAction(sessionAction)) {
				// Archived/read toggles apply without materializing the session, so
				// an absent entry is expected for them.
				this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		if (isChatAction(action)) {
			if (!isAhpChatChannel(channel)) {
				throw new Error(`[AgentHostStateManager] Chat action dispatched to non-chat channel: ${channel}, type=${action.type}`);
			}

			const chatAction = action as ChatAction;
			const sessionKey = parseRequiredSessionUriFromChatUri(channel);
			const chatEntry = this._chatEntries.get(channel);
			const chat = chatEntry?.state;
			if (chat && chatEntry && sessionKey !== undefined) {
				const newChat = chatReducer(chat, chatAction, this._log);
				chatEntry.state = newChat;
				this._onChatStateChanged(sessionKey, channel, chat, newChat);
				resultingState = newChat;
			} else {
				this._logService.warn(`[AgentHostStateManager] Action for unknown chat: ${channel}, type=${action.type}`);
			}
		}

		if (isChangesetAction(action)) {
			const changesetAction = action as ChangesetAction;
			const key = channel;
			const state = this._changesets.get(key);
			if (!state) {
				// Unknown changeset: log and bail before envelope creation.
				// Routing the action to subscribers (Issue 1) makes
				// orphan envelopes client-visible, so we must drop them
				// here rather than letting them advance `_serverSeq`.
				this._logService.warn(`[AgentHostStateManager] Action for unknown changeset: ${key}, type=${action.type}`);
				return undefined;
			}
			const newState = changesetReducer(state, changesetAction, this._log);
			if (newState !== state) {
				this._changesets.set(key, newState);
			}
			resultingState = newState;
		}

		if (isAnnotationsAction(action)) {
			const annotationsAction = action as AnnotationsAction;
			const key = channel;
			// Annotations are client-dispatchable and lazily created: seed an
			// empty state on first write rather than dropping the action.
			const state = this._annotations.get(key) ?? { annotations: [] };
			const newState = annotationsReducer(state, annotationsAction, this._log);
			if (newState !== state) {
				this._annotations.set(key, newState);
			}
			resultingState = newState;
		}

		if (isAhpAutomationCatalogChannel(channel) && isAutomationAction(action)) {
			const state = this._automationCatalog;
			if (!state) {
				this._logService.warn(`[AgentHostStateManager] Action for unavailable automation catalogue: ${channel}, type=${action.type}`);
				return undefined;
			}
			const newState = automationReducer(state, action, this._log);
			if (newState !== state) {
				this._automationCatalog = newState;
			}
			resultingState = newState;
		}

		if (isAhpAutomationRunChannel(channel) && isAutomationRunAction(action)) {
			const state = this._automationRuns.get(channel);
			if (!state) {
				this._logService.warn(`[AgentHostStateManager] Action for unknown automation run: ${channel}, type=${action.type}`);
				return undefined;
			}
			const newState = automationRunReducer(state, action, this._log);
			if (newState !== state) {
				this._automationRuns.set(channel, newState);
			}
			resultingState = newState;
		}

		// Emit envelope
		const envelope: ActionEnvelope = {
			channel,
			action,
			serverSeq: ++this._serverSeq,
			origin,
		};

		this._logService.trace(`[AgentHostStateManager] Emitting envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ''}`);
		this._onDidEmitEnvelope.fire(envelope);

		return resultingState;
	}

	/**
	 * Removes a single chat from its session's active-turn set, firing the
	 * session-level active flip ({@link onDidChangeSessionActiveTurn} +
	 * {@link ActionType.RootActiveSessionsChanged}) when this clears the
	 * session's last active chat. Safe to call for chats that aren't currently
	 * tracked as active — it is a no-op in that case. Used both when a turn
	 * ends and when a chat is removed mid-turn, so the session can't be
	 * stranded as permanently "active".
	 */
	private _removeChatActiveTurn(sessionKey: string, chatUri: string): void {
		const activeChats = this._sessionsWithActiveTurn.get(sessionKey);
		if (!activeChats || !activeChats.delete(chatUri)) {
			return;
		}

		if (activeChats.size === 0) {
			this._sessionsWithActiveTurn.delete(sessionKey);
			this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: false });
			this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
		}
	}

	/**
	 * Bridges a default-chat state transition back onto its owning session.
	 *
	 * The protocol moved turn lifecycle (and therefore the derived
	 * activity status) onto the chat channel. To preserve VS Code's
	 * single-chat behaviour we:
	 *  - track active-turn transitions (driving `RootActiveSessionsChanged`
	 *    and `hasActiveSessions`, which gate `--enable-remote-auto-shutdown`),
	 *    keyed by the owning session URI;
	 *  - mirror the chat's denormalized `status`/`activity`/`modifiedAt`
	 *    onto the session summary so the session list reflects progress;
	 *  - forward the chat's own `status` to the session `chats` catalog (via a
	 *    {@link ActionType.SessionChatUpdated}) so per-chat tabs reflect that
	 *    chat's progress, not just the aggregated session summary; and
	 *  - keep the session's `chats` catalog entry in sync.
	 */
	private _onChatStateChanged(sessionKey: string, chatUri: string, prev: ChatState, next: ChatState): void {
		// Any turn activity permanently retires the session's unused-draft
		// status, so a later truncate-to-zero cannot make it look collectable.
		if (next.turns.length > 0 || next.activeTurn) {
			this._markSessionUsed(sessionKey);
		}
		// Active turn tracking — derive from the reducer's view of state,
		// never from raw action turn-ids, so out-of-order lifecycle actions
		// can't desync the count from reality. Track active turns per chat so a
		// session stays active until ALL of its concurrent chat turns finish;
		// only notify when the session's overall active state actually flips.
		const hadActive = !!prev.activeTurn;
		const hasActive = !!next.activeTurn;
		if (hadActive !== hasActive) {
			if (hasActive) {
				let activeChats = this._sessionsWithActiveTurn.get(sessionKey);
				const wasSessionActive = !!activeChats?.size;
				if (!activeChats) {
					activeChats = new Set<string>();
					this._sessionsWithActiveTurn.set(sessionKey, activeChats);
				}
				activeChats.add(chatUri);
				if (!wasSessionActive) {
					this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: true });
					this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
				}
			} else {
				this._removeChatActiveTurn(sessionKey, chatUri);
			}
		}

		const entry = this._sessionStates.get(sessionKey);
		if (!entry) {
			return;
		}
		const sessionState = entry.state;

		// Mirror denormalized chat summary fields onto the session, aggregating
		// across the whole chat catalog per the SessionSummary rules.
		const nextEntry = chatSummaryFromState(next);
		const prevEntry = sessionState.chats.find(c => c.resource === chatUri);
		const chats = sessionState.chats.map(c => c.resource === chatUri ? nextEntry : c);

		// Forward the chat's own status to the session catalog so full
		// SessionState subscribers (the per-chat tabs) reflect this chat's
		// progress — not just the aggregated session summary. Status changes
		// at most a couple of times per turn, so this won't flood the channel.
		if (prevEntry?.status !== nextEntry.status) {
			this.dispatchServerAction(sessionKey, {
				type: ActionType.SessionChatUpdated,
				chat: chatUri,
				changes: { status: nextEntry.status, activity: nextEntry.activity },
			});
		}

		const aggregate = this._aggregateChatSummaries(chats, sessionState.defaultChat);
		const newStatus = aggregate.status !== undefined ? this._mergeSessionStatus(sessionState.status, aggregate.status) : sessionState.status;
		const statusChanged = newStatus !== sessionState.status;
		const activityChanged = aggregate.activity !== sessionState.activity;
		entry.state = {
			...sessionState,
			chats,
			...(statusChanged ? { status: newStatus } : undefined),
			...(activityChanged ? { activity: aggregate.activity } : undefined),
		};
		if (statusChanged) {
			this._onDidChangeSessionStatus.fire({ session: sessionKey, status: newStatus });
		}

		// Roll the aggregated `modifiedAt` into the catalog-only timestamp.
		const newModifiedAt = aggregate.modifiedAt !== undefined ? new Date(aggregate.modifiedAt).toISOString() : undefined;
		const modifiedAtChanged = newModifiedAt !== undefined && newModifiedAt !== entry.modifiedAt;
		if (modifiedAtChanged) {
			entry.modifiedAt = newModifiedAt;
		}

		if (statusChanged || activityChanged || modifiedAtChanged) {
			this._summaryNotifier.markDirty(sessionKey);
		}
	}

	/**
	 * Aggregates a session's chat catalog into the derived session-summary
	 * fields per the protocol rules: activity bits come from the default chat
	 * (else the most recently modified chat) with `InputNeeded`/`Error`/
	 * `InProgress` promoted whenever any chat raises them; the `activity` string
	 * follows the chat driving the resulting status; `modifiedAt` is the max
	 * across chats. Promotion precedence is `InputNeeded` > `Error` >
	 * `InProgress`, so a running peer (sub) chat surfaces as `InProgress` on the
	 * session even when the default chat is idle.
	 */
	private _aggregateChatSummaries(chats: readonly ChatSummary[], defaultChat: URI | undefined): { status?: SessionStatus; activity?: string; modifiedAt?: number } {
		if (chats.length === 0) {
			return {};
		}
		const activityMask = ~(SessionStatus.IsRead | SessionStatus.IsArchived);
		const base = (defaultChat !== undefined ? chats.find(c => c.resource === defaultChat) : undefined)
			?? chats.reduce((a, b) => Date.parse(b.modifiedAt) > Date.parse(a.modifiedAt) ? b : a);
		let status = base.status & activityMask;
		let driver = base;
		const errorChat = chats.find(c => (c.status & SessionStatus.Error) === SessionStatus.Error);
		const inputChat = chats.find(c => (c.status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded);
		// `InputNeeded` is a superset of the `InProgress` bit, so exclude
		// input-needed chats here to find one that is purely streaming.
		const inProgressChat = chats.find(c => (c.status & SessionStatus.InputNeeded) === SessionStatus.InProgress);
		if (inputChat) {
			status = SessionStatus.InputNeeded;
			driver = inputChat;
		} else if (errorChat) {
			status = SessionStatus.Error;
			driver = errorChat;
		} else if (inProgressChat) {
			status = SessionStatus.InProgress;
			driver = inProgressChat;
		}
		const modifiedAt = chats.reduce((max, c) => Math.max(max, Date.parse(c.modifiedAt)), 0);
		return { status, activity: driver.activity, modifiedAt };
	}

	/**
	 * Combines the chat's activity status bits with the session summary's
	 * own metadata flags (IsRead / IsArchived) which live in the high bits
	 * of {@link SessionStatus} and are owned by the session, not the chat.
	 */
	private _mergeSessionStatus(sessionStatus: SessionStatus, chatStatus: SessionStatus): SessionStatus {
		const metaFlags = sessionStatus & (SessionStatus.IsRead | SessionStatus.IsArchived);
		const activityBits = chatStatus & ~(SessionStatus.IsRead | SessionStatus.IsArchived);
		return activityBits | metaFlags;
	}

	/**
	 * Emit a generic progress notification on the root channel, correlated to
	 * the originating request by {@link ProgressParams.progressToken}. Routed to
	 * clients through the same {@link onDidEmitNotification} path as session
	 * notifications, so both the local (IPC proxy) and remote (WebSocket
	 * {@link ProtocolServerHandler}) renderers receive it without any
	 * transport-specific special casing. Progress for host-level work (e.g. a
	 * shared SDK download) rides the root channel rather than a per-session one.
	 */
	emitProgress(progress: Omit<ProgressParams, 'channel'>): void {
		this._onDidEmitNotification.fire({
			type: 'root/progress',
			channel: ROOT_STATE_URI,
			...progress,
		});
	}

	/**
	 * Emit an `auth/required` notification on the root channel, asking the
	 * client to obtain a fresh token and push it via `authenticate`. Rides the
	 * same {@link onDidEmitNotification} path as {@link emitProgress}, so both
	 * local (IPC proxy) and remote (WebSocket) renderers receive it. Used for
	 * host-level auth requirements (e.g. an agent whose transport flip makes a
	 * credential newly required) rather than a per-session one.
	 */
	emitAuthRequired(params: Omit<AuthRequiredParams, 'channel'>): void {
		this._onDidEmitNotification.fire({
			type: 'auth/required',
			channel: ROOT_STATE_URI,
			...params,
		});
	}

	override dispose(): void {
		for (const entry of this._chatEntries.values()) {
			entry.valid = false;
		}
		this._chatEntries.clear();
		super.dispose();
	}
}

/**
 * Resolves the authoritative {@link ChatState} for a chat URI, whether it names
 * a peer chat or a session's default chat (addressed by the session URI or the
 * default chat URI). Returns `undefined` when the chat is unknown.
 *
 * Shared by the chat completion provider and the server-side chat-attachment
 * resolver so both derive a referenced chat's turns the same way.
 */
export function resolveChatStateForUri(stateManager: AgentHostStateManager, chatUri: string): ChatState | undefined {
	const peerState = stateManager.getChatState(chatUri);
	if (peerState) {
		return peerState;
	}
	if (!isAhpChatChannel(chatUri)) {
		return stateManager.getDefaultChatState(chatUri);
	}
	if (isDefaultChatUri(chatUri)) {
		return stateManager.getDefaultChatState(parseRequiredSessionUriFromChatUri(chatUri));
	}
	return undefined;
}
