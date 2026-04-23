/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, IAgent, IAgentCreateSessionConfig, IAgentMessageEvent, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSubagentStartedEvent, IAgentToolCompleteEvent, IAgentToolStartEvent, AuthenticateParams, AuthenticateResult } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, ActionEnvelope, INotification, SessionAction, TerminalAction, isSessionAction } from '../common/state/sessionActions.js';
import type { CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, parseSubagentSessionUri, type ResponsePart, type SessionConfigState, type ISessionFileDiff, type SessionSummary, type ToolCallCompletedState, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { IProductService } from '../../product/common/productService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostTerminalManager, type IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from './copilot/fileEditTracker.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
/**
 * Extracts subagent metadata from a tool start event. Adapters are
 * responsible for normalizing their SDK-specific argument shape into the
 * generic `subagentAgentName` / `subagentDescription` fields on the event
 * itself, so this just forwards them.
 */
function extractSubagentMeta(start: IAgentToolStartEvent | undefined): { subagentDescription?: string; subagentAgentName?: string } {
	if (!start) {
		return {};
	}
	return {
		subagentDescription: start.subagentDescription,
		subagentAgentName: start.subagentAgentName,
	};
}

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

	/** Exposes the terminal manager for use by agent providers. */
	get terminalManager(): IAgentHostTerminalManager { return this._terminalManager; }

	constructor(
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _productService: IProductService,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._stateManager = this._register(new AgentHostStateManager(_logService));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));

		// Build a local instantiation scope so downstream components can
		// consume {@link IAgentConfigurationService} (and later {@link ILogService})
		// via DI rather than being plumbed plain-class references.
		const configurationService: IAgentConfigurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService));
		const services = new ServiceCollection(
			[ILogService, this._logService],
			[IAgentConfigurationService, configurationService],
		);
		const instantiationService = this._register(new InstantiationService(services, /*strict*/ true));

		this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			agents: this._agents,
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
		for (const provider of this._providers.values()) {
			const resources = provider.getProtectedResources();
			if (resources.some(r => r.resource === params.resource)) {
				const accepted = await provider.authenticate(params.resource, params.token);
				if (accepted) {
					return { authenticated: true };
				}
			}
		}
		return { authenticated: false };
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

		return session;
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

	async subscribe(resource: URI): Promise<IStateSnapshot> {
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const resourceStr = resource.toString();

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
		return snapshot;
	}

	unsubscribe(resource: URI): void {
		this._logService.trace(`[AgentService] unsubscribe: ${resource.toString()}`);
		// Server-side tracking of per-client subscriptions will be added
		// in Phase 4 (multi-client). For now this is a no-op.
	}

	dispatchAction(action: SessionAction | TerminalAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		const origin = { clientId, clientSeq };

		if (isSessionAction(action)) {
			this._stateManager.dispatchClientAction(action, origin);
			this._sideEffects.handleAction(action);
		} else {
			this._stateManager.dispatchClientAction(action, origin);
		}
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

		// Verify the session actually exists on the backend to avoid
		// creating phantom sessions for made-up URIs.
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
		const meta = allSessions.find(s => s.session.toString() === sessionStr);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
		}

		let messages;
		try {
			messages = await agent.getSessionMessages(session);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
		}
		const turns = this._buildTurnsFromMessages(messages);

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

		this._stateManager.restoreSession(summary, turns);

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
	}

	async resourceRead(uri: URI): Promise<ResourceReadResult> {
		// Handle session-db: URIs that reference file-edit content stored
		// in a per-session SQLite database.
		const dbFields = parseSessionDbUri(uri.toString());
		if (dbFields) {
			return this._fetchSessionDbContent(dbFields);
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

	/**
	 * Reconstructs completed `Turn[]` from a sequence of agent session
	 * messages. Each user-message starts a new turn; the assistant message
	 * closes it.
	 */
	private _buildTurnsFromMessages(
		messages: readonly (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent)[],
	): Turn[] {
		const turns: Turn[] = [];
		// Track subagent metadata by parent tool call ID so we can inject
		// ToolResultSubagentContent into the parent tool call's completion content
		const subagentsByToolCallId = new Map<string, IAgentSubagentStartedEvent>();
		let currentTurn: {
			id: string;
			userMessage: { text: string };
			responseParts: ResponsePart[];
			pendingTools: Map<string, IAgentToolStartEvent>;
		} | undefined;

		const finalizeTurn = (turn: NonNullable<typeof currentTurn>, state: TurnState): void => {
			turns.push({
				id: turn.id,
				userMessage: turn.userMessage,
				responseParts: turn.responseParts,
				usage: undefined,
				state,
			});
		};

		const startTurn = (id: string, text: string): NonNullable<typeof currentTurn> => ({
			id,
			userMessage: { text },
			responseParts: [],
			pendingTools: new Map(),
		});

		for (const msg of messages) {
			if (msg.type === 'message' && msg.role === 'user') {
				if (currentTurn) {
					finalizeTurn(currentTurn, TurnState.Cancelled);
				}
				currentTurn = startTurn(msg.messageId, msg.content);
			} else if (msg.type === 'message' && msg.role === 'assistant') {
				// Skip inner assistant messages from subagent sessions.
				// These have parentToolCallId set and belong to the child
				// session, not the parent turn.
				if (msg.parentToolCallId) {
					continue;
				}
				if (!currentTurn) {
					currentTurn = startTurn(msg.messageId, '');
				}

				if (msg.content) {
					currentTurn.responseParts.push({
						kind: ResponsePartKind.Markdown,
						id: generateUuid(),
						content: msg.content,
					});
				}

				if (!msg.toolRequests || msg.toolRequests.length === 0) {
					finalizeTurn(currentTurn, TurnState.Complete);
					currentTurn = undefined;
				}
			} else if (msg.type === 'subagent_started') {
				subagentsByToolCallId.set(msg.toolCallId, msg);
			} else if (msg.type === 'tool_start') {
				// Skip inner tool calls from subagent sessions — they belong
				// to the child session, not the parent turn.
				if (msg.parentToolCallId) {
					continue;
				}
				currentTurn?.pendingTools.set(msg.toolCallId, msg);
			} else if (msg.type === 'tool_complete') {
				// Skip inner tool completions from subagent sessions.
				if (msg.parentToolCallId) {
					continue;
				}
				if (currentTurn) {
					const start = currentTurn.pendingTools.get(msg.toolCallId);
					currentTurn.pendingTools.delete(msg.toolCallId);

					// Inject subagent content if this tool call spawned a subagent
					const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
					const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
					if (subagentEvent) {
						const parentSessionStr = msg.session.toString();
						contentWithSubagent.push({
							type: ToolResultContentType.Subagent,
							resource: buildSubagentSessionUri(parentSessionStr, msg.toolCallId),
							title: subagentEvent.agentDisplayName,
							agentName: subagentEvent.agentName,
							description: subagentEvent.agentDescription,
						});
					}

					const tc: ToolCallCompletedState = {
						status: ToolCallStatus.Completed,
						toolCallId: msg.toolCallId,
						toolName: start?.toolName ?? 'unknown',
						displayName: start?.displayName ?? 'Unknown Tool',
						invocationMessage: start?.invocationMessage ?? 'Unknown tool',
						toolInput: start?.toolInput,
						success: msg.result.success,
						pastTenseMessage: msg.result.pastTenseMessage,
						content: contentWithSubagent.length > 0 ? contentWithSubagent : undefined,
						error: msg.result.error,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						_meta: {
							toolKind: start?.toolKind,
							language: start?.language,
							...extractSubagentMeta(start),
						},
					};
					currentTurn.responseParts.push({
						kind: ResponsePartKind.ToolCall,
						toolCall: tc,
					});
				}
			}
		}

		if (currentTurn) {
			finalizeTurn(currentTurn, TurnState.Cancelled);
		}

		return turns;
	}

	/**
	 * Builds turns for a subagent child session by extracting events
	 * from the parent session's messages that have the matching
	 * `parentToolCallId`. Creates a single turn containing all inner
	 * tool calls.
	 */
	private _buildSubagentTurns(
		parentMessages: readonly (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent)[],
		parentToolCallId: string,
		childSessionUri: string,
	): Turn[] {
		// Collect all inner tool call IDs that belong to this subagent
		const innerToolCallIds = new Set<string>();
		for (const msg of parentMessages) {
			if ((msg.type === 'tool_start' || msg.type === 'tool_complete') && msg.parentToolCallId === parentToolCallId) {
				innerToolCallIds.add(msg.toolCallId);
			}
		}

		// Collect subagent_started events for nested subagents spawned by
		// inner tool calls of this child session
		const subagentsByToolCallId = new Map<string, IAgentSubagentStartedEvent>();
		for (const msg of parentMessages) {
			if (msg.type === 'subagent_started' && innerToolCallIds.has(msg.toolCallId)) {
				subagentsByToolCallId.set(msg.toolCallId, msg);
			}
		}

		// Filter for events belonging to this subagent
		const innerMessages = parentMessages.filter(msg => {
			if (msg.type === 'tool_start' || msg.type === 'tool_complete') {
				return msg.parentToolCallId === parentToolCallId;
			}
			if (msg.type === 'message') {
				return msg.parentToolCallId === parentToolCallId;
			}
			return false;
		});

		if (innerMessages.length === 0) {
			return [];
		}

		// Build a single turn with all inner tool calls
		const responseParts: ResponsePart[] = [];
		const pendingTools = new Map<string, IAgentToolStartEvent>();

		for (const msg of innerMessages) {
			if (msg.type === 'tool_start') {
				pendingTools.set(msg.toolCallId, msg);
			} else if (msg.type === 'tool_complete') {
				const start = pendingTools.get(msg.toolCallId);
				pendingTools.delete(msg.toolCallId);

				// Inject nested subagent content if applicable
				const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
				const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
				if (subagentEvent) {
					contentWithSubagent.push({
						type: ToolResultContentType.Subagent,
						resource: buildSubagentSessionUri(childSessionUri, msg.toolCallId),
						title: subagentEvent.agentDisplayName,
						agentName: subagentEvent.agentName,
						description: subagentEvent.agentDescription,
					});
				}

				const tc: ToolCallCompletedState = {
					status: ToolCallStatus.Completed,
					toolCallId: msg.toolCallId,
					toolName: start?.toolName ?? 'unknown',
					displayName: start?.displayName ?? 'Unknown Tool',
					invocationMessage: start?.invocationMessage ?? 'Unknown tool',
					toolInput: start?.toolInput,
					success: msg.result.success,
					pastTenseMessage: msg.result.pastTenseMessage,
					content: contentWithSubagent.length > 0 ? contentWithSubagent : undefined,
					error: msg.result.error,
					confirmed: ToolCallConfirmationReason.NotNeeded,
					_meta: {
						toolKind: start?.toolKind,
						language: start?.language,
						...extractSubagentMeta(start),
					},
				};
				responseParts.push({
					kind: ResponsePartKind.ToolCall,
					toolCall: tc,
				});
			} else if (msg.type === 'message' && msg.role === 'assistant' && msg.content) {
				responseParts.push({
					kind: ResponsePartKind.Markdown,
					id: generateUuid(),
					content: msg.content,
				});
			}
		}

		if (responseParts.length === 0) {
			return [];
		}

		return [{
			id: generateUuid(),
			userMessage: { text: '' },
			responseParts,
			usage: undefined,
			state: TurnState.Complete,
		}];
	}

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

		// Load parent's raw messages and extract inner events for this subagent
		let childTurns: Turn[] = [];
		const agent = this._findProviderForSession(parentUri);
		if (agent) {
			try {
				const messages = await agent.getSessionMessages(parentUri);
				childTurns = this._buildSubagentTurns(messages, toolCallId, subagentUri);
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to load parent messages for subagent restore: ${subagentUri}`, err);
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
			childTurns,
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
