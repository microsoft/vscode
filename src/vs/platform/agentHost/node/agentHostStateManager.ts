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
import { ActionType, ActionEnvelope, ActionOrigin, INotification, IRootConfigChangedAction, SessionAction, ChatAction, RootAction, StateAction, TerminalAction, ChangesetAction, AnnotationsAction, ClientAnnotationsAction, isRootAction, isSessionAction, isChatAction, isChangesetAction, isAnnotationsAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, createChatState, createDefaultChatSummary, chatSummaryFromState, buildDefaultChatUri, parseDefaultChatUri, isAhpChatChannel, isDefaultChatUri, mergeSessionWithDefaultChat, isAhpRootChannel, SessionLifecycle, withHostBuildInfo, type Changeset, type ChangesetState, type AnnotationsState, type ChatState, type ChatSummary, type Customization, type ISessionWithDefaultChat, type RootState, type SessionConfigState, type SessionMeta, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI, ChangesetStatus, IHostBuildInfo, SessionStatus } from '../common/state/sessionState.js';
import { AgentHostTelemetryLevelConfigKey, IPermissionsValue, platformRootSchema, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { buildAnnotationsUri, isAnnotationsUri } from '../common/annotationsUri.js';
import { AgentHostChangesetStateCache, type IAgentHostChangesetStateRetentionOptions } from './agentHostChangesetStateCache.js';
import { ChangesSummary } from '../common/state/protocol/state.js';
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
 * Server-side state manager for the sessions process protocol.
 *
 * Maintains the authoritative state tree (root + per-session), applies actions
 * through pure reducers, assigns monotonic sequence numbers, and emits
 * {@link ActionEnvelope}s for subscribed clients.
 */
export class AgentHostStateManager extends Disposable {

	private _serverSeq = 0;

	private _rootState: RootState;
	private readonly _sessionStates = new Map<string, SessionState>();

	/**
	 * Authoritative per-chat conversation state, keyed by chat channel URI.
	 * The protocol moved turns/activeTurn/pending state off the session and
	 * onto a per-chat channel. VS Code currently models every session as
	 * having exactly one chat — its default chat — whose URI is derived
	 * deterministically from the session URI via {@link buildDefaultChatUri}.
	 */
	private readonly _chatStates = new Map<string, ChatState>();

	/** Expanded changeset states, separated from protocol sequencing so cache policy stays local. */
	private readonly _changesets: AgentHostChangesetStateCache;

	/**
	 * Per-channel annotation states for the `<session>/annotations` channel.
	 * Unlike changesets (server-owned), annotation actions are
	 * client-dispatchable and lazily create their state on first write.
	 */
	private readonly _annotations = new Map<string, AnnotationsState>();

	/**
	 * Sessions whose authoritative state has an active turn. Derived from
	 * `state.activeTurn` (the source of truth maintained by the session
	 * reducer) — never from raw action turn-ids — so that mismatched or
	 * out-of-order turn lifecycle actions can't desync the count from
	 * reality. Drives `RootActiveSessionsChanged` and `hasActiveSessions`,
	 * which together gate `--enable-remote-auto-shutdown`.
	 */
	private readonly _sessionsWithActiveTurn = new Set<string>();

	/** Last summary sent to clients (via sessionAdded or sessionSummaryChanged). */
	private readonly _lastNotifiedSummaries = new Map<string, SessionSummary>();

	/** Sessions whose summary changed since the last flush. */
	private readonly _dirtySummaries = new Set<string>();
	private readonly _summaryNotifyScheduler = this._register(new RunOnceScheduler(() => this._flushSummaryNotifications(), 100));

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
	}
	private readonly _log = (msg: string) => this._logService.warn(`[AgentHostStateManager] ${msg}`);

	get hasActiveSessions(): boolean {
		return this._sessionsWithActiveTurn.size > 0;
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
		const state = this._sessionStates.get(session);
		if (!state) {
			return undefined;
		}
		const chatUri = isChat ? sessionOrChat : buildDefaultChatUri(session);
		return mergeSessionWithDefaultChat(state, this._chatStates.get(chatUri));
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
		for (const state of this._sessionStates.values()) {
			// Turn activity lives on the session's default chat after the
			// multi-chat protocol move, so consult that chat's turns/activeTurn.
			const chat = this._chatStates.get(buildDefaultChatUri(state.summary.resource));
			if (state.lifecycle === SessionLifecycle.Creating && !chat?.activeTurn && (chat?.turns.length ?? 0) === 0) {
				continue;
			}
			summaries.push(state.summary);
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

		const sessionState = this._sessionStates.get(resource);
		if (!sessionState) {
			return undefined;
		}

		return {
			resource,
			state: sessionState,
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
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state = createSessionState(summary);
		this._sessionStates.set(key, state);
		this._ensureDefaultChat(key, summary);

		this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);

		if (options?.emitNotification !== false) {
			// Recording the summary in `_lastNotifiedSummaries` is what makes
			// `_flushSummaryNotifications` later emit incremental updates and
			// what makes `markSessionPersisted` a no-op. Provisional sessions
			// intentionally skip both until they are persisted.
			this._lastNotifiedSummaries.set(key, summary);
			this._onDidEmitNotification.fire({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary,
			});
		}

		return state;
	}

	/**
	 * Fire a {@link NotificationType.SessionAdded} notification for a session
	 * whose creation was deferred via `createSession({ emitNotification: false })`.
	 *
	 * Atomically writes the supplied summary into `state.summary` so
	 * subscribers reading state directly stay consistent with what was
	 * announced. No-ops for sessions that were already announced
	 * (idempotent).
	 */
	markSessionPersisted(session: URI, summary: SessionSummary): void {
		const key = session.toString();
		const state = this._sessionStates.get(key);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
			return;
		}
		// `_lastNotifiedSummaries` is set whenever a session has been announced
		// to clients (either through `createSession` or here); using it as the
		// idempotency check keeps us from firing `SessionAdded` twice for a
		// session whose creation was not deferred.
		if (this._lastNotifiedSummaries.has(key)) {
			return;
		}
		// Update the in-memory summary so subscribers calling
		// `getSessionState` see the same fields the notification carries.
		// We don't need to schedule a `SessionSummaryChanged` flush because
		// the upcoming `SessionAdded` notification carries the complete
		// summary already.
		state.summary = summary;
		this._lastNotifiedSummaries.set(key, summary);
		this._onDidEmitNotification.fire({
			type: 'root/sessionAdded',
			channel: ROOT_STATE_URI,
			summary,
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
	restoreSession(summary: SessionSummary, turns: Turn[]): SessionState {
		const key = summary.resource;
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[AgentHostStateManager] Session already exists (restore): ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state: SessionState = {
			...createSessionState(summary),
			lifecycle: SessionLifecycle.Ready,
		};
		this._sessionStates.set(key, state);
		this._ensureDefaultChat(key, summary, turns);
		this._lastNotifiedSummaries.set(key, summary);

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
	private _ensureDefaultChat(sessionKey: string, summary: SessionSummary, turns?: Turn[]): void {
		const chatUri = buildDefaultChatUri(sessionKey);
		// The default chat starts with an empty title so it inherits the session
		// title for display. It only gets its own title when renamed independently
		// (via a per-chat `SessionChatUpdated`). This keeps the session title and
		// the default chat tab title independent.
		const chatSummary: ChatSummary = { ...createDefaultChatSummary(summary, chatUri), title: '' };
		this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: turns ?? [] });
		const sessionState = this._sessionStates.get(sessionKey);
		if (sessionState) {
			// Update the session's chat catalog in place so the object
			// identity returned by `createSession`/`restoreSession` stays
			// live in the map. Callers (e.g. `AgentService.createSession`)
			// mutate the returned state directly (`state.config = …`), so
			// replacing the map entry with a fresh clone here would strand
			// those mutations on a detached object.
			sessionState.chats = [chatSummary];
			sessionState.defaultChat = chatUri;
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
	 */
	addChat(session: URI, chatUri: URI, options?: { readonly title?: string }): ChatSummary | undefined {
		const sessionState = this._sessionStates.get(session);
		if (!sessionState) {
			this._logService.warn(`[AgentHostStateManager] addChat for unknown session: ${session}`);
			return undefined;
		}
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
		if (defaultEntry && !defaultEntry.title && sessionState.summary.title) {
			this.updateChatTitle(session, defaultChatUri, sessionState.summary.title);
		}

		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(sessionState.summary, chatUri),
			title: options?.title ?? '',
			status: SessionStatus.Idle,
		};
		this._chatStates.set(chatUri, createChatState(chatSummary));
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
	 */
	restoreChat(session: URI, chatUri: URI, options: { readonly title?: string; readonly turns: Turn[] }): void {
		const sessionState = this._sessionStates.get(session);
		if (!sessionState) {
			this._logService.warn(`[AgentHostStateManager] restoreChat for unknown session: ${session}`);
			return;
		}
		if (sessionState.chats.some(c => c.resource === chatUri)) {
			return;
		}
		const chatSummary: ChatSummary = {
			...createDefaultChatSummary(sessionState.summary, chatUri),
			title: options.title ?? '',
			status: SessionStatus.Idle,
		};
		this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: options.turns });
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
		const sessionState = this._sessionStates.get(session);
		if (!sessionState || !sessionState.chats.some(c => c.resource === chatUri)) {
			return;
		}
		if (chatUri === sessionState.defaultChat || isDefaultChatUri(chatUri)) {
			this._logService.warn(`[AgentHostStateManager] refusing to remove default chat: ${chatUri}`);
			return;
		}
		this._chatStates.delete(chatUri);
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
		const state = this._sessionStates.get(session);
		if (!state) {
			return;
		}

		// Flush any pending summary notification before tearing down state so
		// that the final status (e.g. Idle) reaches clients even if the session
		// is evicted within the scheduler's debounce window.
		if (this._dirtySummaries.has(session)) {
			this._flushSummaryNotificationFor(session);
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
		for (const chat of state.chats) {
			this._chatStates.delete(chat.resource);
		}
		this._chatStates.delete(buildDefaultChatUri(session));
		this._sessionStates.delete(session);
		this._lastNotifiedSummaries.delete(session);
		this._dirtySummaries.delete(session);
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
		const wasAnnounced = this._lastNotifiedSummaries.has(session);
		// Drop any pending summary diff: the forthcoming SessionRemoved notification
		// supersedes it and we don't want to emit spurious SessionSummaryChanged
		// events just before the session disappears from the client's view.
		this._dirtySummaries.delete(session);
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
		const state = this._sessionStates.get(session);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] setSessionConfig: unknown session ${session}`);
			return;
		}
		state.config = config;
	}

	/**
	 * Seeds or replaces the session's effective customizations directly on the
	 * authoritative in-memory state. Used by create/restore flows to ensure the
	 * first snapshot already contains customizations.
	 */
	setSessionCustomizations(session: URI, customizations: readonly Customization[] | undefined): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] setSessionCustomizations: unknown session ${session}`);
			return;
		}
		state.customizations = customizations ? [...customizations] : undefined;
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
	 * Updates the aggregate `summary.changes` for a session.
	 *
	 * There is no dedicated action for this field: the value is purely
	 * informational (chip rendering on the session list), so the write
	 * piggybacks on the existing `sessionSummaryChanged` notification
	 * path. We mutate `state.summary` in place, mark the session dirty,
	 * and let {@link _flushSummaryNotificationFor} pick the new value up
	 * via its `current.changes !== lastNotified.changes` diff.
	 */
	setSessionSummaryChanges(session: URI, changes: ChangesSummary | undefined): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] setSessionSummaryChanges: unknown session ${session}`);
			return;
		}
		if (structuralEquals(state.summary.changes, changes)) {
			return;
		}

		const newState = {
			...state,
			summary: { ...state.summary, changes },
		};

		this._sessionStates.set(session, newState);

		this._dirtySummaries.add(session);
		this._summaryNotifyScheduler.schedule();
	}

	/**
	 * Replaces the catalogue entries on `state.changesets` for `session` by
	 * dispatching a {@link ActionType.SessionChangesetsChanged} action.
	 * Subscribers see the mutation in the standard session action stream —
	 * the catalogue lives on session state and is not its own subscribable
	 * resource. Aggregate `summary.changes` counts (additions / deletions /
	 * files) are propagated separately via {@link setSessionSummaryChanges}.
	 *
	 * Producers call this after each compute pass to keep the list of
	 * available changesets (with their `changeKind`) in sync so observers
	 * can render the correct entries without subscribing to each one.
	 */
	setSessionChangesets(session: URI, changesets: readonly Changeset[] | undefined): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] setSessionChangesets: unknown session ${session}`);
			return;
		}

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
		// Channel the resulting envelope is emitted on. Chat actions are
		// dispatched by producers against the owning session URI for
		// backward compatibility, but must be emitted on the chat channel
		// URI so per-chat subscribers receive them.
		let emitChannel = channel;
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
			const state = this._sessionStates.get(key);
			if (state) {
				const newState = sessionReducer(state, sessionAction, this._log);
				this._sessionStates.set(key, newState);

				// Detect summary changes for notification
				if (state.summary !== newState.summary) {
					this._dirtySummaries.add(key);
					this._summaryNotifyScheduler.schedule();
				}

				resultingState = newState;
			} else if (!isAhpChatChannel(key)) {
				this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		if (isChatAction(action)) {
			const chatAction = action as ChatAction;
			// Producers dispatch chat actions against either the session URI
			// (compat) or the chat channel URI. Resolve both so we can update
			// the chat state, bridge status to the session summary, and emit
			// on the chat channel.
			const sessionKey = isAhpChatChannel(channel) ? parseDefaultChatUri(channel) : channel;
			const chatUri = isAhpChatChannel(channel) ? channel : buildDefaultChatUri(channel);
			emitChannel = chatUri;
			const chat = this._chatStates.get(chatUri);
			if (chat && sessionKey !== undefined) {
				const newChat = chatReducer(chat, chatAction, this._log);
				this._chatStates.set(chatUri, newChat);
				this._onChatStateChanged(sessionKey, chatUri, chat, newChat);
				resultingState = newChat;
			} else {
				this._logService.warn(`[AgentHostStateManager] Action for unknown chat: ${chatUri}, type=${action.type}`);
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
			channel: emitChannel,
			action,
			serverSeq: ++this._serverSeq,
			origin,
		};

		this._logService.trace(`[AgentHostStateManager] Emitting envelope: seq=${envelope.serverSeq}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ''}`);
		this._onDidEmitEnvelope.fire(envelope);

		return resultingState;
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
	 *    onto the session summary so the session list reflects progress; and
	 *  - keep the session's `chats` catalog entry in sync.
	 */
	private _onChatStateChanged(sessionKey: string, chatUri: string, prev: ChatState, next: ChatState): void {
		// Active turn tracking — derive from the reducer's view of state,
		// never from raw action turn-ids, so out-of-order lifecycle actions
		// can't desync the count from reality.
		const hadActive = !!prev.activeTurn;
		const hasActive = !!next.activeTurn;
		if (hadActive !== hasActive) {
			if (hasActive) {
				this._sessionsWithActiveTurn.add(sessionKey);
			} else {
				this._sessionsWithActiveTurn.delete(sessionKey);
			}
			this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: hasActive });
			this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
		}

		const sessionState = this._sessionStates.get(sessionKey);
		if (!sessionState) {
			return;
		}

		// Mirror denormalized chat summary fields onto the session, aggregating
		// across the whole chat catalog per the SessionSummary rules.
		const chats = sessionState.chats.map(c => c.resource === chatUri ? chatSummaryFromState(next) : c);
		const aggregate = this._aggregateChatSummaries(chats, sessionState.defaultChat);
		const prevSummary = sessionState.summary;
		const statusChanged = aggregate.status !== undefined && this._mergeSessionStatus(prevSummary.status, aggregate.status) !== prevSummary.status;
		const activityChanged = aggregate.activity !== prevSummary.activity;
		const modifiedAtChanged = aggregate.modifiedAt !== undefined && aggregate.modifiedAt !== prevSummary.modifiedAt;
		const summaryChanged = statusChanged || activityChanged || modifiedAtChanged;
		const newSummary = summaryChanged
			? {
				...prevSummary,
				...(statusChanged ? { status: this._mergeSessionStatus(prevSummary.status, aggregate.status!) } : undefined),
				...(activityChanged ? { activity: aggregate.activity } : undefined),
				...(modifiedAtChanged ? { modifiedAt: aggregate.modifiedAt } : undefined),
			}
			: prevSummary;
		this._sessionStates.set(sessionKey, { ...sessionState, chats, summary: newSummary });
		if (summaryChanged) {
			this._dirtySummaries.add(sessionKey);
			this._summaryNotifyScheduler.schedule();
		}
	}

	/**
	 * Aggregates a session's chat catalog into the derived session-summary
	 * fields per the protocol rules: activity bits come from the default chat
	 * (else the most recently modified chat) with `InputNeeded`/`Error`
	 * promoted whenever any chat raises them; the `activity` string follows the
	 * chat driving the resulting status; `modifiedAt` is the max across chats.
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
		if (inputChat) {
			status = SessionStatus.InputNeeded;
			driver = inputChat;
		} else if (errorChat) {
			status = SessionStatus.Error;
			driver = errorChat;
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

	private _flushSummaryNotifications(): void {
		for (const session of this._dirtySummaries) {
			this._flushSummaryNotificationFor(session);
		}
		this._dirtySummaries.clear();
	}

	/**
	 * Emits a {@link NotificationType.SessionSummaryChanged} notification for
	 * `session` if its current summary differs from the last one sent to
	 * clients, then advances `_lastNotifiedSummaries` to the current summary.
	 *
	 * Does NOT remove `session` from `_dirtySummaries` — callers are
	 * responsible for that bookkeeping.
	 */
	private _flushSummaryNotificationFor(session: string): void {
		const state = this._sessionStates.get(session);
		const lastNotified = this._lastNotifiedSummaries.get(session);
		if (!state || !lastNotified || state.summary === lastNotified) {
			return;
		}

		const current = state.summary;
		const changes: Partial<SessionSummary> = {};
		if (current.title !== lastNotified.title) { changes.title = current.title; }
		if (current.status !== lastNotified.status) { changes.status = current.status; }
		if (current.activity !== lastNotified.activity) { changes.activity = current.activity; }
		if (current.modifiedAt !== lastNotified.modifiedAt) { changes.modifiedAt = current.modifiedAt; }
		if (current.project !== lastNotified.project) { changes.project = current.project; }
		if (current.model !== lastNotified.model) { changes.model = current.model; }
		if (current.changes !== lastNotified.changes) { changes.changes = current.changes; }
		if (current.workingDirectory !== lastNotified.workingDirectory) { changes.workingDirectory = current.workingDirectory; }

		this._lastNotifiedSummaries.set(session, current);

		if (Object.keys(changes).length > 0) {
			this._onDidEmitNotification.fire({
				type: 'root/sessionSummaryChanged',
				channel: ROOT_STATE_URI,
				session,
				changes,
			});
		}
	}
}
