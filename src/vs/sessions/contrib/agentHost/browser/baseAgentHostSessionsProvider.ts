/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { KNOWN_AUTO_APPROVE_VALUES, SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { NotificationType } from '../../../../platform/agentHost/common/state/protocol/notifications.js';
import { FileEdit, ModelSelection, RootConfigState, RootState, SessionState, SessionSummary, SessionStatus as ProtocolSessionStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { readSessionGitState, StateComponents, type ISessionGitState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionFileChange2, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ILogService } from '../../../../platform/log/common/log.js';
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
	readonly description: IMarkdownString | undefined;
	/** Loading observable wired to the provider's authentication-pending state. */
	readonly loading: IObservable<boolean>;
	/** Builds the session workspace from session metadata; provider-specific (icon, providerLabel, requiresWorkspaceTrust). */
	readonly buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, gitState: ISessionGitState | undefined) => ISessionWorkspace | undefined;
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
	readonly changes = observableValue<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>('changes', []);
	readonly modelId: ISettableObservable<string | undefined>;
	modelSelection: ModelSelection | undefined;
	readonly mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', undefined);
	readonly loading: IObservable<boolean>;
	readonly isArchived = observableValue('isArchived', false);
	readonly isRead = observableValue('isRead', true);
	readonly description: IObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', undefined);

	readonly mainChat: IChat;
	readonly chats: IObservable<readonly IChat[]>;
	readonly capabilities = { supportsMultipleChats: false };
	readonly deduplicationKey: string;

	readonly agentProvider: string;

	// Retained so we can rebuild `workspace` when only `_meta` changes via
	// a `SessionMetaChanged` action dispatched on session open (without a full
	// list refresh). See `_applySessionMetaFromState` / `setMeta`.
	private _project: IAgentSessionMetadata['project'];
	private _workingDirectory: URI | undefined;
	private _meta: IAgentSessionMetadata['_meta'];
	private _activity: ISettableObservable<string | undefined>;

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
		this.deduplicationKey = metadata.session.toString();
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
		this._activity = observableValue('activity', metadata.activity);
		this._project = metadata.project;
		this._workingDirectory = metadata.workingDirectory;
		this._meta = metadata._meta;
		const initialGitState = readSessionGitState(this._meta);
		const initialWorkspace = _options.buildWorkspace(this._project, this._workingDirectory, initialGitState);
		this.workspace = observableValue('workspace', initialWorkspace);
		this.loading = _options.loading;
		this.description = derived(reader => {
			const status = this.status.read(reader);
			if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
				const activity = this._activity.read(reader);
				if (activity) {
					return new MarkdownString().appendText(activity);
				}
			}

			return this._options.description;
		});

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

		transaction(tx => {
			const summary = metadata.summary;
			if (summary !== undefined && summary !== this.title.get()) {
				this.title.set(summary, tx);
				didChange = true;
			}

			if (metadata.status !== undefined) {
				const uiStatus = mapProtocolStatus(metadata.status);
				if (uiStatus !== this.status.get()) {
					this.status.set(uiStatus, tx);
					didChange = true;
				}
			}

			const modifiedTime = metadata.modifiedTime;
			if (this.updatedAt.get().getTime() !== modifiedTime) {
				this.updatedAt.set(new Date(modifiedTime), tx);
				didChange = true;
			}

			const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
			const nextLastTurnEndTime = modifiedTime ? modifiedTime : undefined;
			if (currentLastTurnEndTime !== nextLastTurnEndTime) {
				this.lastTurnEnd.set(nextLastTurnEndTime !== undefined ? new Date(nextLastTurnEndTime) : undefined, tx);
				didChange = true;
			}

			this._project = metadata.project;
			this._workingDirectory = metadata.workingDirectory;
			// Only update `_meta` when the source actually provides one. `update()`
			// is fed from SessionSummary (via `listSessions`/`sessionAdded` paths)
			// which has no `_meta` field, so an undefined value here means "not
			// included" rather than "cleared". `_meta` (e.g. git state) flows in
			// exclusively via `setMeta` from `SessionState` subscription updates.
			if (metadata._meta !== undefined) {
				this._meta = metadata._meta;
			}
			const workspace = this._options.buildWorkspace(this._project, this._workingDirectory, readSessionGitState(this._meta));
			if (agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get())) {
				this.workspace.set(workspace, tx);
				didChange = true;
			}

			if (metadata.isRead !== undefined && metadata.isRead !== this.isRead.get()) {
				this.isRead.set(metadata.isRead, tx);
				didChange = true;
			}

			if (metadata.isArchived !== undefined && metadata.isArchived !== this.isArchived.get()) {
				this.isArchived.set(metadata.isArchived, tx);
				didChange = true;
			}

			this.modelSelection = metadata.model;
			const modelId = metadata.model ? `${this.resource.scheme}:${metadata.model.id}` : undefined;
			if (modelId !== this.modelId.get()) {
				this.modelId.set(modelId, tx);
				didChange = true;
			}

			if (metadata.diffs && !diffsEqual(this.changes.get(), metadata.diffs, this._options.mapDiffUri)) {
				this.changes.set(diffsToChanges(metadata.diffs, this._options.mapDiffUri), tx);
				didChange = true;
			}

			if (this._activity.get() !== metadata.activity) {
				this._activity.set(metadata.activity, tx);
				didChange = true;
			}
		});

		return didChange;
	}

	/**
	 * Sets the activity text from a `SessionSummaryChanged` notification.
	 * Returns `true` iff the activity observable changed.
	 */
	setActivity(activity: string | undefined): boolean {
		if (this._activity.get() !== activity) {
			this._activity.set(activity, undefined);
			return true;
		}

		return false;
	}

	/**
	 * Apply a `SessionState._meta` delta (fed from `_applySessionMetaFromState`)
	 * and rebuild the workspace if the git state changed. Returns `true` iff
	 * the workspace actually changed.
	 */
	setMeta(meta: IAgentSessionMetadata['_meta']): boolean {
		this._meta = meta;
		const gitState = readSessionGitState(this._meta);
		const workspace = this._options.buildWorkspace(this._project, this._workingDirectory, gitState);
		if (agentHostSessionWorkspaceKey(workspace) === agentHostSessionWorkspaceKey(this.workspace.get())) {
			return false;
		}
		this.workspace.set(workspace, undefined);
		return true;
	}
}

// ============================================================================
// NewSession — bundles the in-flight new-session state
// ============================================================================

/**
 * Inputs needed to construct a {@link NewSession}.
 */
interface INewSessionConstructionContext {
	readonly workspace: ISessionWorkspace;
	readonly sessionType: ISessionType;
	readonly providerId: string;
	readonly icon: ThemeIcon;
	readonly resourceScheme: string;
	readonly authenticationPending: IObservable<boolean>;
	readonly logService: ILogService;
	/**
	 * Optional initial config values to seed into the new session before its
	 * first {@link NewSession.resolveConfig} round-trip. Used to forward
	 * `chat.permissions.default` into the agent host's `autoApprove` slot so
	 * the picker reflects the user's preference immediately.
	 */
	readonly initialConfigValues?: Record<string, unknown>;
}

/**
 * Bundles the at-most-one in-flight "new session" — the session being
 * composed in the new-chat view before the first message is sent.
 *
 * Encapsulates:
 *  - the `ISession` skeleton + its observables (status, modelId, loading)
 *  - the user's selected model (read by `sendAndCreateChat`)
 *  - the resolved session config + a stale-request guard
 *  - the eagerly created backend session (URI + subscription) that lets the
 *    chat handler skip its legacy `createSession`-on-first-message round-trip
 *
 * Lifecycle:
 *  - {@link eagerCreate} fires `connection.createSession` then opens a state
 *    subscription. Wire ordering matters — see the comment in the body.
 *  - {@link graduate} releases the subscription without firing
 *    `disposeSession`; called when the session successfully transitions into
 *    a real running session via `sendAndCreateChat`.
 *  - {@link Disposable.dispose}/`dispose` releases the subscription **and**
 *    fires `connection.disposeSession`; called when the user abandons the
 *    new session (workspace switch, send failure, etc.).
 */
class NewSession extends Disposable {

	readonly session: ISession;
	readonly sessionId: string;
	readonly agentProvider: string;
	readonly workspaceUri: URI;

	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _loading: ISettableObservable<boolean>;
	private _selectedModelId: string | undefined;

	/**
	 * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
	 * `undefined` indicates the most recent {@link resolveConfig} failed and no
	 * cached values are usable.
	 */
	private _config: ResolveSessionConfigResult | undefined = { schema: { type: 'object', properties: {} }, values: {} };

	/**
	 * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
	 * increments the counter and only writes its result back if its sequence
	 * is still the latest one. Bumped on dispose so any pending resolve
	 * discards itself.
	 */
	private _configRequestSeq = 0;

	/** Backend session URI, set the moment {@link eagerCreate} starts. */
	private _backendUri: URI | undefined;
	/** Connection used to create the backend session, captured for `disposeSession` on tear-down. */
	private _connection: IAgentConnection | undefined;
	/** Held state subscription. Set after the wire `createSession` resolves. */
	private _subscription: IReference<unknown> | undefined;

	private readonly _logService: ILogService;
	private readonly _providerId: string;

	constructor(ctx: INewSessionConstructionContext) {
		super();
		const workspaceUri = ctx.workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}
		this.workspaceUri = workspaceUri;
		this.agentProvider = ctx.sessionType.id;
		this._providerId = ctx.providerId;
		this._logService = ctx.logService;

		const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
		this._status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		const title = observableValue<string>(this, '');
		const updatedAt = observableValue(this, new Date());
		const changes = observableValue<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>(this, []);
		this._modelId = observableValue<string | undefined>(this, undefined);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
		const isArchived = observableValue(this, false);
		const isRead = observableValue(this, true);
		const description = observableValue<IMarkdownString | undefined>(this, undefined);
		const lastTurnEnd = observableValue<Date | undefined>(this, undefined);
		this._loading = observableValue(this, true);
		const createdAt = new Date();

		const mainChat: IChat = {
			resource, createdAt, title, updatedAt,
			status: this._status,
			changes,
			modelId: this._modelId,
			mode, isArchived, isRead, description, lastTurnEnd,
		};
		const authPending = ctx.authenticationPending;
		const loading = this._loading;
		this.session = {
			sessionId: `${ctx.providerId}:${resource.toString()}`,
			resource,
			providerId: ctx.providerId,
			sessionType: ctx.sessionType.id,
			icon: ctx.icon,
			createdAt,
			workspace: observableValue(this, ctx.workspace),
			title,
			updatedAt,
			status: this._status,
			changes,
			modelId: this._modelId,
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
		this.sessionId = this.session.sessionId;

		if (ctx.initialConfigValues) {
			this._config = { schema: { type: 'object', properties: {} }, values: { ...ctx.initialConfigValues } };
		}
	}

	// -- Picker mutations ----------------------------------------------------

	setSelectedModelId(modelId: string): void {
		this._selectedModelId = modelId;
		this._modelId.set(modelId, undefined);
	}

	getSelectedModelId(): string | undefined { return this._selectedModelId; }
	clearSelectedModelId(): void { this._selectedModelId = undefined; }

	setStatus(status: SessionStatus): void { this._status.set(status, undefined); }
	setLoading(loading: boolean): void { this._loading.set(loading, undefined); }

	// -- Config --------------------------------------------------------------

	getConfig(): ResolveSessionConfigResult | undefined { return this._config; }
	getConfigValues(): Record<string, unknown> | undefined { return this._config?.values; }

	/**
	 * Optimistically merges a single property into the cached config. Used by
	 * the picker to update local state before the next {@link resolveConfig}
	 * round-trip completes.
	 */
	setConfigValue(property: string, value: unknown): void {
		const current = this._config?.values ?? {};
		this._config = { schema: { type: 'object', properties: {} }, values: { ...current, [property]: value } };
	}

	/**
	 * Re-resolves the session config against the agent host using the
	 * currently cached values. Ignores its own response if a newer call
	 * superseded it. Returns `true` if the config was applied (i.e. this
	 * call was not stale by the time the response arrived). On failure, the
	 * cached config is cleared so {@link getConfig} returns `undefined`.
	 */
	async resolveConfig(connection: IAgentConnection): Promise<boolean> {
		const seq = ++this._configRequestSeq;
		try {
			const result = await connection.resolveSessionConfig({
				provider: this.agentProvider,
				workingDirectory: this.workspaceUri,
				config: this._config?.values,
			});
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = result;
			return true;
		} catch {
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = undefined;
			return true;
		}
	}

	getConfigCompletions(connection: IAgentConnection, property: string, query: string | undefined) {
		return connection.sessionConfigCompletions({
			provider: this.agentProvider,
			workingDirectory: this.workspaceUri,
			config: this._config?.values,
			property,
			query,
		});
	}

	// -- Backend session lifecycle -------------------------------------------

	/**
	 * Eagerly create the session on the agent host so the chat handler can
	 * skip its legacy `createSession`-on-first-message round-trip.
	 *
	 * Wire ordering matters: we must `createSession` *before* opening the
	 * subscription. Subscribing first would race the wire send — the server
	 * receives the `subscribe` before the `createSession` and rejects it as
	 * `AHP_SESSION_NOT_FOUND`, leaving the client subscription in an
	 * unrecoverable error state. The session handler would then fall back
	 * to its legacy create-and-subscribe path on the user's first send,
	 * issuing a duplicate `createSession`.
	 *
	 * If the user switches workspaces or graduates this session before the
	 * `createSession` round-trip completes, this object will have been
	 * disposed (and `_backendUri` cleared) — the bail-out check below skips
	 * opening a stale subscription.
	 *
	 * Failures are non-fatal: the legacy first-message path in
	 * `AgentHostSessionHandler._invokeAgent` re-issues `createSession` if
	 * no session state exists at send time.
	 */
	eagerCreate(connection: IAgentConnection): void {
		const backendUri = AgentSession.uri(this.agentProvider, this.session.resource.path.substring(1));
		this._backendUri = backendUri;
		this._connection = connection;

		void (async () => {
			try {
				await connection.createSession({
					provider: this.agentProvider,
					session: backendUri,
					workingDirectory: this.workspaceUri,
				});
			} catch (err) {
				this._logService.warn(`[${this._providerId}] Eager createSession failed for ${backendUri.toString()}: ${err}`);
				// Clear backend bookkeeping so a later `dispose()` doesn't
				// fire `disposeSession` for a session the agent host never
				// created. Only do this if we're still the current attempt
				// (the caller may have already overwritten these fields by
				// disposing this NewSession and constructing a new one).
				if (this._backendUri?.toString() === backendUri.toString()) {
					this._backendUri = undefined;
					this._connection = undefined;
				}
				return;
			}

			// Bail if the user switched workspaces, graduated this session,
			// or otherwise disposed it while the round-trip was in flight.
			if (this._backendUri?.toString() !== backendUri.toString()) {
				return;
			}

			// Hold a state subscription for our lifetime so the agent host's
			// empty-session GC sees a non-zero subscriber count. The session
			// handler refcounts the same subscription via `getSubscription`
			// when chat content opens, so when we release this ref on
			// graduation the wire-level refcount stays positive.
			this._subscription = connection.getSubscription(StateComponents.Session, backendUri);
		})();
	}

	/**
	 * Release the backend subscription without firing `disposeSession`.
	 * Used on the success path in `sendAndCreateChat` when the session has
	 * graduated into a real running session.
	 */
	graduate(): void {
		this._subscription?.dispose();
		this._subscription = undefined;
		this._backendUri = undefined;
		this._connection = undefined;
		this._configRequestSeq++;
	}

	override dispose(): void {
		// Bump the seq so any in-flight resolveConfig discards itself.
		this._configRequestSeq++;

		this._subscription?.dispose();
		this._subscription = undefined;

		const oldUri = this._backendUri;
		const connection = this._connection;
		this._backendUri = undefined;
		this._connection = undefined;
		if (oldUri && connection) {
			connection.disposeSession(oldUri).catch(err => {
				this._logService.warn(`[${this._providerId}] Failed to dispose eager backend session ${oldUri.toString()}: ${err}`);
			});
		}
		super.dispose();
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

	protected readonly _onDidChangeRootConfig = this._register(new Emitter<void>());
	readonly onDidChangeRootConfig = this._onDidChangeRootConfig.event;

	/** Last-known root config state (schema + values), seeded from `RootState.config`. */
	protected _rootConfig: RootConfigState | undefined;

	/** Cache of adapted sessions, keyed by raw session ID. */
	protected readonly _sessionCache = new Map<string, AgentHostSessionAdapter>();

	/**
	 * Temporary session that has been sent (first turn dispatched) but not yet
	 * committed by the backend session list. Shown in the session list until the
	 * server reports the backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	protected _pendingSession: ISession | undefined;

	/**
	 * The at-most-one in-flight new session — the session being composed in
	 * the new-chat view before the first message is sent. See
	 * {@link NewSession} for the encapsulated state and lifecycle.
	 *
	 * Held as a {@link MutableDisposable} so reassigning or clearing the
	 * field automatically disposes the previous instance, and the field is
	 * cleaned up when the provider itself is disposed.
	 */
	private readonly _newSessionRef = this._register(new MutableDisposable<NewSession>());
	protected get _newSession(): NewSession | undefined { return this._newSessionRef.value; }
	protected set _newSession(value: NewSession | undefined) { this._newSessionRef.value = value; }

	/** Full resolved config (schema + values) for running sessions, keyed by session ID. */
	protected readonly _runningSessionConfigs = new Map<string, ResolveSessionConfigResult>();

	/**
	 * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
	 * for sessions that already exist on the agent host (e.g. created in a prior
	 * window). The underlying wire subscription is reference-counted by
	 * {@link IAgentConnection.getSubscription}, so when the session handler is
	 * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
	 * issued. Each entry is released after
	 * {@link SESSION_STATE_SUBSCRIPTION_IDLE_MS} of no calls into the keep-alive
	 * helper, so the server-side refcount can drop and any idle restored session
	 * state can be evicted on the agent host. Keyed by session ID.
	 */
	protected readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, DisposableStore>());

	/**
	 * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
	 * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
	 * when the timer fires, the subscription is disposed and the wire
	 * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
	 * refcount to the agent host.
	 */
	private readonly _sessionStateIdleTimers = this._register(new DisposableMap<string, IDisposable>());

	protected _cacheInitialized = false;

	constructor(
		@IChatSessionsService protected readonly _chatSessionsService: IChatSessionsService,
		@IChatService protected readonly _chatService: IChatService,
		@IChatWidgetService protected readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService protected readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService protected readonly _baseConfigurationService: IConfigurationService,
		@ILogService protected readonly _logService: ILogService,
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

	/**
	 * Reconcile {@link _rootConfig} against {@link RootState.config}, firing
	 * {@link onDidChangeRootConfig} only when schema or values actually change.
	 */
	protected _syncRootConfigFromRootState(rootState: RootState): void {
		const next = rootState.config;
		const prev = this._rootConfig;
		if (prev === next) {
			return;
		}
		if (!next) {
			this._rootConfig = undefined;
			this._onDidChangeRootConfig.fire();
			return;
		}
		if (prev && prev.schema === next.schema && equals(prev.values, next.values)) {
			return;
		}
		this._rootConfig = next;
		this._onDidChangeRootConfig.fire();
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
		if (this._newSession?.session.resource.toString() === resource.toString()) {
			return this._newSession.session;
		}

		if (this._pendingSession?.resource.toString() === resource.toString()) {
			return this._pendingSession;
		}

		this._ensureSessionCache();
		for (const cached of this._sessionCache.values()) {
			if (cached.resource.toString() === resource.toString()) {
				// Opening a session: subscribe to its AHP state so that
				// `_meta` (e.g. lazy git state computed by the agent host)
				// flows into the cached adapter. The keep-alive helper resets
				// an idle timer so the subscription is dropped once the session
				// is no longer being touched, allowing the agent host to evict
				// idle restored state.
				this._keepSessionStateAlive(cached.sessionId);
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

		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}

		// Tear down any previous in-flight new session (workspace switch
		// or back-to-back create). The MutableDisposable setter below
		// disposes the previous instance, which fires `disposeSession`
		// against the eagerly created agent-host record so it's freed
		// immediately rather than waiting for the server-side
		// empty-session GC.
		const newSession = new NewSession({
			workspace,
			sessionType,
			providerId: this.id,
			icon: this.icon,
			resourceScheme: this.resourceSchemeForProvider(sessionType.id),
			authenticationPending: this.authenticationPending,
			logService: this._logService,
			initialConfigValues: this._initialNewSessionConfig(),
		});
		this._newSession = newSession;
		this._onDidChangeSessionConfig.fire(newSession.sessionId);

		// Kick off the initial config resolve and the eager backend session
		// in parallel. Both are non-blocking; failures are surfaced through
		// the session's loading observable.
		const connection = this.connection;
		if (connection) {
			void this._refreshNewSessionConfig(newSession);
			newSession.eagerCreate(connection);
		} else {
			newSession.setLoading(false);
		}
		return newSession.session;
	}

	/**
	 * Re-resolve the session config against the agent host and pulse
	 * {@link _onDidChangeSessionConfig}. The {@link NewSession} owns its own
	 * stale-request guard so back-to-back calls are safe.
	 */
	private async _refreshNewSessionConfig(session: NewSession): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			session.setLoading(false);
			return;
		}
		session.setLoading(true);
		const applied = await session.resolveConfig(connection);
		// Bail if a newer call superseded us — its own pulse will take over.
		if (!applied || this._newSession !== session) {
			return;
		}
		const config = session.getConfig();
		session.setLoading(config !== undefined && !isSessionConfigComplete(config));
		this._onDidChangeSessionConfig.fire(session.sessionId);
	}

	/** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
	protected _validateBeforeCreate(_sessionType: ISessionType): void { /* default: no-op */ }

	/** Localized "no agents" error message. Subclasses can override. */
	protected _noAgentsErrorMessage(): string {
		return localize('noAgents', "Agent host has not advertised any agents yet.");
	}

	/**
	 * Initial session-config values applied to a brand-new agent-host session
	 * before its schema is resolved. The user-facing `chat.permissions.default`
	 * setting seeds the `autoApprove` property so that agents which advertise
	 * the well-known auto-approve enum (`default | autoApprove | autopilot`)
	 * pick it up on their first `resolveSessionConfig` round-trip. Agents that
	 * do not advertise `autoApprove` simply ignore the unknown key.
	 *
	 * If enterprise policy disables global auto-approval
	 * (`chat.tools.global.autoApprove` policy value `false`), the seed is
	 * clamped to `default` so the agent host never starts in an elevated
	 * permission level the user is not allowed to pick.
	 */
	protected _initialNewSessionConfig(): Record<string, unknown> | undefined {
		const configured = this._baseConfigurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		if (typeof configured !== 'string' || !KNOWN_AUTO_APPROVE_VALUES.has(configured)) {
			return undefined;
		}
		const policyRestricted = this._baseConfigurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const value = policyRestricted ? 'default' : configured;
		return { [SessionConfigKey.AutoApprove]: value };
	}

	// -- Dynamic session config ----------------------------------------------

	getSessionConfig(sessionId: string): ResolveSessionConfigResult | undefined {
		// New-session config wins (during pre-creation flow). Otherwise lazily
		// subscribe to the session's state so the running picker can seed its
		// schema/values from the AHP `SessionState.config` snapshot for sessions
		// that weren't created in this window. Each query bumps the idle timer
		// so the subscription stays alive while the picker (or any other UI
		// surface) is repeatedly reading the running config.
		if (this._newSession?.sessionId === sessionId) {
			return this._newSession.getConfig();
		}
		this._keepSessionStateAlive(sessionId);
		return this._runningSessionConfigs.get(sessionId);
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		// New session (pre-creation): re-resolve the full config schema
		const newSession = this._newSession?.sessionId === sessionId ? this._newSession : undefined;
		if (newSession) {
			newSession.setConfigValue(property, value);
			this._onDidChangeSessionConfig.fire(sessionId);
			await this._refreshNewSessionConfig(newSession);
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
			if (editable) {
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
		const newSession = this._newSession?.sessionId === sessionId ? this._newSession : undefined;
		const connection = this.connection;
		if (!newSession || !connection) {
			return [];
		}
		const result = await newSession.getConfigCompletions(connection, property, query);
		return result.items;
	}

	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined {
		return this._newSession?.sessionId === sessionId ? this._newSession.getConfigValues() : undefined;
	}

	clearSessionConfig(sessionId: string): void {
		if (this._newSession?.sessionId === sessionId) {
			// Setter on the MutableDisposable handles disposal of the old value.
			this._newSession = undefined;
		}
	}

	// -- Root (agent host) Config --------------------------------------------

	getRootConfig(): RootConfigState | undefined {
		return this._rootConfig;
	}

	async setRootConfigValue(property: string, value: unknown): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}
		if (!current.schema.properties[property]) {
			return;
		}

		// Optimistically update local cache.
		this._rootConfig = {
			...current,
			values: { ...current.values, [property]: value },
		};
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: { [property]: value },
		};
		connection.dispatch(action);
	}

	async replaceRootConfig(values: Record<string, unknown>): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}

		// Filter to known properties so we don't dispatch values for keys the
		// host didn't publish a schema for.
		const nextValues: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			if (current.schema.properties[key]) {
				nextValues[key] = value;
			}
		}

		if (equals(nextValues, current.values)) {
			return;
		}

		this._rootConfig = { ...current, values: nextValues };
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: nextValues,
			replace: true,
		};
		connection.dispatch(action);
	}

	// -- Model selection ------------------------------------------------------

	setModel(sessionId: string, modelId: string): void {
		if (this._newSession?.sessionId === sessionId) {
			this._newSession.setSelectedModelId(modelId);
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

		const newSession = this._newSession;
		if (!newSession || newSession.sessionId !== chatId) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}
		const sessionResource = newSession.session.resource;
		const selectedModelId = newSession.getSelectedModelId();

		const { query, attachedContext } = options;

		const sessionType = sessionResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
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
		await this._chatSessionsService.getOrCreateChatSession(sessionResource, CancellationToken.None);
		const chatWidget = await this._chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error(`[${this.id}] Failed to open chat widget`);
		}

		// Load session model and apply selected model
		const modelRef = await this._chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({ selectedModel: { identifier: selectedModelId, metadata: languageModel } });
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

		const result = await this._chatService.sendRequest(sessionResource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
		}

		newSession.setStatus(SessionStatus.InProgress);
		newSession.clearSelectedModelId();
		const skeleton = newSession.session;
		this._pendingSession = skeleton;
		this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });

		try {
			const committedSession = await this._waitForNewSession(existingKeys);
			if (committedSession) {
				this._preserveNewSessionConfig(newSession, committedSession.sessionId);
				// Session graduated: release the eager subscription without
				// firing `disposeSession`. The session handler has already
				// acquired its own subscription (chat widget was opened
				// earlier), so the wire-level refcount stays positive.
				newSession.graduate();
				if (this._newSession === newSession) {
					this._newSession = undefined;
				}
				this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — fall through to the failure cleanup.
		} finally {
			this._pendingSession = undefined;
		}

		// On failure: drop the eager subscription without firing
		// `disposeSession`. The server-side empty-session GC will clean up
		// the provisional session if it remains; we lean on the GC rather
		// than risking a double-dispose race on transient failures.
		newSession.graduate();
		if (this._newSession === newSession) {
			this._newSession = undefined;
		}
		return skeleton;
	}

	/** Localized error message when sendAndCreateChat is invoked without a connection. Subclasses can override. */
	protected _notConnectedSendErrorMessage(): string {
		return localize('notConnectedSend', "Cannot send request: not connected to agent host.");
	}

	// -- Session config plumbing ---------------------------------------------

	/**
	 * When a session transitions from untitled (new) to committed (running),
	 * carry over the full resolved config (schema + values) so consumers like
	 * the session-settings JSONC editor can round-trip non-mutable values
	 * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
	 * behavior is still driven off the per-property `sessionMutable` flag.
	 */
	private _preserveNewSessionConfig(newSession: NewSession, committedSessionId: string): void {
		const config = newSession.getConfig();
		if (config && Object.keys(config.schema.properties).length > 0) {
			this._runningSessionConfigs.set(committedSessionId, {
				schema: { type: 'object', properties: { ...config.schema.properties } },
				values: { ...config.values },
			});
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

	// -- Lazy session-state subscription seeding -----------------------------

	/**
	 * Idle window before a lazily-created session-state subscription is
	 * released. Each call to {@link _keepSessionStateAlive} resets the timer.
	 * Long enough to absorb the open→config-picker churn while a session view
	 * is active; short enough that closed sessions release within a minute or
	 * so, allowing the agent host to evict their cached restored state.
	 */
	private static readonly SESSION_STATE_SUBSCRIPTION_IDLE_MS = 30_000;

	/**
	 * Bump the idle-release timer for `sessionId` and lazily create the
	 * underlying subscription if needed. Called from query paths
	 * ({@link getSessionByResource}, {@link getSessionConfig}) that depend on
	 * `_runningSessionConfigs` / `_meta` being in sync but cannot themselves
	 * own a subscription handle.
	 */
	private _keepSessionStateAlive(sessionId: string): void {
		this._ensureSessionStateSubscription(sessionId);
		if (!this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		this._sessionStateIdleTimers.set(
			sessionId,
			disposableTimeout(
				() => {
					this._sessionStateIdleTimers.deleteAndDispose(sessionId);
					this._sessionStateSubscriptions.deleteAndDispose(sessionId);
				},
				BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS,
			),
		);
	}

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
		store.add(ref.object.onDidChange(state => {
			this._applySessionStateUpdate(sessionId, state);
		}));
		this._sessionStateSubscriptions.set(sessionId, store);

		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._applySessionStateUpdate(sessionId, value);
		}
	}

	/**
	 * Fan-out for AHP `SessionState` snapshots: keeps both the running
	 * session config and the cached adapter's `_meta` (e.g. git state) in
	 * sync.
	 */
	private _applySessionStateUpdate(sessionId: string, state: SessionState): void {
		this._seedRunningConfigFromState(sessionId, state);
		this._applySessionMetaFromState(sessionId, state);
	}

	private _applySessionMetaFromState(sessionId: string, state: SessionState): void {
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		if (cached.setMeta(state._meta)) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
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
			activity: summary.activity,
			status: summary.status,
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
			this._sessionStateIdleTimers.deleteAndDispose(cached.sessionId);
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

		if (Object.prototype.hasOwnProperty.call(changes, 'activity') && cached.setActivity(changes.activity)) {
			didChange = true;
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
