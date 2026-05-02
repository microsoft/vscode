/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { equals as objectEquals } from '../../../base/common/objects.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, IAgent, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, ActionEnvelope, INotification, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import type { CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ResponsePartKind, SessionStatus, ToolCallStatus, ToolResultContentType, parseSubagentSessionUri, readSessionGitState, withSessionGitState, type SessionConfigState, type ISessionFileDiff, type SessionSummary, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { IProductService } from '../../product/common/productService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostTerminalManager, type IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from './copilot/fileEditTracker.js';
import { IGitBlobUriFields, parseGitBlobUri } from './gitDiffContent.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService } from './agentHostGitService.js';

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	/** Protocol: fires when state is mutated by an action. */
	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	/** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	/** Authoritative state manager for the sessions process protocol. */
	private readonly _stateManager: AgentHostStateManager;

	/** Exposes the state manager for co-hosting a WebSocket protocol server. */
	get stateManager(): AgentHostStateManager { return this._stateManager; }

	/** Exposes the configuration service so agent providers can share root config plumbing. */
	get configurationService(): IAgentConfigurationService { return this._configurationService; }

	/** Registered providers keyed by their {@link AgentProvider} id. */
	private readonly _providers = new Map<AgentProvider, IAgent>();
	/** Maps each active session URI (toString) to its owning provider. */
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
	/** Subscriptions to provider progress events; cleared when providers change. */
	private readonly _providerSubscriptions = this._register(new DisposableStore());
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;
	/** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
	private readonly _agents = observableValue<readonly IAgent[]>('agents', []);
	/** Shared side-effect handler for action dispatch and session lifecycle. */
	private readonly _sideEffects: AgentSideEffects;
	/** Manages PTY-backed terminals for the agent host protocol. */
	private readonly _terminalManager: AgentHostTerminalManager;
	private readonly _configurationService: IAgentConfigurationService;

	/**
	 * Authoritative server-side per-resource subscription refcount, keyed by
	 * resource URI string and valued by the set of subscribed protocol
	 * client IDs. Populated by {@link subscribe} (or {@link addSubscriber}
	 * for handshake fast-paths) and drained by {@link unsubscribe}. When a
	 * resource's set becomes empty, the resource is dropped from the map and
	 * {@link _maybeEvictIdleSession} is invoked to release any cached state
	 * for it.
	 */
	private readonly _resourceSubscribers = new ResourceMap<Set<string>>();

	/** Exposes the terminal manager for use by agent providers. */
	get terminalManager(): IAgentHostTerminalManager { return this._terminalManager; }

	constructor(
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _productService: IProductService,
		private readonly _gitService: IAgentHostGitService,
		private readonly _rootConfigResource?: URI,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._stateManager = this._register(new AgentHostStateManager(_logService));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));

		// Build a local instantiation scope so downstream components can
		// consume {@link IAgentConfigurationService} (and later {@link ILogService})
		// via DI rather than being plumbed plain-class references.
		const configurationService: IAgentConfigurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService, this._rootConfigResource));
		this._configurationService = configurationService;
		const services = new ServiceCollection(
			[ILogService, this._logService],
			[IAgentConfigurationService, configurationService],
			[IAgentHostGitService, this._gitService],
		);
		const instantiationService = this._register(new InstantiationService(services, /*strict*/ true));

		this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			agents: this._agents,
			onTurnComplete: session => {
				const workingDirStr = this._stateManager.getSessionState(session)?.summary.workingDirectory;
				this._attachGitState(URI.parse(session), workingDirStr ? URI.parse(workingDirStr) : undefined);
			},
		}));

		// Terminal management — the terminal manager listens to the state
		// manager's action stream and dispatches PTY output back through it.
		this._terminalManager = this._register(new AgentHostTerminalManager(this._stateManager, this._logService, this._productService));
	}

	// ---- provider registration ----------------------------------------------

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
		if (!this._defaultProvider) {
			this._defaultProvider = provider.id;
		}

		// Update root state with current agents list
		this._updateAgents();
	}

	// ---- auth ---------------------------------------------------------------

	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		this._logService.trace(`[AgentService] authenticate called: resource=${params.resource}`);
		// Multiple providers may share the same protected resource (e.g.
		// both Copilot CLI and Claude consume the GitHub Copilot token).
		// Fan out to every matching provider in parallel; the request is
		// considered authenticated if at least one accepts. Provider
		// failures are isolated — one provider rejecting (e.g. proxy
		// server bind failure) MUST NOT prevent another provider from
		// accepting the same token.
		const matching = [...this._providers.values()].filter(
			p => p.getProtectedResources().some(r => r.resource === params.resource),
		);
		const settled = await Promise.allSettled(
			matching.map(p => p.authenticate(params.resource, params.token)),
		);
		let authenticated = false;
		for (let i = 0; i < settled.length; i++) {
			const result = settled[i];
			if (result.status === 'fulfilled') {
				authenticated ||= result.value;
			} else {
				this._logService.error(
					result.reason,
					`[AgentService] Provider '${matching[i].id}' authenticate threw for resource=${params.resource}`,
				);
			}
		}
		return { authenticated };
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions called');
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listSessions())
		);
		const flat = results.flat();

		// Overlay persisted custom titles from per-session databases.
		const result = await Promise.all(flat.map(async s => {
			try {
				const ref = await this._sessionDataService.tryOpenDatabase(s.session);
				if (!ref) {
					return s;
				}
				try {
					const m = await ref.object.getMetadataObject({ customTitle: true, isRead: true, isArchived: true, isDone: true, diffs: true });
					let updated = s;
					if (m.customTitle) {
						updated = { ...updated, summary: m.customTitle };
					}
					if (m.isRead !== undefined) {
						updated = { ...updated, isRead: m.isRead === 'true' };
					}
					if (m.isArchived !== undefined) {
						updated = { ...updated, isArchived: m.isArchived === 'true' };
					} else if (m.isDone !== undefined) {
						updated = { ...updated, isArchived: m.isDone === 'true' };
					}
					if (m.diffs) {
						try { updated = { ...updated, diffs: JSON.parse(m.diffs) }; } catch { /* ignore malformed */ }
					}
					return updated;
				} finally {
					ref.dispose();
				}
			} catch (e) {
				this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${s.session}`, e);
			}
			return s;
		}));

		// Overlay live session state from the state manager.
		// For the title, prefer the state manager's value when it is
		// non-empty, so SDK-sourced titles are not overwritten by the
		// initial empty placeholder.
		const withStatus = result.map(s => {
			const liveState = this._stateManager.getSessionState(s.session.toString());
			if (liveState) {
				return {
					...s,
					summary: liveState.summary.title || s.summary,
					status: liveState.summary.status,
					activity: liveState.summary.activity,
					model: liveState.summary.model ?? s.model,
				};
			}
			return s;
		});

		this._logService.trace(`[AgentService] listSessions returned ${withStatus.length} sessions`);
		return withStatus;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}

		// When forking, build the old→new turn ID mapping before creating the
		// session so the agent can use it to remap per-turn data.
		if (config?.fork) {
			const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
			if (sourceState) {
				const sourceTurns = sourceState.turns.slice(0, config.fork.turnIndex + 1);
				const turnIdMapping = new Map<string, string>();
				for (const t of sourceTurns) {
					turnIdMapping.set(t.id, generateUuid());
				}
				config = {
					...config,
					fork: { ...config.fork, turnIdMapping },
				};
			}
		}

		// Ensure the command auto-approver is ready before any session events
		// can arrive. This makes shell command auto-approval fully synchronous.
		// Safe to run in parallel with createSession since no events flow until
		// sendMessage() is called.
		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			this._sideEffects.initialize(),
			provider.createSession(config),
		]);
		const session = created.session;
		this._logService.trace(`[AgentService] createSession: initialization complete`);

		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? '(default)'}`);
		this._sessionToProvider.set(session.toString(), provider.id);
		this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);

		const sessionConfig = await this._resolveCreatedSessionConfig(provider, config);

		// When forking, populate the new session's protocol state with
		// the source session's turns so the client sees the forked history.
		if (config?.fork) {
			const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
			let sourceTurns: Turn[] = [];
			if (sourceState && config.fork.turnIdMapping) {
				sourceTurns = sourceState.turns.slice(0, config.fork.turnIndex + 1)
					.map(t => ({ ...t, id: config!.fork!.turnIdMapping!.get(t.id) ?? generateUuid() }));
			}

			const summary: SessionSummary = {
				resource: session.toString(),
				provider: provider.id,
				title: sourceState?.summary.title ?? 'Forked Session',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
				model: config?.model,
				workingDirectory: (created.workingDirectory ?? config.workingDirectory)?.toString(),
			};
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			state.turns = sourceTurns;
			state.activeClient = config.activeClient;
		} else {
			// Create empty state for new sessions
			const summary: SessionSummary = {
				resource: session.toString(),
				provider: provider.id,
				title: '',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
				model: config?.model,
				workingDirectory: (created.workingDirectory ?? config?.workingDirectory)?.toString(),
			};
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			state.activeClient = config?.activeClient;
		}
		// Persist initial config values so a subsequent `restoreSession` can
		// re-hydrate them. We persist the full resolved values (not just the
		// user's input) so clients can render them on restore without having
		// to re-resolve. Mid-session changes are persisted by `AgentSideEffects`
		// when handling `SessionConfigChanged`.
		if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0) {
			this._persistConfigValues(session, sessionConfig.values);
		}
		this._stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: session.toString() });

		// Lazily compute git state for sessions with a working directory;
		// attaches under `state._meta.git` once ready.
		this._attachGitState(session, created.workingDirectory ?? config?.workingDirectory);

		return session;
	}

	/**
	 * Fire-and-forget probe that resolves the session's git state for its
	 * working directory (if any) and merges it into `state._meta.git` via
	 * the state manager. Failures are logged; sessions simply remain without
	 * git state.
	 */
	private _attachGitState(session: URI, workingDirectory: URI | undefined): void {
		if (!workingDirectory) {
			return;
		}
		this._gitService.getSessionGitState(workingDirectory).then(
			gitState => {
				if (!gitState) {
					return;
				}
				const sessionKey = session.toString();
				const current = this._stateManager.getSessionState(sessionKey)?._meta;
				// Skip the action if the computed git state hasn't changed; this is
				// called after every turn, so deduping avoids needless action churn.
				if (objectEquals(readSessionGitState(current), gitState)) {
					return;
				}
				const next = withSessionGitState(current, gitState);
				this._stateManager.setSessionMeta(sessionKey, next);
			},
			e => {
				this._logService.warn(`[AgentService] Failed to compute git state for ${session}`, e);
			},
		);
	}

	private _persistConfigValues(session: URI, values: Record<string, unknown>): void {
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(session);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open session database to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata('configValues', JSON.stringify(values)).catch(err => {
			this._logService.warn(`[AgentService] Failed to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
		});
	}

	private async _resolveCreatedSessionConfig(provider: IAgent, config: IAgentCreateSessionConfig | undefined): Promise<SessionConfigState | undefined> {
		if (!config?.config && !config?.workingDirectory) {
			return undefined;
		}
		try {
			const resolved = await provider.resolveSessionConfig({
				provider: provider.id,
				workingDirectory: config.workingDirectory,
				config: config.config,
			});
			return { schema: resolved.schema, values: resolved.values };
		} catch (error) {
			this._logService.error(`[AgentService] Failed to resolve created session config for provider ${provider.id}`, error);
			return config.config ? { schema: { type: 'object', properties: {} }, values: config.config } : undefined;
		}
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const providerId = params.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		return provider.resolveSessionConfig(params);
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		const providerId = params.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		return provider.sessionConfigCompletions(params);
	}

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		const provider = this._findProviderForSession(session);
		if (provider) {
			await provider.disposeSession(session);
			this._sessionToProvider.delete(session.toString());
		}
		// Remove all subagent sessions for this parent
		this._sideEffects.removeSubagentSessions(session.toString());
		this._stateManager.deleteSession(session.toString());
	}

	// ---- Protocol methods ---------------------------------------------------

	async createTerminal(params: CreateTerminalParams): Promise<void> {
		await this._terminalManager.createTerminal(params);
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		this._terminalManager.disposeTerminal(terminal.toString());
	}

	async subscribe(resource: URI, clientId: string): Promise<IStateSnapshot> {
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const resourceStr = resource.toString();
		// Register the subscriber up front so a concurrent unsubscribe cannot
		// evict the session state while we are awaiting restore. On any failure
		// path below we must roll the registration back, otherwise the leaked
		// refcount would permanently pin (or block eviction of) the resource.
		this.addSubscriber(resource, clientId);
		try {
			// Check for terminal state
			const terminalState = this._terminalManager.getTerminalState(resourceStr);
			if (terminalState) {
				return { resource: resourceStr, state: terminalState, fromSeq: this._stateManager.serverSeq };
			}

			let snapshot = this._stateManager.getSnapshot(resourceStr);
			if (!snapshot) {
				// Try subagent restore before regular session restore
				const parsed = parseSubagentSessionUri(resourceStr);
				if (parsed) {
					await this._restoreSubagentSession(resourceStr, parsed.parentSession, parsed.toolCallId);
				} else {
					await this.restoreSession(resource);
				}
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			if (!snapshot) {
				throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
			}

			// Ensure git state has been computed for this session. When the snapshot
			// already existed (e.g. seeded by list query, or restored earlier), the
			// restore path that normally calls `_attachGitState` is skipped — so
			// trigger it lazily here for the first subscriber. `_attachGitState`
			// is async and updates `_meta.git` once ready, which clients see via
			// the normal state-update stream.
			const sessionState = this._stateManager.getSessionState(resourceStr);
			if (sessionState && readSessionGitState(sessionState._meta) === undefined) {
				const wd = sessionState.summary?.workingDirectory;
				this._attachGitState(resource, wd ? URI.parse(wd) : undefined);
			}

			return snapshot;
		} catch (err) {
			this.unsubscribe(resource, clientId);
			throw err;
		}
	}

	addSubscriber(resource: URI, clientId: string): void {
		let set = this._resourceSubscribers.get(resource);
		if (!set) {
			set = new Set();
			this._resourceSubscribers.set(resource, set);
		}
		set.add(clientId);
	}

	unsubscribe(resource: URI, clientId: string): void {
		const set = this._resourceSubscribers.get(resource);
		if (!set) {
			return;
		}
		set.delete(clientId);
		if (set.size > 0) {
			return;
		}
		this._resourceSubscribers.delete(resource);
		this._maybeEvictIdleSession(resource);
	}

	/**
	 * If `resource` names an idle session and no client is still subscribed to
	 * it (or, for a subagent URI, no sibling subagent under the same parent is
	 * still subscribed), drop its cached state from the state manager. Subagent
	 * URIs evict the parent session entry; the parent owns the materialized
	 * turn tree that backs every subagent view. The next subscribe will
	 * rehydrate the session via {@link restoreSession}.
	 */
	private _maybeEvictIdleSession(resource: URI): void {
		const key = resource.toString();
		if (this._resourceSubscribers.has(resource)) {
			return;
		}
		const parsed = parseSubagentSessionUri(key);
		let evictionTarget: string;
		if (parsed) {
			evictionTarget = parsed.parentSession;
			if (this._resourceSubscribers.has(URI.parse(evictionTarget))) {
				return;
			}
			const parentPrefix = parsed.parentSession + '/subagent/';
			for (const subscribedUri of this._resourceSubscribers.keys()) {
				if (subscribedUri.toString().startsWith(parentPrefix)) {
					return;
				}
			}
		} else {
			evictionTarget = key;
			const subagentPrefix = key + '/subagent/';
			for (const subscribedUri of this._resourceSubscribers.keys()) {
				if (subscribedUri.toString().startsWith(subagentPrefix)) {
					return;
				}
			}
		}
		const targetState = this._stateManager.getSessionState(evictionTarget);
		if (!targetState || targetState.activeTurn !== undefined) {
			return;
		}
		this._logService.trace(`[AgentService] Evicting idle session: ${evictionTarget} (triggered by unsubscribe of ${key})`);
		// Also evict any sibling subagent entries cached under the parent: their
		// authoritative state is the parent's turn tree, and dropping the parent
		// would leave them orphaned.
		const subagentPrefix = evictionTarget + '/subagent/';
		for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
			this._stateManager.removeSession(cachedKey);
		}
		this._stateManager.removeSession(evictionTarget);
	}

	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(action, origin);
		if (action.type === ActionType.RootConfigChanged) {
			this._configurationService.persistRootConfig();
		}
		this._sideEffects.handleAction(action);
	}

	async resourceList(uri: URI): Promise<ResourceListResult> {
		let stat;
		try {
			stat = await this._fileService.resolve(uri);
		} catch {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
		}

		if (!stat.isDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
		}

		const entries: DirectoryEntry[] = (stat.children ?? []).map(child => ({
			name: child.name,
			type: child.isDirectory ? 'directory' : 'file',
		}));
		return { entries };
	}

	async restoreSession(session: URI): Promise<void> {
		const sessionStr = session.toString();

		// Already in state manager - nothing to do.
		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}

		const agent = this._findProviderForSession(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
		}

		const meta = await this._getSessionMetadataForRestore(agent, session);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
		}

		let turns: readonly Turn[];
		try {
			turns = await agent.getSessionMessages(session);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
		}

		// Check for persisted metadata in the session database
		let title = meta.summary ?? 'Session';
		let isRead: boolean | undefined;
		let isArchived: boolean | undefined;
		let diffs: ISessionFileDiff[] | undefined;
		let persistedConfigValues: Record<string, string> | undefined;
		const ref = this._sessionDataService.tryOpenDatabase?.(session);
		if (ref) {
			try {
				const db = await ref;
				if (db) {
					try {
						const m = await db.object.getMetadataObject({ customTitle: true, isRead: true, isArchived: true, isDone: true, diffs: true, configValues: true });
						if (m.customTitle) {
							title = m.customTitle;
						}
						if (m.isRead !== undefined) {
							isRead = m.isRead === 'true';
						}
						if (m.isArchived !== undefined) {
							isArchived = m.isArchived === 'true';
						} else if (m.isDone !== undefined) {
							isArchived = m.isDone === 'true';
						}
						if (m.diffs) {
							try { diffs = JSON.parse(m.diffs); } catch { /* ignore malformed */ }
						}
						if (m.configValues) {
							try {
								persistedConfigValues = JSON.parse(m.configValues);
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse persisted configValues for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}
					} finally {
						db.dispose();
					}
				}
			} catch {
				// Best-effort: fall back to agent-provided metadata
			}
		}

		// Encode isRead/isArchived as status bitmask flags
		let status: SessionStatus = SessionStatus.Idle;
		if (isRead) {
			status |= SessionStatus.IsRead;
		}
		if (isArchived) {
			status |= SessionStatus.IsArchived;
		}

		const summary: SessionSummary = {
			resource: sessionStr,
			provider: agent.id,
			title,
			status,
			createdAt: meta.startTime,
			modifiedAt: meta.modifiedTime,
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			model: meta.model,
			workingDirectory: meta.workingDirectory?.toString(),
			diffs,
		};

		this._stateManager.restoreSession(summary, [...turns]);

		// Restore persisted `_meta` (e.g. git state) onto the new session
		// state. This dispatches a SessionMetaChanged action.
		if (meta._meta) {
			this._stateManager.setSessionMeta(sessionStr, meta._meta);
		}

		// Resolve the session config so clients (e.g. the running-session
		// auto-approve picker) can render session-mutable properties for
		// sessions that were not created in the current process lifetime.
		// Overlay any values the user previously selected (persisted via
		// `SessionConfigChanged`) on top of the provider's resolved defaults.
		const restoredConfig = await this._resolveCreatedSessionConfig(agent, {
			workingDirectory: meta.workingDirectory,
			config: persistedConfigValues,
		});
		if (restoredConfig) {
			const restoredState = this._stateManager.getSessionState(sessionStr);
			if (restoredState) {
				restoredState.config = restoredConfig;
			}
		}

		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);

		// Lazily compute git state for sessions with a working directory;
		// attaches under `state._meta.git` once ready.
		this._attachGitState(session, meta.workingDirectory);
	}

	private async _getSessionMetadataForRestore(agent: IAgent, session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		if (agent.getSessionMetadata) {
			try {
				return await agent.getSessionMetadata(session);
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				try {
					return await this._getSessionMetadataFromCatalog(agent, session);
				} catch (fallbackErr) {
					if (fallbackErr instanceof ProtocolError) {
						const message = err instanceof Error ? err.message : String(err);
						throw new ProtocolError(fallbackErr.code, `Failed to get session metadata for ${sessionStr}: ${message}; ${fallbackErr.message}`, fallbackErr.data);
					}
					throw fallbackErr;
				}
			}
		}

		// Older providers only expose catalog enumeration. Keep the fallback so
		// restore remains compatible, but providers with a direct lookup avoid
		// blocking session open on a full catalog refresh.
		return this._getSessionMetadataFromCatalog(agent, session);
	}

	private async _getSessionMetadataFromCatalog(agent: IAgent, session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		let allSessions;
		try {
			allSessions = await agent.listSessions();
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
		}
		return allSessions.find(s => s.session.toString() === sessionStr);
	}

	async resourceRead(uri: URI): Promise<ResourceReadResult> {
		// Handle session-db: URIs that reference file-edit content stored
		// in a per-session SQLite database.
		const dbFields = parseSessionDbUri(uri.toString());
		if (dbFields) {
			return this._fetchSessionDbContent(dbFields);
		}

		// Handle git-blob: URIs that reference file content at a specific
		// git commit (the merge-base used as diff baseline). The URI
		// encodes the session it belongs to so we can find the right
		// working directory to run `git show` from.
		const blobFields = parseGitBlobUri(uri.toString());
		if (blobFields) {
			return this._fetchGitBlobContent(blobFields);
		}

		try {
			const content = await this._fileService.readFile(uri);
			return {
				data: content.value.toString(),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} catch (_e) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
	}

	async resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		const fileUri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		let content: VSBuffer;
		if (params.encoding === ContentEncoding.Base64) {
			content = decodeBase64(params.data);
		} else {
			content = VSBuffer.fromString(params.data);
		}
		try {
			if (params.createOnly) {
				await this._fileService.createFile(fileUri, content, { overwrite: false });
			} else {
				await this._fileService.writeFile(fileUri, content);
			}
			return {};
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
		}
	}

	async resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.copy(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		const fileUri = URI.parse(params.uri);
		try {
			await this._fileService.del(fileUri, { recursive: params.recursive });
			return {};
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.NoPermissions) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
		}
	}

	async resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.move(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async shutdown(): Promise<void> {
		this._logService.info('AgentService: shutting down all providers...');
		const promises: Promise<void>[] = [];
		for (const provider of this._providers.values()) {
			promises.push(provider.shutdown());
		}
		await Promise.all(promises);
		this._sessionToProvider.clear();
	}

	// ---- helpers ------------------------------------------------------------

	private async _fetchSessionDbContent(fields: ISessionDbUriFields): Promise<ResourceReadResult> {
		const sessionUri = URI.parse(fields.sessionUri);
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
			if (!content) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			const bytes = fields.part === 'before' ? content.beforeContent : content.afterContent;
			if (!bytes) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			return {
				data: new TextDecoder().decode(bytes),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			ref.dispose();
		}
	}

	private async _fetchGitBlobContent(fields: IGitBlobUriFields): Promise<ResourceReadResult> {
		if (!this._gitService) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `git service unavailable for: ${fields.repoRelativePath}`);
		}
		const workingDirectory = this._stateManager.getSessionState(fields.sessionUri)?.summary.workingDirectory;
		if (!workingDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Session has no working directory for git-blob URI: ${fields.sessionUri}`);
		}
		const blob = await this._gitService.showBlob(URI.parse(workingDirectory), fields.sha, fields.repoRelativePath);
		if (!blob) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
		}
		return {
			data: blob.toString(),
			encoding: ContentEncoding.Utf8,
			contentType: 'text/plain',
		};
	}

	/**
	 * Restores a subagent session from its parent session's event history.
	 * Loads the parent's raw messages, filters for events belonging to
	 * the subagent (by `parentToolCallId`), and builds the child session's
	 * turns from those events.
	 */
	private async _restoreSubagentSession(subagentUri: string, parentSession: string, toolCallId: string): Promise<void> {
		// Ensure the parent session is loaded first
		const parentUri = URI.parse(parentSession);
		if (!this._stateManager.getSessionState(parentSession)) {
			try {
				await this.restoreSession(parentUri);
			} catch {
				this._logService.warn(`[AgentService] Cannot restore parent session for subagent: ${parentSession}`);
				return;
			}
		}

		const parentState = this._stateManager.getSessionState(parentSession);
		if (!parentState) {
			return;
		}

		// Search completed turns and active turn for the subagent content metadata
		const allTurns = [...parentState.turns];
		if (parentState.activeTurn) {
			allTurns.push(parentState.activeTurn as Turn);
		}

		let subagentContent: ToolResultSubagentContent | undefined;
		for (const turn of allTurns) {
			for (const part of turn.responseParts) {
				if (part.kind === ResponsePartKind.ToolCall) {
					const tc = part.toolCall;
					// Check both completed and running tool calls — running
					// tool calls receive subagent content via ContentChanged
					const content = tc.status === ToolCallStatus.Completed
						? tc.content
						: (tc.status === ToolCallStatus.Running ? tc.content : undefined);
					if (content) {
						for (const c of content) {
							if (c.type === ToolResultContentType.Subagent && c.resource === subagentUri) {
								subagentContent = c;
								break;
							}
						}
					}
				}
			}
			if (subagentContent) {
				break;
			}
		}

		// Load the subagent's turns from the agent (which knows how to
		// extract them from the parent session's event log).
		let childTurns: readonly Turn[] = [];
		const agent = this._findProviderForSession(parentUri);
		if (agent) {
			try {
				childTurns = await agent.getSessionMessages(URI.parse(subagentUri));
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to load subagent turns for ${subagentUri}`, err);
			}
		}

		// Use metadata from subagent content if available, otherwise synthesize
		const title = subagentContent?.title ?? 'Subagent';

		this._stateManager.restoreSession(
			{
				resource: subagentUri,
				provider: 'subagent',
				title,
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				...(parentState?.summary.project ? { project: parentState.summary.project } : {}),
			},
			[...childTurns],
		);
		this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
	}

	private _findProviderForSession(session: URI | string): IAgent | undefined {
		const key = typeof session === 'string' ? session : session.toString();
		const providerId = this._sessionToProvider.get(key);
		if (providerId) {
			return this._providers.get(providerId);
		}
		const schemeProvider = AgentSession.provider(session);
		if (schemeProvider) {
			return this._providers.get(schemeProvider);
		}
		// Fallback: try the default provider (handles resumed sessions not yet tracked)
		if (this._defaultProvider) {
			return this._providers.get(this._defaultProvider);
		}
		return undefined;
	}

	/**
	 * Sets the agents observable to trigger model re-fetch and
	 * `root/agentsChanged` via the autorun in {@link AgentSideEffects}.
	 */
	private _updateAgents(): void {
		this._agents.set([...this._providers.values()], undefined);
	}

	override dispose(): void {
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
		this._providers.clear();
		super.dispose();
	}
}
