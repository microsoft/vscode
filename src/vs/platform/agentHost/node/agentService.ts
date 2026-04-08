/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, IAgent, IAgentCreateSessionConfig, IAgentMessageEvent, IAgentService, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent, IAuthenticateParams, IAuthenticateResult } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, IActionEnvelope, INotification, ISessionAction, ITerminalAction, isSessionAction } from '../common/state/sessionActions.js';
import type { ICreateTerminalParams } from '../common/state/protocol/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, type IDirectoryEntry, type IResourceCopyParams, type IResourceCopyResult, type IResourceDeleteParams, type IResourceDeleteResult, type IResourceListResult, type IResourceMoveParams, type IResourceMoveResult, type IResourceReadResult, type IResourceWriteParams, type IResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, TurnState, type IResponsePart, type ISessionSummary, type IToolCallCompletedState, type ITurn } from '../common/state/sessionState.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from './copilot/fileEditTracker.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	/** Protocol: fires when state is mutated by an action. */
	private readonly _onDidAction = this._register(new Emitter<IActionEnvelope>());
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

	constructor(
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
		private readonly _sessionDataService: ISessionDataService,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._stateManager = this._register(new AgentHostStateManager(_logService));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
		this._sideEffects = this._register(new AgentSideEffects(this._stateManager, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			agents: this._agents,
		}, this._logService));

		// Terminal management — the terminal manager listens to the state
		// manager's action stream and dispatches PTY output back through it.
		this._terminalManager = this._register(new AgentHostTerminalManager(this._stateManager, this._logService));
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

	async authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
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
					const [customTitle, isReadRaw, isDoneRaw] = await Promise.all([
						ref.object.getMetadata('customTitle'),
						ref.object.getMetadata('isRead'),
						ref.object.getMetadata('isDone'),
					]);
					let updated = s;
					if (customTitle) {
						updated = { ...updated, summary: customTitle };
					}
					if (isReadRaw !== undefined) {
						updated = { ...updated, isRead: isReadRaw === 'true' };
					}
					if (isDoneRaw !== undefined) {
						updated = { ...updated, isDone: isDoneRaw === 'true' };
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

		this._logService.trace(`[AgentService] listSessions returned ${result.length} sessions`);
		return result;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}

		// Ensure the command auto-approver is ready before any session events
		// can arrive. This makes shell command auto-approval fully synchronous.
		// Safe to run in parallel with createSession since no events flow until
		// sendMessage() is called.
		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, session] = await Promise.all([
			this._sideEffects.initialize(),
			provider.createSession(config),
		]);
		this._logService.trace(`[AgentService] createSession: initialization complete`);

		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model ?? '(default)'}`);
		this._sessionToProvider.set(session.toString(), provider.id);
		this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);

		// When forking, populate the new session's protocol state with
		// the source session's turns so the client sees the forked history.
		if (config?.fork) {
			const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
			let sourceTurns: ITurn[] = [];
			if (sourceState) {
				sourceTurns = sourceState.turns.slice(0, config.fork.turnIndex + 1)
					.map(t => ({ ...t, id: generateUuid() }));
			}

			const summary: ISessionSummary = {
				resource: session.toString(),
				provider: provider.id,
				title: sourceState?.summary.title ?? 'Forked Session',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: config.workingDirectory?.toString(),
			};
			const state = this._stateManager.createSession(summary);
			state.turns = sourceTurns;
		} else {
			// Create empty state for new sessions
			const summary: ISessionSummary = {
				resource: session.toString(),
				provider: provider.id,
				title: 'New Session',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: config?.workingDirectory?.toString(),
			};
			this._stateManager.createSession(summary);
		}
		this._stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: session.toString() });

		return session;
	}

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		const provider = this._findProviderForSession(session);
		if (provider) {
			await provider.disposeSession(session);
			this._sessionToProvider.delete(session.toString());
		}
		this._stateManager.deleteSession(session.toString());
	}

	// ---- Protocol methods ---------------------------------------------------

	async createTerminal(params: ICreateTerminalParams): Promise<void> {
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
			await this.restoreSession(resource);
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

	dispatchAction(action: ISessionAction | ITerminalAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		const origin = { clientId, clientSeq };

		if (isSessionAction(action)) {
			this._stateManager.dispatchClientAction(action, origin);
			this._sideEffects.handleAction(action);
		} else {
			this._stateManager.dispatchClientAction(action, origin);
		}
	}

	async resourceList(uri: URI): Promise<IResourceListResult> {
		let stat;
		try {
			stat = await this._fileService.resolve(uri);
		} catch {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
		}

		if (!stat.isDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
		}

		const entries: IDirectoryEntry[] = (stat.children ?? []).map(child => ({
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
		let isDone: boolean | undefined;
		const ref = this._sessionDataService.tryOpenDatabase?.(session);
		if (ref) {
			try {
				const db = await ref;
				if (db) {
					try {
						const [customTitle, isReadRaw, isDoneRaw] = await Promise.all([
							db.object.getMetadata('customTitle'),
							db.object.getMetadata('isRead'),
							db.object.getMetadata('isDone'),
						]);
						if (customTitle) {
							title = customTitle;
						}
						if (isReadRaw !== undefined) {
							isRead = isReadRaw === 'true';
						}
						if (isDoneRaw !== undefined) {
							isDone = isDoneRaw === 'true';
						}
					} finally {
						db.dispose();
					}
				}
			} catch {
				// Best-effort: fall back to agent-provided metadata
			}
		}

		const summary: ISessionSummary = {
			resource: sessionStr,
			provider: agent.id,
			title,
			status: SessionStatus.Idle,
			createdAt: meta.startTime,
			modifiedAt: meta.modifiedTime,
			workingDirectory: meta.workingDirectory?.toString(),
			isRead,
			isDone,
		};

		this._stateManager.restoreSession(summary, turns);
		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);
	}

	async resourceRead(uri: URI): Promise<IResourceReadResult> {
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

	async resourceWrite(params: IResourceWriteParams): Promise<IResourceWriteResult> {
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

	async resourceCopy(params: IResourceCopyParams): Promise<IResourceCopyResult> {
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

	async resourceDelete(params: IResourceDeleteParams): Promise<IResourceDeleteResult> {
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

	async resourceMove(params: IResourceMoveParams): Promise<IResourceMoveResult> {
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
	 * Reconstructs completed `ITurn[]` from a sequence of agent session
	 * messages. Each user-message starts a new turn; the assistant message
	 * closes it.
	 */
	private _buildTurnsFromMessages(
		messages: readonly (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[],
	): ITurn[] {
		const turns: ITurn[] = [];
		let currentTurn: {
			id: string;
			userMessage: { text: string };
			responseParts: IResponsePart[];
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
			} else if (msg.type === 'tool_start') {
				currentTurn?.pendingTools.set(msg.toolCallId, msg);
			} else if (msg.type === 'tool_complete') {
				if (currentTurn) {
					const start = currentTurn.pendingTools.get(msg.toolCallId);
					currentTurn.pendingTools.delete(msg.toolCallId);

					const tc: IToolCallCompletedState = {
						status: ToolCallStatus.Completed,
						toolCallId: msg.toolCallId,
						toolName: start?.toolName ?? 'unknown',
						displayName: start?.displayName ?? 'Unknown Tool',
						invocationMessage: start?.invocationMessage ?? '',
						toolInput: start?.toolInput,
						success: msg.result.success,
						pastTenseMessage: msg.result.pastTenseMessage,
						content: msg.result.content,
						error: msg.result.error,
						confirmed: ToolCallConfirmationReason.NotNeeded,
						_meta: start ? {
							toolKind: start.toolKind,
							language: start.language,
						} : undefined,
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

	private async _fetchSessionDbContent(fields: ISessionDbUriFields): Promise<IResourceReadResult> {
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
