/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ILogService } from '../../log/common/log.js';
import { TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { ActionType, ActionEnvelope, ActionOrigin, INotification, IRootConfigChangedAction, SessionAction, ChatAction, RootAction, StateAction, TerminalAction, ChangesetAction, AnnotationsAction, ClientAnnotationsAction, isRootAction, isSessionAction, isChatAction, isChangesetAction, isAnnotationsAction, type AuthRequiredParams, type ProgressParams } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, createChatState, createDefaultChatSummary, chatSummaryFromState, buildDefaultChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, isAhpChatChannel, isDefaultChatUri, mergeSessionWithDefaultChat, isAhpRootChannel, SessionLifecycle, withHostBuildInfo, type Changeset, type ChangesetState, type AnnotationsState, type ChatState, type ChatSummary, type Customization, type ISessionWithDefaultChat, type Message, type RootState, type SessionConfigState, type SessionMeta, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI, ChangesetStatus, IHostBuildInfo, SessionStatus } from '../common/state/sessionState.js';
import { AgentHostTelemetryLevelConfigKey, IPermissionsValue, platformRootSchema, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { buildAnnotationsUri, isAnnotationsUri } from '../common/annotationsUri.js';
import { AgentHostChangesetStateCache, type IAgentHostChangesetStateRetentionOptions } from './agentHostChangesetStateCache.js';
import { ChangesSummary, ChatInteractivity, type ChatOrigin } from '../common/state/protocol/state.js';
import { arrayEquals, structuralEquals } from '../../../base/common/equals.js';

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

	/** Whether `session` has already been announced to clients. */
	isAnnounced(session: string): boolean {
		return this._lastNotified.has(session);
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
		if (current.workingDirectory !== lastNotified.workingDirectory) { changes.workingDirectory = current.workingDirectory; }
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
export class AgentHostStateManager extends Disposable {

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
	 * Authoritative per-chat conversation state, keyed by chat channel URI.
	 * The protocol moved turns/activeTurn/pending state off the session and
	 * onto a per-chat channel. VS Code currently models every session as
	 * having exactly one chat — its default chat — whose URI is derived
	 * deterministically from the session URI via {@link buildDefaultChatUri}.
	 */
	private readonly _chatStates = new Map<string, ChatState>();

	/**
	 * Opaque, agent-owned `providerData` blobs keyed by peer-chat channel URI.
	 *
	 * Each entry is the verbatim token the owning agent produced for a peer
	 * chat (see {@link IAgentCreateChatResult.providerData}). The orchestrator
	 * persists it with the session and hands it back to the agent on restore so
	 * the agent can re-materialize its SDK conversation; the StateManager itself
	 * **never parses, validates, or mutates it** — it stores and returns the
	 * string as-is. The map is kept separate from the protocol-visible
	 * {@link ChatState}/{@link ChatSummary} catalog so the private blob is not
	 * streamed to clients. The default chat carries no `providerData`, so it
	 * never appears here.
	 */
	private readonly _chatProviderData = new Map<string, string>();

	/** Expanded changeset states, separated from protocol sequencing so cache policy stays local. */
	private readonly _changesets: AgentHostChangesetStateCache;

	/**
	 * Per-channel annotation states for the `<session>/annotations` channel.
	 * Unlike changesets (server-owned), annotation actions are
	 * client-dispatchable and lazily create their state on first write.
	 */
	private readonly _annotations = new Map<string, AnnotationsState>();

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

	private readonly _onDidEmitEnvelope = this._register(new Emitter<ActionEnvelope>());
	readonly onDidEmitEnvelope: Event<ActionEnvelope> = this._onDidEmitEnvelope.event;

	private readonly _onDidEmitNotification = this._register(new Emitter<INotification>());
	readonly onDidEmitNotification: Event<INotification> = this._onDidEmitNotification.event;
	private readonly _onDidChangeSessionActiveTurn = this._register(new Emitter<{ session: string; active: boolean }>());
	readonly onDidChangeSessionActiveTurn: Event<{ session: string; active: boolean }> = this._onDidChangeSessionActiveTurn.event;

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
			(session, changes) => this._onDidEmitNotification.fire({
				type: 'root/sessionSummaryChanged',
				channel: ROOT_STATE_URI,
				session,
				changes,
			}),
		));
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
		const session = isChat ? parseDefaultChatUri(sessionOrChat) : sessionOrChat;
		if (session === undefined) {
			return undefined;
		}
		const entry = this._sessionStates.get(session);
		if (!entry) {
			return undefined;
		}
		const chatUri = isChat ? sessionOrChat : buildDefaultChatUri(session);
		return mergeSessionWithDefaultChat(entry.state, this._chatStates.get(chatUri));
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
		if (state.workingDirectory !== undefined) { summary.workingDirectory = state.workingDirectory; }
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
			&& a.workingDirectory === b.workingDirectory
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
		return this._chatStates.get(buildDefaultChatUri(session));
	}

	/** Returns the authoritative {@link ChatState} for a chat channel URI. */
	getChatState(chat: URI): ChatState | undefined {
		return this._chatStates.get(chat);
	}

	/**
	 * Returns the opaque, agent-owned `providerData` blob previously recorded
	 * for a peer chat via {@link addChat} or {@link restoreChat}, or `undefined`
	 * when none was stored (e.g. the default chat, or a peer chat the agent had
	 * nothing resumable to persist for). The value is returned verbatim — the
	 * StateManager never interprets it; callers persist it with the session and
	 * hand it back to the owning agent on restore.
	 */
	getChatProviderData(chat: URI): string | undefined {
		return this._chatProviderData.get(chat);
	}

	/**
	 * Seeds the conversation contents (turns) of a session's default chat.
	 * Used by the fork flow, which materializes a new session pre-populated
	 * with a slice of the source session's turns.
	 */
	seedDefaultChatTurns(session: URI, turns: Turn[]): void {
		const chatState = this._chatStates.get(buildDefaultChatUri(session));
		if (chatState) {
			chatState.turns = turns;
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
			// Turn activity lives on the session's default chat after the
			// multi-chat protocol move, so consult that chat's turns/activeTurn.
			const chat = this._chatStates.get(buildDefaultChatUri(key));
			if (entry.state.lifecycle === SessionLifecycle.Creating && !chat?.activeTurn && (chat?.turns.length ?? 0) === 0) {
				continue;
			}
			summaries.push(this._toSummary(key, entry));
		}
		return summaries;
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
			const chatState = this._chatStates.get(resource);
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
		this._sessionStates.set(key, this._newEntry(state, summary));
		this._ensureDefaultChat(key, summary);

		this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);

		if (options?.emitNotification !== false) {
			// Announcing the summary to the notifier is what makes
			// its later flush emit incremental updates and what makes
			// `markSessionPersisted` a no-op. Provisional sessions
			// intentionally skip both until they are persisted.
			this._summaryNotifier.announce(key, summary);
			this._onDidEmitNotification.fire({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary,
			});
		}

		return state;
	}

	/** Builds the authoritative {@link ISessionEntry} for a freshly seeded state. */
	private _newEntry(state: SessionState, summary: SessionSummary): ISessionEntry {
		return { state, createdAt: summary.createdAt, modifiedAt: summary.modifiedAt, changes: summary.changes };
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
	markSessionPersisted(session: URI, summary: SessionSummary): void {
		const key = session.toString();
		const entry = this._sessionStates.get(key);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
			return;
		}
		// The notifier records a session's announced summary whenever it has
		// been surfaced to clients (either through `createSession` or here);
		// using it as the idempotency check keeps us from firing `SessionAdded`
		// twice for a session whose creation was not deferred.
		if (this._summaryNotifier.isAnnounced(key)) {
			return;
		}
		// Propagate the materialization-resolved fields so subscribers calling
		// `getSessionState` / `getSessionSummary` see the resolved working
		// directory / project. We don't need to schedule a
		// `SessionSummaryChanged` flush because the upcoming `SessionAdded`
		// notification carries the complete summary already.
		entry.state = { ...entry.state, project: summary.project, workingDirectory: summary.workingDirectory };
		entry.modifiedAt = summary.modifiedAt;
		entry.changes = summary.changes;
		const full = this._toSummary(key, entry);
		this._summaryNotifier.announce(key, full);
		this._onDidEmitNotification.fire({
			type: 'root/sessionAdded',
			channel: ROOT_STATE_URI,
			summary: full,
		});
	}

	/**
	 * Restores a session from a previous server lifetime into the state manager
	 * with pre-populated turns. The session is created in `ready` lifecycle
	 * state since it already exists on the backend.
	 *
	 * Unlike {@link createSession}, this does NOT emit a `sessionAdded`
	 * notification because the session is already known to clients via
	 * `listSessions`.
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
		this._sessionStates.set(key, this._newEntry(state, summary));
		this._ensureDefaultChat(key, summary, turns, options?.draft, options?.defaultChatTitle);
		this._summaryNotifier.announce(key, summary);

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
		this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: turns ?? [], draft });
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
	 * peer chat's opaque, agent-owned restore blob (see
	 * {@link getChatProviderData}); the StateManager never parses it. The
	 * default chat never carries `providerData`.
	 */
	addChat(session: URI, chatUri: URI, options?: { readonly title?: string; readonly turns?: Turn[]; readonly origin?: ChatOrigin; readonly providerData?: string; readonly interactivity?: ChatInteractivity }): ChatSummary | undefined {
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
		const defaultChatUri = sessionState.defaultChat ?? buildDefaultChatUri(session);
		const defaultEntry = sessionState.chats.find(c => c.resource === defaultChatUri);
		if (defaultEntry && !defaultEntry.title && sessionState.title) {
			this.updateChatTitle(session, defaultChatUri, sessionState.title);
		}

		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
			title: options?.title ?? '',
			status: SessionStatus.Idle,
			origin: options?.origin,
			interactivity: options?.interactivity,
		};
		this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: options?.turns ?? [] });
		if (options?.providerData !== undefined) {
			this._chatProviderData.set(chatUri, options.providerData);
		}
		this.dispatchServerAction(session, { type: ActionType.SessionChatAdded, summary: chatSummary });
		return chatSummary;
	}

	/**
	 * Re-registers an additional (non-default) peer chat when a session is
	 * restored from persistent storage, seeding its {@link ChatState} with the
	 * supplied turns. Unlike {@link addChat} this does not snapshot the session
	 * title onto the default chat (the default chat's persisted title is
	 * restored independently) and it seeds history. The catalog entry is added
	 * in place so the object identity returned by {@link restoreSession} stays
	 * live; no {@link ActionType.SessionChatAdded} is dispatched because restore
	 * runs before clients subscribe.
	 *
	 * When `options.providerData` is supplied it is recorded verbatim as the
	 * peer chat's opaque, agent-owned restore blob (see
	 * {@link getChatProviderData}); the StateManager never parses it.
	 */
	restoreChat(session: URI, chatUri: URI, options: { readonly title?: string; readonly turns: Turn[]; readonly draft?: Message; readonly providerData?: string }): void {
		const entry = this._sessionStates.get(session);
		if (!entry) {
			this._logService.warn(`[AgentHostStateManager] restoreChat for unknown session: ${session}`);
			return;
		}
		const sessionState = entry.state;
		if (sessionState.chats.some(c => c.resource === chatUri)) {
			return;
		}
		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
			title: options.title ?? '',
			status: SessionStatus.Idle,
		};
		this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: options.turns, draft: options.draft });
		if (options.providerData !== undefined) {
			this._chatProviderData.set(chatUri, options.providerData);
		}
		sessionState.chats = [...sessionState.chats, chatSummary];
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
		this._chatStates.delete(chatUri);
		this._chatProviderData.delete(chatUri);
		this.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: chatUri });
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
		const chatState = this._chatStates.get(chatUri);
		if (chatState) {
			this._chatStates.set(chatUri, { ...chatState, title });
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
	 * is also used as an idle-eviction (LRU) hook (see
	 * `AgentService._maybeEvictIdleSession`) and the session list view keeps a
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
			this._chatStates.delete(chat.resource);
			this._chatProviderData.delete(chat.resource);
		}
		this._chatStates.delete(buildDefaultChatUri(session));
		this._sessionStates.delete(session);
		this._summaryNotifier.remove(session);
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
		const wasAnnounced = this._summaryNotifier.isAnnounced(session);
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
		if (wasAnnounced) {
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
		this._annotations.delete(buildAnnotationsUri(session));
	}

	// ---- Turn tracking ------------------------------------------------------

	/**
	 * Registers a mapping from turnId to session URI so that incoming
	 * provider events (which carry only session URI) can be associated
	 * with the correct active turn.
	 */
	getActiveTurnId(sessionOrChat: URI): string | undefined {
		const chatUri = isAhpChatChannel(sessionOrChat) ? sessionOrChat : buildDefaultChatUri(sessionOrChat);
		return this._chatStates.get(chatUri)?.activeTurn?.id;
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
	dispatchClientAction(channel: URI, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, origin: ActionOrigin): unknown {
		return this._applyAndEmit(channel, action, origin);
	}

	// ---- Internal -----------------------------------------------------------

	private _applyAndEmit(channel: URI, action: StateAction, origin: ActionOrigin | undefined): unknown {
		let resultingState: unknown = undefined;
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
				const newState = sessionReducer(entry.state, sessionAction, this._log);
				const summaryChanged = !this._summaryFieldsEqual(entry.state, newState);
				entry.state = newState;

				// When the reducer touched a summary-relevant field, notify
				// root-channel clients of the derived-summary delta.
				if (summaryChanged) {
					this._summaryNotifier.markDirty(key);
				}

				resultingState = newState;
			} else if (!isAhpChatChannel(key)) {
				this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		if (isChatAction(action)) {
			if (!isAhpChatChannel(channel)) {
				throw new Error(`[AgentHostStateManager] Chat action dispatched to non-chat channel: ${channel}, type=${action.type}`);
			}

			const chatAction = action as ChatAction;
			const sessionKey = parseRequiredSessionUriFromChatUri(channel);
			const chat = this._chatStates.get(channel);
			if (chat && sessionKey !== undefined) {
				const newChat = chatReducer(chat, chatAction, this._log);
				this._chatStates.set(channel, newChat);
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
}
