/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { NotificationType } from '../../../../platform/agentHost/common/state/protocol/notifications.js';
import { FileEdit, ModelSelection, RootState, SessionState, SessionSummary, SessionStatus as ProtocolSessionStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { diffsEqual, diffsToChanges, mapProtocolStatus } from './agentHostDiffs.js';
import { buildMutableConfigSchema, IAgentHostSessionsProvider, resolvedConfigsEqual } from '../../../common/agentHostSessionsProvider.js';
import { agentHostSessionWorkspaceKey } from '../../../common/agentHostSessionWorkspace.js';
import { isSessionConfigComplete } from '../../../common/sessionConfig.js';
import { IChat, IGitHubInfo, ISession, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, SessionStatus, toSessionId } from '../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionChangeEvent } from '../../../services/sessions/common/sessionsProvider.js';

// ============================================================================
// AgentHostSessionAdapter — shared adapter for local and remote sessions
// ============================================================================

/**
 * Variation points the host provider supplies when building an adapter.
 * Differences between local and remote sessions (icon, description text,
 * workspace builder, optional URI mapping) flow through this options bag so
 * the adapter itself stays a single concrete class.
 */
export interface IAgentHostAdapterOptions {
	readonly icon: ThemeIcon;
	readonly description: IMarkdownString;
	/** Loading observable wired to the provider's authentication-pending state. */
	readonly loading: IObservable<boolean>;
	/** Builds the session workspace from session metadata; provider-specific (icon, providerLabel, requiresWorkspaceTrust). */
	readonly buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined) => ISessionWorkspace | undefined;
	/** Optional URI mapping for diff entries (remote uses `toAgentHostUri`; local uses identity). */
	readonly mapDiffUri?: (uri: URI) => URI;
}

/**
 * Adapts an {@link IAgentSessionMetadata} into an {@link ISession} for the
 * sessions UI. A single concrete class for both local and remote agent
 * hosts — variation flows through {@link IAgentHostAdapterOptions}.
 */
export class AgentHostSessionAdapter implements ISession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly changes = observableValue<readonly IChatSessionFileChange[]>('changes', []);
	readonly modelId: ISettableObservable<string | undefined>;
	modelSelection: ModelSelection | undefined;
	readonly mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', undefined);
	readonly loading: IObservable<boolean>;
	readonly isArchived = observableValue('isArchived', false);
	readonly isRead = observableValue('isRead', true);
	readonly description: ISettableObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', undefined);

	readonly mainChat: IChat;
	readonly chats: IObservable<readonly IChat[]>;
	readonly capabilities = { supportsMultipleChats: false };

	readonly agentProvider: string;

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
		private readonly _options: IAgentHostAdapterOptions,
	) {
		const rawId = AgentSession.id(metadata.session);
		const agentProvider = AgentSession.provider(metadata.session);
		if (!agentProvider) {
			throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
		}
		this.agentProvider = agentProvider;
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this.sessionId = toSessionId(providerId, this.resource);
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this.icon = _options.icon;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary || `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.modelSelection = metadata.model;
		this.status = observableValue<SessionStatus>('status', metadata.status !== undefined ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
		this.modelId = observableValue<string | undefined>('modelId', metadata.model ? `${resourceScheme}:${metadata.model.id}` : undefined);
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this.description = observableValue('description', _options.description);
		this.workspace = observableValue('workspace', _options.buildWorkspace(metadata.project, metadata.workingDirectory));
		this.loading = _options.loading;

		if (metadata.isRead === false) {
			this.isRead.set(false, undefined);
		}
		if (metadata.isArchived) {
			this.isArchived.set(true, undefined);
		}
		if (metadata.diffs && metadata.diffs.length > 0) {
			this.changes.set(diffsToChanges(metadata.diffs, _options.mapDiffUri), undefined);
		}

		this.mainChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.chats = constObservable([this.mainChat]);
	}

	/**
	 * Update fields from a refreshed metadata snapshot. Returns `true` iff
	 * any user-visible field changed.
	 */
	update(metadata: IAgentSessionMetadata): boolean {
		let didChange = false;

		const summary = metadata.summary;
		if (summary !== undefined && summary !== this.title.get()) {
			this.title.set(summary, undefined);
			didChange = true;
		}

		if (metadata.status !== undefined) {
			const uiStatus = mapProtocolStatus(metadata.status);
			if (uiStatus !== this.status.get()) {
				this.status.set(uiStatus, undefined);
				didChange = true;
			}
		}

		const modifiedTime = metadata.modifiedTime;
		if (this.updatedAt.get().getTime() !== modifiedTime) {
			this.updatedAt.set(new Date(modifiedTime), undefined);
			didChange = true;
		}

		const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
		const nextLastTurnEndTime = modifiedTime ? modifiedTime : undefined;
		if (currentLastTurnEndTime !== nextLastTurnEndTime) {
			this.lastTurnEnd.set(nextLastTurnEndTime !== undefined ? new Date(nextLastTurnEndTime) : undefined, undefined);
			didChange = true;
		}

		const workspace = this._options.buildWorkspace(metadata.project, metadata.workingDirectory);
		if (agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get())) {
			this.workspace.set(workspace, undefined);
			didChange = true;
		}

		if (metadata.isRead !== undefined && metadata.isRead !== this.isRead.get()) {
			this.isRead.set(metadata.isRead, undefined);
			didChange = true;
		}

		if (metadata.isArchived !== undefined && metadata.isArchived !== this.isArchived.get()) {
			this.isArchived.set(metadata.isArchived, undefined);
			didChange = true;
		}

		this.modelSelection = metadata.model;
		const modelId = metadata.model ? `${this.resource.scheme}:${metadata.model.id}` : undefined;
		if (modelId !== this.modelId.get()) {
			this.modelId.set(modelId, undefined);
			didChange = true;
		}

		if (metadata.diffs && !diffsEqual(this.changes.get(), metadata.diffs, this._options.mapDiffUri)) {
			this.changes.set(diffsToChanges(metadata.diffs, this._options.mapDiffUri), undefined);
			didChange = true;
		}

		return didChange;
	}
}

// ============================================================================
// BaseAgentHostSessionsProvider — shared base for local and remote providers
// ============================================================================

/**
 * Shared base class for the local and remote agent host sessions providers.
 *
 * Owns the structures and flows that are identical between the two:
 * the session cache, the new-session/running-session config picker state,
 * the lazy session-state subscriptions, the AHP notification/action
 * handlers, and every connection-routed method (set/get/archive/delete/
 * rename/setModel/sendAndCreateChat).
 *
 * Subclasses supply the genuine variation points: the connection
 * accessor, the authentication-pending observable, an adapter factory,
 * URI-scheme mapping for session metadata, the agent-provider lookup, and
 * the browse UI.
 */
export abstract class BaseAgentHostSessionsProvider extends Disposable implements IAgentHostSessionsProvider {

	abstract readonly id: string;
	abstract readonly label: string;
	abstract readonly icon: ThemeIcon;
	abstract readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	get sessionTypes(): readonly ISessionType[] { return this._sessionTypes; }
	protected _sessionTypes: ISessionType[] = [];

	protected readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	protected readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	protected readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	protected readonly _onDidChangeSessionConfig = this._register(new Emitter<string>());
	readonly onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;

	/** Cache of adapted sessions, keyed by raw session ID. */
	protected readonly _sessionCache = new Map<string, AgentHostSessionAdapter>();

	/**
	 * Temporary session that has been sent (first turn dispatched) but not yet
	 * committed to a real backend session. Shown in the session list until the
	 * server creates the backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	protected _pendingSession: ISession | undefined;

	protected _currentNewSession: ISession | undefined;
	protected _currentNewSessionStatus: ISettableObservable<SessionStatus> | undefined;
	protected _currentNewSessionModelId: ISettableObservable<string | undefined> | undefined;
	protected _currentNewSessionLoading: ISettableObservable<boolean> | undefined;
	protected _selectedModelId: string | undefined;

	protected readonly _newSessionWorkspaces = new Map<string, URI>();
	protected readonly _newSessionConfigs = new Map<string, ResolveSessionConfigResult>();
	protected readonly _newSessionAgentProviders = new Map<string, string>();
	protected readonly _newSessionConfigRequests = new Map<string, number>();

	/** Full resolved config (schema + values) for running sessions, keyed by session ID. */
	protected readonly _runningSessionConfigs = new Map<string, ResolveSessionConfigResult>();

	/**
	 * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
	 * for sessions that already exist on the agent host (e.g. created in a prior
	 * window). The underlying wire subscription is reference-counted by
	 * {@link IAgentConnection.getSubscription}, so when the session handler is
	 * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
	 * issued. Keyed by session ID.
	 */
	protected readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, DisposableStore>());

	protected _cacheInitialized = false;

	constructor(
		@IChatSessionsService protected readonly _chatSessionsService: IChatSessionsService,
		@IChatService protected readonly _chatService: IChatService,
		@IChatWidgetService protected readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService protected readonly _languageModelsService: ILanguageModelsService,
	) {
		super();
	}

	// -- Subclass hooks -------------------------------------------------------

	/** Current connection (always present for local; may be undefined while disconnected for remote). */
	protected abstract get connection(): IAgentConnection | undefined;

	/** Provider-level authentication-pending observable used to derive `loading` for sessions. */
	protected abstract get authenticationPending(): IObservable<boolean>;

	/**
	 * Subclass-specific portion of the adapter options. Base fills in
	 * the bits that are uniform across hosts (`icon`, `loading`,
	 * `mapDiffUri`) from the corresponding hooks.
	 */
	protected abstract _adapterOptions(): Pick<IAgentHostAdapterOptions, 'description' | 'buildWorkspace'>;

	/** Build an adapter for the given metadata. */
	protected createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		const provider = AgentSession.provider(meta.session);
		if (!provider) {
			throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
		}
		return new AgentHostSessionAdapter(meta, this.id, this.resourceSchemeForProvider(provider), provider, {
			icon: this.icon,
			loading: this.authenticationPending,
			mapDiffUri: this._diffUriMapper(),
			...this._adapterOptions(),
		});
	}

	/**
	 * Computes the URI resource scheme used to route session URIs to this
	 * provider's content provider for a given agent provider name. Local
	 * uses `agent-host-${provider}`; remote uses a per-connection scheme.
	 *
	 * The resource scheme is host-specific and exists purely for content
	 * provider routing. The logical {@link ISession.sessionType} is the
	 * agent provider name itself, so the same agent (e.g. `copilotcli`)
	 * appears under one shared session type across hosts.
	 */
	protected abstract resourceSchemeForProvider(provider: string): string;

	/** Format the human-readable label for a session type entry (e.g. `Copilot [Local]`). */
	protected abstract _formatSessionTypeLabel(agentLabel: string): string;

	/**
	 * Reconcile {@link _sessionTypes} against the agents advertised by the
	 * host's root state, firing {@link onDidChangeSessionTypes} only if the
	 * id/label set actually changed.
	 */
	protected _syncSessionTypesFromRootState(rootState: RootState): void {
		const next = rootState.agents.map((agent): ISessionType => ({
			id: agent.provider,
			label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
			icon: this.icon,
		}));

		const prev = this._sessionTypes;
		if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label)) {
			return;
		}
		this._sessionTypes = next;
		this._onDidChangeSessionTypes.fire();
	}

	abstract resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined;

	/** Optional event fired when the underlying connection is lost; used to short-circuit `_waitForNewSession`. */
	protected get onConnectionLost(): Event<void> { return Event.None; }

	/** Maps a working-directory URI from the session summary to a local URI. Default identity; remote overrides to `toAgentHostUri`. */
	protected mapWorkingDirectoryUri(uri: URI): URI { return uri; }

	/** Maps a project URI from the session summary to a local URI. Default identity; remote overrides for `file:` paths. */
	protected mapProjectUri(uri: URI): URI { return uri; }

	// -- Session listing ------------------------------------------------------

	getSessionTypes(_repositoryUri: URI): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		const sessions: ISession[] = [...this._sessionCache.values()];
		if (this._pendingSession) {
			sessions.push(this._pendingSession);
		}
		return sessions;
	}

	getSessionByResource(resource: URI): ISession | undefined {
		if (this._currentNewSession?.resource.toString() === resource.toString()) {
			return this._currentNewSession;
		}

		if (this._pendingSession?.resource.toString() === resource.toString()) {
			return this._pendingSession;
		}

		this._ensureSessionCache();
		for (const cached of this._sessionCache.values()) {
			if (cached.resource.toString() === resource.toString()) {
				return cached;
			}
		}

		return undefined;
	}

	// -- Session lifecycle ----------------------------------------------------

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		if (this._currentNewSession) {
			this._clearNewSessionConfig(this._currentNewSession.sessionId);
		}
		this._currentNewSession = undefined;
		this._selectedModelId = undefined;
		this._currentNewSessionModelId = undefined;
		this._currentNewSessionLoading = undefined;
		this._currentNewSessionStatus = undefined;

		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}
		return this._createNewSessionForType(workspace, sessionType);
	}

	/** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
	protected _validateBeforeCreate(_sessionType: ISessionType): void { /* default: no-op */ }

	/** Localized "no agents" error message. Subclasses can override. */
	protected _noAgentsErrorMessage(): string {
		return localize('noAgents', "Agent host has not advertised any agents yet.");
	}

	private _createNewSessionForType(workspace: ISessionWorkspace, sessionType: ISessionType): ISession {
		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		const resourceScheme = this.resourceSchemeForProvider(sessionType.id);
		const resource = URI.from({ scheme: resourceScheme, path: `/untitled-${generateUuid()}` });
		const status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		const title = observableValue(this, '');
		const updatedAt = observableValue(this, new Date());
		const changes = observableValue<readonly IChatSessionFileChange[]>(this, []);
		const modelId = observableValue<string | undefined>(this, undefined);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
		const isArchived = observableValue(this, false);
		const isRead = observableValue(this, true);
		const description = observableValue<IMarkdownString | undefined>(this, undefined);
		const lastTurnEnd = observableValue<Date | undefined>(this, undefined);
		const loading = observableValue(this, true);
		const createdAt = new Date();

		const mainChat: IChat = {
			resource, createdAt, title, updatedAt, status,
			changes, modelId, mode, isArchived, isRead, description, lastTurnEnd,
		};

		const authPending = this.authenticationPending;
		const session: ISession = {
			sessionId: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: sessionType.id,
			icon: this.icon,
			createdAt,
			workspace: observableValue(this, workspace),
			title,
			updatedAt,
			status,
			changes,
			modelId,
			mode,
			loading: derived(reader => loading.read(reader) || authPending.read(reader)),
			isArchived,
			isRead,
			description,
			lastTurnEnd,
			gitHubInfo: observableValue(this, undefined),
			mainChat,
			chats: constObservable([mainChat]),
			capabilities: { supportsMultipleChats: false },
		};
		this._currentNewSession = session;
		this._currentNewSessionStatus = status;
		this._currentNewSessionModelId = modelId;
		this._currentNewSessionLoading = loading;
		const agentProvider = sessionType.id;
		this._newSessionWorkspaces.set(session.sessionId, workspaceUri);
		this._newSessionAgentProviders.set(session.sessionId, agentProvider);
		this._newSessionConfigs.set(session.sessionId, { schema: { type: 'object', properties: {} }, values: {} });
		this._onDidChangeSessionConfig.fire(session.sessionId);
		this._resolveSessionConfig(session.sessionId, agentProvider, workspaceUri, undefined);
		return session;
	}

	// -- Dynamic session config ----------------------------------------------

	getSessionConfig(sessionId: string): ResolveSessionConfigResult | undefined {
		// New-session config wins (during pre-creation flow). Otherwise lazily
		// subscribe to the session's state so the running picker can seed its
		// schema/values from the AHP `SessionState.config` snapshot for sessions
		// that weren't created in this window.
		const newSessionConfig = this._newSessionConfigs.get(sessionId);
		if (newSessionConfig) {
			return newSessionConfig;
		}
		this._ensureSessionStateSubscription(sessionId);
		return this._runningSessionConfigs.get(sessionId);
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		// New session (pre-creation): re-resolve the full config schema
		const workingDirectory = this._newSessionWorkspaces.get(sessionId);
		if (workingDirectory) {
			const current = this._newSessionConfigs.get(sessionId)?.values ?? {};
			this._newSessionConfigs.set(sessionId, { schema: { type: 'object', properties: {} }, values: { ...current, [property]: value } });
			this._setNewSessionLoading(sessionId, true);
			this._onDidChangeSessionConfig.fire(sessionId);
			await this._resolveSessionConfig(sessionId, this._getAgentProviderForSession(sessionId), workingDirectory, { ...current, [property]: value });
			return;
		}

		// Running session: dispatch SessionConfigChanged for sessionMutable properties
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}
		const schema = runningConfig.schema.properties[property];
		if (!schema?.sessionMutable) {
			return;
		}

		// Update local cache optimistically
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: { ...runningConfig.values, [property]: value },
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const action = { type: ActionType.SessionConfigChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), config: { [property]: value } };
			connection.dispatch(action);
		}
	}

	async replaceSessionConfig(sessionId: string, values: Record<string, unknown>): Promise<void> {
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}

		// Build the outgoing payload: for every known property, prefer the
		// caller-supplied value if the property is user-editable
		// (`sessionMutable: true` and not `readOnly`), otherwise force the
		// current value through. This guarantees replace semantics never
		// alter a non-editable property even if the caller included it.
		const nextValues: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
			const editable = schema.sessionMutable === true && schema.readOnly !== true;
			if (editable && Object.hasOwn(values, key)) {
				nextValues[key] = values[key];
			} else if (Object.hasOwn(runningConfig.values, key)) {
				nextValues[key] = runningConfig.values[key];
			}
		}
		// Unknown keys from the caller are ignored (no schema entry).

		// Skip the dispatch entirely when nothing meaningful changes.
		if (equals(nextValues, runningConfig.values)) {
			return;
		}

		// Update local cache optimistically (full replace).
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host with replace semantics.
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const action = {
				type: ActionType.SessionConfigChanged as const,
				session: AgentSession.uri(cached.agentProvider, rawId).toString(),
				config: nextValues,
				replace: true,
			};
			connection.dispatch(action);
		}
	}

	async getSessionConfigCompletions(sessionId: string, property: string, query?: string) {
		const workingDirectory = this._newSessionWorkspaces.get(sessionId);
		const connection = this.connection;
		if (!workingDirectory || !connection) {
			return [];
		}
		const result = await connection.sessionConfigCompletions({
			provider: this._getAgentProviderForSession(sessionId),
			workingDirectory,
			config: this._newSessionConfigs.get(sessionId)?.values,
			property,
			query,
		});
		return result.items;
	}

	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined {
		return this._newSessionConfigs.get(sessionId)?.values;
	}

	clearSessionConfig(sessionId: string): void {
		this._clearNewSessionConfig(sessionId);
	}

	// -- Model selection ------------------------------------------------------

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession?.sessionId === sessionId) {
			this._selectedModelId = modelId;
			this._currentNewSessionModelId?.set(modelId, undefined);
			return;
		}

		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.modelId.set(modelId, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const resourceScheme = cached.resource.scheme;
			const rawModelId = modelId.startsWith(`${resourceScheme}:`) ? modelId.substring(resourceScheme.length + 1) : modelId;
			const model = cached.modelSelection?.id === rawModelId ? cached.modelSelection : { id: rawModelId };
			const action = { type: ActionType.SessionModelChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), model };
			connection.dispatch(action);
		}
	}

	// -- Session actions ------------------------------------------------------

	async archiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(true, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const action = { type: ActionType.SessionIsArchivedChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isArchived: true };
				connection.dispatch(action);
			}
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(false, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const action = { type: ActionType.SessionIsArchivedChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isArchived: false };
				connection.dispatch(action);
			}
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			await connection.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
			this._sessionCache.delete(rawId);
			this._runningSessionConfigs.delete(sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	async renameChat(sessionId: string, _chatUri: URI, title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const action = { type: ActionType.SessionTitleChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), title };
			connection.dispatch(action);
		}
	}

	async deleteChat(_sessionId: string, _chatUri: URI): Promise<void> {
		// Agent host sessions don't support deleting individual chats
	}

	addChat(_sessionId: string): IChat {
		throw new Error('Multiple chats per session is not supported for agent host sessions');
	}

	async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
		throw new Error('Multiple chats per session is not supported for agent host sessions');
	}

	async sendAndCreateChat(chatId: string, options: ISendRequestOptions): Promise<ISession> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}

		const session = this._currentNewSession;
		if (!session || session.sessionId !== chatId) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		const { query, attachedContext } = options;

		const sessionType = session.resource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: this._selectedModelId,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			agentHostSessionConfig: this.getCreateSessionConfig(chatId),
		};

		// Open chat widget — getOrCreateChatSession will wait for the session
		// handler to become available via canResolveChatSession internally.
		await this._chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
		const chatWidget = await this._chatWidgetService.openSession(session.resource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error(`[${this.id}] Failed to open chat widget`);
		}

		// Load session model and apply selected model
		const modelRef = await this._chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (this._selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(this._selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({ selectedModel: { identifier: this._selectedModelId, metadata: languageModel } });
				}
			}
			modelRef.dispose();
		}

		// Capture existing session keys before sending so we can detect the new
		// backend session. Must be captured before sendRequest because the
		// backend session may be created during the send and arrive via
		// notification before sendRequest resolves.
		this._ensureSessionCache();
		const existingKeys = new Set(this._sessionCache.keys());

		const result = await this._chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
		}

		this._currentNewSessionStatus?.set(SessionStatus.InProgress, undefined);
		const newSession = session;
		this._pendingSession = newSession;
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

		this._selectedModelId = undefined;
		this._currentNewSessionStatus = undefined;
		this._currentNewSessionModelId = undefined;
		this._currentNewSessionLoading = undefined;

		try {
			const committedSession = await this._waitForNewSession(existingKeys);
			if (committedSession) {
				this._preserveNewSessionConfig(chatId, committedSession.sessionId);
				this._currentNewSession = undefined;
				this._currentNewSessionModelId = undefined;
				this._currentNewSessionLoading = undefined;
				this._clearNewSessionConfig(chatId);
				this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — clean up
		} finally {
			this._pendingSession = undefined;
		}

		this._currentNewSession = undefined;
		this._currentNewSessionModelId = undefined;
		this._currentNewSessionLoading = undefined;
		this._clearNewSessionConfig(chatId);
		return newSession;
	}

	/** Localized error message when sendAndCreateChat is invoked without a connection. Subclasses can override. */
	protected _notConnectedSendErrorMessage(): string {
		return localize('notConnectedSend', "Cannot send request: not connected to agent host.");
	}

	// -- Session config plumbing ---------------------------------------------

	private async _resolveSessionConfig(sessionId: string, agentProvider: string, workingDirectory: URI, config: Record<string, unknown> | undefined): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			this._setNewSessionLoading(sessionId, false);
			return;
		}
		const request = (this._newSessionConfigRequests.get(sessionId) ?? 0) + 1;
		this._newSessionConfigRequests.set(sessionId, request);
		try {
			const result = await connection.resolveSessionConfig({
				provider: agentProvider,
				workingDirectory,
				config,
			});
			if (this._newSessionConfigRequests.get(sessionId) !== request) {
				return;
			}
			this._newSessionConfigs.set(sessionId, result);
			this._setNewSessionLoading(sessionId, !isSessionConfigComplete(result));
		} catch {
			if (this._newSessionConfigRequests.get(sessionId) !== request) {
				return;
			}
			this._newSessionConfigs.delete(sessionId);
			this._setNewSessionLoading(sessionId, false);
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	protected _clearNewSessionConfig(sessionId: string): void {
		this._newSessionWorkspaces.delete(sessionId);
		this._newSessionConfigs.delete(sessionId);
		this._newSessionAgentProviders.delete(sessionId);
		this._newSessionConfigRequests.delete(sessionId);
	}

	/**
	 * When a session transitions from untitled (new) to committed (running),
	 * carry over the full resolved config (schema + values) so consumers like
	 * the session-settings JSONC editor can round-trip non-mutable values
	 * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
	 * behavior is still driven off the per-property `sessionMutable` flag.
	 */
	private _preserveNewSessionConfig(oldSessionId: string, newSessionId: string): void {
		const config = this._newSessionConfigs.get(oldSessionId);
		if (!config) {
			return;
		}
		if (Object.keys(config.schema.properties).length > 0) {
			this._runningSessionConfigs.set(newSessionId, {
				schema: { type: 'object', properties: { ...config.schema.properties } },
				values: { ...config.values },
			});
		}
	}

	private _setNewSessionLoading(sessionId: string, loading: boolean): void {
		if (this._currentNewSession?.sessionId === sessionId) {
			this._currentNewSessionLoading?.set(loading, undefined);
		}
	}

	protected _rawIdFromChatId(chatId: string): string | undefined {
		const prefix = `${this.id}:`;
		const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
		try {
			return URI.parse(resourceStr).path.substring(1) || undefined;
		} catch {
			return undefined;
		}
	}

	private _getAgentProviderForSession(sessionId: string): string {
		const provider = this._newSessionAgentProviders.get(sessionId);
		if (!provider) {
			throw new Error(`No agent provider tracked for new session: ${sessionId}`);
		}
		return provider;
	}

	// -- Lazy session-state subscription seeding -----------------------------

	/**
	 * Lazily acquire a session-state subscription for `sessionId` so that
	 * `_runningSessionConfigs` is seeded from the AHP `SessionState.config`
	 * snapshot. Safe to call repeatedly — no-op once a subscription exists.
	 *
	 * The subscription is reference-counted by {@link IAgentConnection.getSubscription},
	 * so when the session handler is also subscribed (chat content open) this
	 * shares the existing wire subscription rather than opening a new one.
	 */
	private _ensureSessionStateSubscription(sessionId: string): void {
		if (this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
		const ref = connection.getSubscription(StateComponents.Session, sessionUri);
		const store = new DisposableStore();
		store.add(ref);
		store.add(ref.object.onDidChange(state => this._seedRunningConfigFromState(sessionId, state)));
		this._sessionStateSubscriptions.set(sessionId, store);

		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._seedRunningConfigFromState(sessionId, value);
		}
	}

	/**
	 * Seed {@link _runningSessionConfigs} from the AHP `SessionState.config`
	 * snapshot. Keeps the full schema + values (including non-mutable ones)
	 * so consumers like the JSONC settings editor can round-trip all values
	 * through a replace dispatch. No-op if structurally equal to avoid spurious
	 * `onDidChangeSessionConfig` fires.
	 */
	private _seedRunningConfigFromState(sessionId: string, state: SessionState): void {
		const stateConfig = state.config;
		if (!stateConfig) {
			return;
		}
		if (Object.keys(stateConfig.schema.properties).length === 0) {
			return;
		}
		const seeded: ResolveSessionConfigResult = {
			schema: { type: 'object', properties: { ...stateConfig.schema.properties } },
			values: { ...stateConfig.values },
		};
		const existing = this._runningSessionConfigs.get(sessionId);
		if (existing && resolvedConfigsEqual(existing, seeded)) {
			return;
		}
		this._runningSessionConfigs.set(sessionId, seeded);
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	// -- Session cache management --------------------------------------------

	protected _ensureSessionCache(): void {
		if (this._cacheInitialized) {
			return;
		}
		this._cacheInitialized = true;
		this._refreshSessions();
	}

	protected async _refreshSessions(): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		try {
			const sessions = await connection.listSessions();
			const currentKeys = new Set<string>();
			const added: ISession[] = [];
			const changed: ISession[] = [];

			for (const meta of sessions) {
				const rawId = AgentSession.id(meta.session);
				currentKeys.add(rawId);

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					if (existing.update(meta)) {
						changed.push(existing);
					}
				} else {
					const cached = this.createAdapter(meta);
					this._sessionCache.set(rawId, cached);
					added.push(cached);
				}
			}

			const removed: ISession[] = [];
			for (const [key, cached] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					this._sessionCache.delete(key);
					this._runningSessionConfigs.delete(cached.sessionId);
					removed.push(cached);
				}
			}

			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				this._onDidChangeSessions.fire({ added, removed, changed });
			}
		} catch {
			// Connection may not be ready yet
		}
	}

	private async _waitForNewSession(existingKeys: Set<string>): Promise<ISession | undefined> {
		await this._refreshSessions();
		for (const [key, cached] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return cached;
			}
		}

		const waitDisposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<ISession | undefined>((resolve) => {
				waitDisposables.add(this._onDidChangeSessions.event(e => {
					const newSession = e.added.find(s => {
						const rawId = s.resource.path.substring(1);
						return !existingKeys.has(rawId);
					});
					if (newSession) {
						resolve(newSession);
					}
				}));
				waitDisposables.add(this.onConnectionLost(() => resolve(undefined)));
			});
			return await raceTimeout(sessionPromise, 30_000);
		} finally {
			waitDisposables.dispose();
		}
	}

	// -- AHP notification / action handlers ----------------------------------

	/**
	 * Wire AHP notification and action listeners on the given connection.
	 * Subclasses call this from their constructor (local) or `setConnection`
	 * (remote), passing a store that bounds the listeners' lifetime.
	 */
	protected _attachConnectionListeners(connection: IAgentConnection, store: DisposableStore): void {
		store.add(connection.onDidNotification(n => {
			if (n.type === NotificationType.SessionAdded) {
				this._handleSessionAdded(n.summary);
			} else if (n.type === NotificationType.SessionRemoved) {
				this._handleSessionRemoved(n.session);
			} else if (n.type === NotificationType.SessionSummaryChanged) {
				this._handleSessionSummaryChanged(n.session, n.changes);
			}
		}));

		store.add(connection.onDidAction(e => {
			if (e.action.type === ActionType.SessionTurnComplete && isSessionAction(e.action)) {
				this._refreshSessions();
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.action.session, e.action.title);
			} else if (e.action.type === ActionType.SessionModelChanged && isSessionAction(e.action)) {
				this._handleModelChanged(e.action.session, e.action.model);
			} else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
				this._handleIsReadChanged(e.action.session, e.action.isRead);
			} else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
				this._handleIsArchivedChanged(e.action.session, e.action.isArchived);
			} else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
				this._handleConfigChanged(e.action.session, e.action.config, e.action.replace === true);
			} else if (e.action.type === ActionType.SessionDiffsChanged && isSessionAction(e.action)) {
				this._handleDiffsChanged(e.action.session, e.action.diffs);
			}
		}));
	}

	private _handleSessionAdded(summary: SessionSummary): void {
		const sessionUri = URI.parse(summary.resource);
		const rawId = AgentSession.id(sessionUri);
		if (this._sessionCache.has(rawId)) {
			return;
		}

		const workingDir = typeof summary.workingDirectory === 'string'
			? this.mapWorkingDirectoryUri(URI.parse(summary.workingDirectory))
			: undefined;
		const meta: IAgentSessionMetadata = {
			session: sessionUri,
			startTime: summary.createdAt,
			modifiedTime: summary.modifiedAt,
			summary: summary.title,
			...(summary.project ? { project: { uri: this.mapProjectUri(URI.parse(summary.project.uri)), displayName: summary.project.displayName } } : {}),
			model: summary.model,
			workingDirectory: workingDir,
			isRead: !!(summary.status & ProtocolSessionStatus.IsRead),
			isArchived: !!(summary.status & ProtocolSessionStatus.IsArchived),
		};
		const cached = this.createAdapter(meta);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			this._sessionCache.delete(rawId);
			this._runningSessionConfigs.delete(cached.sessionId);
			this._sessionStateSubscriptions.deleteAndDispose(cached.sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleModelChanged(session: string, model: ModelSelection): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.modelSelection = model;
		}
		const modelId = cached ? `${cached.resource.scheme}:${model.id}` : undefined;
		if (cached && cached.modelId.get() !== modelId) {
			cached.modelId.set(modelId, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsReadChanged(session: string, isRead: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isRead.set(isRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsArchivedChanged(session: string, isArchived: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(isArchived, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleDiffsChanged(session: string, diffs: FileEdit[]): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.changes.set(diffsToChanges(diffs, this._diffUriMapper()), undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleSessionSummaryChanged(session: string, changes: Partial<SessionSummary>): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}

		let didChange = false;

		if (changes.status !== undefined) {
			const uiStatus = mapProtocolStatus(changes.status);
			if (uiStatus !== cached.status.get()) {
				cached.status.set(uiStatus, undefined);
				didChange = true;
			}

			const isRead = !!(changes.status & ProtocolSessionStatus.IsRead);
			if (isRead !== cached.isRead.get()) {
				cached.isRead.set(isRead, undefined);
				didChange = true;
			}

			const isArchived = !!(changes.status & ProtocolSessionStatus.IsArchived);
			if (isArchived !== cached.isArchived.get()) {
				cached.isArchived.set(isArchived, undefined);
				didChange = true;
			}
		}

		if (changes.title !== undefined && changes.title !== cached.title.get()) {
			cached.title.set(changes.title, undefined);
			didChange = true;
		}

		if (changes.diffs !== undefined) {
			const mapUri = this._diffUriMapper();
			if (!diffsEqual(cached.changes.get(), changes.diffs, mapUri)) {
				cached.changes.set(diffsToChanges(changes.diffs, mapUri), undefined);
				didChange = true;
			}
		}

		if (didChange) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleConfigChanged(session: string, config: Record<string, unknown>, replace: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionId = cached.sessionId;
		const existing = this._runningSessionConfigs.get(sessionId);
		if (existing) {
			this._runningSessionConfigs.set(sessionId, {
				...existing,
				values: replace ? { ...config } : { ...existing.values, ...config },
			});
		} else {
			// Session was restored (e.g. after reload) — create a minimal
			// config entry from the changed values so the picker can render.
			// `replace` vs merge is moot here (no existing values to merge with).
			this._runningSessionConfigs.set(sessionId, {
				schema: { type: 'object', properties: buildMutableConfigSchema(config) },
				values: config,
			});
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	/**
	 * Optional URI mapper used when applying diff changes. Subclasses
	 * override to translate remote diff URIs into agent-host URIs.
	 */
	protected _diffUriMapper(): ((uri: URI) => URI) | undefined { return undefined; }
}
