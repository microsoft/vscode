/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent, IAgentAttachment, IAgentMessageEvent, IAgentToolCompleteEvent, IAgentToolStartEvent, IAuthenticateParams, IAuthenticateResult, IResourceMetadata } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, ISessionAction } from '../common/state/sessionActions.js';
import { AhpErrorCodes, AHP_PROVIDER_NOT_FOUND, AHP_SESSION_NOT_FOUND, ContentEncoding, IBrowseDirectoryResult, ICreateSessionParams, IDirectoryEntry, IFetchContentResult, IWriteFileParams, IWriteFileResult, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../common/state/sessionProtocol.js';
import {
	PendingMessageKind,
	ResponsePartKind,
	SessionStatus,
	ToolCallConfirmationReason,
	ToolCallStatus,
	TurnState,
	type IResponsePart,
	type ISessionModelInfo,
	type ISessionSummary,
	type IToolCallCompletedState,
	type ITurn,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { AgentEventMapper } from './agentEventMapper.js';
import { ISessionDbUriFields, parseSessionDbUri } from './copilot/fileEditTracker.js';
import type { IProtocolSideEffectHandler } from './protocolServerHandler.js';
import { SessionStateManager } from './sessionStateManager.js';

/**
 * Options for constructing an {@link AgentSideEffects} instance.
 */
export interface IAgentSideEffectsOptions {
	/** Resolve the agent responsible for a given session URI. */
	readonly getAgent: (session: ProtocolURI) => IAgent | undefined;
	/** Observable set of registered agents. Triggers `root/agentsChanged` when it changes. */
	readonly agents: IObservable<readonly IAgent[]>;
	/** Session data service for cleaning up per-session data on disposal. */
	readonly sessionDataService: ISessionDataService;
}

/**
 * Shared implementation of agent side-effect handling.
 *
 * Routes client-dispatched actions to the correct agent backend, handles
 * session create/dispose/list operations, tracks pending permission requests,
 * and wires up agent progress events to the state manager.
 *
 * Used by both the Electron utility-process path ({@link AgentService}) and
 * the standalone WebSocket server (`agentHostServerMain`).
 */
export class AgentSideEffects extends Disposable implements IProtocolSideEffectHandler {

	/** Maps tool call IDs to the agent that owns them, for routing confirmations. */
	private readonly _toolCallAgents = new Map<string, string>();
	/** Per-agent event mapper instances (stateful for partId tracking). */
	private readonly _eventMappers = new Map<string, AgentEventMapper>();

	constructor(
		private readonly _stateManager: SessionStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
	) {
		super();

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents);
		}));
	}

	/**
	 * Fetches models from all agents and dispatches `root/agentsChanged`.
	 */
	private async _publishAgentInfos(agents: readonly IAgent[]): Promise<void> {
		const infos = await Promise.all(agents.map(async a => {
			const d = a.getDescriptor();
			let models: ISessionModelInfo[];
			try {
				const rawModels = await a.listModels();
				models = rawModels.map(m => ({
					id: m.id, provider: m.provider, name: m.name,
					maxContextWindow: m.maxContextWindow, supportsVision: m.supportsVision,
					policyState: m.policyState,
				}));
			} catch {
				models = [];
			}
			return { provider: d.provider, displayName: d.displayName, description: d.description, models };
		}));
		this._stateManager.dispatchServerAction({ type: ActionType.RootAgentsChanged, agents: infos });
	}

	// ---- Edit auto-approve --------------------------------------------------

	/**
	 * Default edit auto-approve patterns applied by the agent host.
	 * Matches the VS Code `chat.tools.edits.autoApprove` setting defaults.
	 */
	private static readonly _DEFAULT_EDIT_AUTO_APPROVE_PATTERNS: Readonly<Record<string, boolean>> = {
		'**/*': true,
		'**/.vscode/*.json': false,
		'**/.git/**': false,
		'**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
		'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
		'**/*.lock': false,
		'**/*-lock.{yaml,json}': false,
	};

	/**
	 * Returns whether a write to `filePath` should be auto-approved based on
	 * the built-in default patterns.
	 */
	private _shouldAutoApproveEdit(filePath: string): boolean {
		const patterns = AgentSideEffects._DEFAULT_EDIT_AUTO_APPROVE_PATTERNS;
		let approved = true;
		for (const [pattern, isApproved] of Object.entries(patterns)) {
			if (isApproved !== approved && globMatch(pattern, filePath)) {
				approved = isApproved;
			}
		}
		return approved;
	}

	// ---- Agent registration -------------------------------------------------

	/**
	 * Registers a progress-event listener on the given agent so that
	 * `IAgentProgressEvent`s are mapped to protocol actions and dispatched
	 * through the state manager. Returns a disposable that removes the
	 * listener.
	 */
	registerProgressListener(agent: IAgent): IDisposable {
		const disposables = new DisposableStore();
		let mapper = this._eventMappers.get(agent.id);
		if (!mapper) {
			mapper = new AgentEventMapper();
			this._eventMappers.set(agent.id, mapper);
		}
		const agentMapper = mapper;
		disposables.add(agent.onDidSessionProgress(e => {
			// Track tool calls so handleAction can route confirmations
			if (e.type === 'tool_start') {
				this._toolCallAgents.set(`${e.session.toString()}:${e.toolCallId}`, agent.id);
			}

			const sessionKey = e.session.toString();
			const turnId = this._stateManager.getActiveTurnId(sessionKey);
			if (turnId) {
				// Check if this is a write permission request that can be auto-approved
				// based on the built-in default patterns.
				if (e.type === 'tool_ready' && e.permissionKind === 'write' && e.permissionPath) {
					if (this._shouldAutoApproveEdit(e.permissionPath)) {
						this._logService.trace(`[AgentSideEffects] Auto-approving write to ${e.permissionPath}`);
						agent.respondToPermissionRequest(e.toolCallId, true);
						return;
					}
				}

				const actions = agentMapper.mapProgressEventToActions(e, sessionKey, turnId);
				if (actions) {
					if (Array.isArray(actions)) {
						for (const action of actions) {
							this._stateManager.dispatchServerAction(action);
						}
					} else {
						this._stateManager.dispatchServerAction(actions);
					}
				}
			}

			// After a turn completes (idle event), try to consume the next queued message
			if (e.type === 'idle') {
				this._tryConsumeNextQueuedMessage(sessionKey);
			}
		}));
		return disposables;
	}

	// ---- IProtocolSideEffectHandler -----------------------------------------

	handleAction(action: ISessionAction): void {
		switch (action.type) {
			case ActionType.SessionTurnStarted: {
				// Reset the event mapper's part tracking for the new turn
				for (const mapper of this._eventMappers.values()) {
					mapper.reset(action.session);
				}
				const agent = this._options.getAgent(action.session);
				if (!agent) {
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionError,
						session: action.session,
						turnId: action.turnId,
						error: { errorType: 'noAgent', message: 'No agent found for session' },
					});
					return;
				}
				const attachments = action.userMessage.attachments?.map((a): IAgentAttachment => ({
					type: a.type,
					path: a.path,
					displayName: a.displayName,
				}));
				agent.sendMessage(URI.parse(action.session), action.userMessage.text, attachments).catch(err => {
					this._logService.error('[AgentSideEffects] sendMessage failed', err);
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionError,
						session: action.session,
						turnId: action.turnId,
						error: { errorType: 'sendFailed', message: String(err) },
					});
				});
				break;
			}
			case ActionType.SessionToolCallConfirmed: {
				const toolCallKey = `${action.session}:${action.toolCallId}`;
				const agentId = this._toolCallAgents.get(toolCallKey);
				if (agentId) {
					this._toolCallAgents.delete(toolCallKey);
					const agent = this._options.agents.get().find(a => a.id === agentId);
					agent?.respondToPermissionRequest(action.toolCallId, action.approved);
				} else {
					this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
				}
				break;
			}
			case ActionType.SessionTurnCancelled: {
				const agent = this._options.getAgent(action.session);
				agent?.abortSession(URI.parse(action.session)).catch(err => {
					this._logService.error('[AgentSideEffects] abortSession failed', err);
				});
				break;
			}
			case ActionType.SessionModelChanged: {
				const agent = this._options.getAgent(action.session);
				agent?.changeModel?.(URI.parse(action.session), action.model).catch(err => {
					this._logService.error('[AgentSideEffects] changeModel failed', err);
				});
				break;
			}
			case ActionType.SessionPendingMessageSet:
			case ActionType.SessionPendingMessageRemoved:
			case ActionType.SessionQueuedMessagesReordered: {
				this._syncPendingMessages(action.session);
				break;
			}
		}
	}

	/**
	 * Pushes the current pending message state from the session to the agent.
	 * The server controls queued message consumption; only steering messages
	 * are forwarded to the agent for mid-turn injection.
	 */
	private _syncPendingMessages(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		const agent = this._options.getAgent(session);
		agent?.setPendingMessages?.(
			URI.parse(session),
			state.steeringMessage,
			[],
		);

		// Steering messages are consumed immediately by the agent;
		// remove from protocol state so clients see the consumption.
		if (state.steeringMessage) {
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionPendingMessageRemoved,
				session,
				kind: PendingMessageKind.Steering,
				id: state.steeringMessage.id,
			});
		}

		// If the session is idle, try to consume the next queued message
		this._tryConsumeNextQueuedMessage(session);
	}

	/**
	 * Consumes the next queued message by dispatching a server-initiated
	 * `SessionTurnStarted` action with `queuedMessageId` set. The reducer
	 * atomically creates the active turn and removes the message from the
	 * queue. Only consumes one message at a time; subsequent messages are
	 * consumed when the next `idle` event fires.
	 */
	private _tryConsumeNextQueuedMessage(session: ProtocolURI): void {
		// Bail if there's already an active turn
		if (this._stateManager.getActiveTurnId(session)) {
			return;
		}
		const state = this._stateManager.getSessionState(session);
		if (!state?.queuedMessages?.length) {
			return;
		}

		const msg = state.queuedMessages[0];
		const turnId = generateUuid();

		// Reset event mappers for the new turn (same as handleAction does for SessionTurnStarted)
		for (const mapper of this._eventMappers.values()) {
			mapper.reset(session);
		}

		// Dispatch server-initiated turn start; the reducer removes the queued message atomically
		this._stateManager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session,
			turnId,
			userMessage: msg.userMessage,
			queuedMessageId: msg.id,
		});

		// Send the message to the agent backend
		const agent = this._options.getAgent(session);
		if (!agent) {
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionError,
				session,
				turnId,
				error: { errorType: 'noAgent', message: 'No agent found for session' },
			});
			return;
		}
		const attachments = msg.userMessage.attachments?.map((a): IAgentAttachment => ({
			type: a.type,
			path: a.path,
			displayName: a.displayName,
		}));
		agent.sendMessage(URI.parse(session), msg.userMessage.text, attachments).catch(err => {
			this._logService.error('[AgentSideEffects] sendMessage failed (queued)', err);
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionError,
				session,
				turnId,
				error: { errorType: 'sendFailed', message: String(err) },
			});
		});
	}

	async handleCreateSession(command: ICreateSessionParams): Promise<void> {
		const provider = command.provider;
		if (!provider) {
			throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, 'No provider specified for session creation');
		}
		const agent = this._options.agents.get().find(a => a.id === provider);
		if (!agent) {
			throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, `No agent registered for provider: ${provider}`);
		}
		// Use the client-provided session URI per the protocol spec
		const session = command.session;
		await agent.createSession({
			provider,
			model: command.model,
			workingDirectory: command.workingDirectory,
			session: URI.parse(session),
		});
		const summary: ISessionSummary = {
			resource: session,
			provider,
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			workingDirectory: command.workingDirectory,
		};
		this._stateManager.createSession(summary);
		this._stateManager.dispatchServerAction({ type: ActionType.SessionReady, session });
	}

	handleDisposeSession(session: ProtocolURI): void {
		const agent = this._options.getAgent(session);
		agent?.disposeSession(URI.parse(session)).catch(() => { });
		this._stateManager.deleteSession(session);
	}

	async handleListSessions(): Promise<ISessionSummary[]> {
		const allSessions: ISessionSummary[] = [];
		for (const agent of this._options.agents.get()) {
			const sessions = await agent.listSessions();
			const provider = agent.id;
			for (const s of sessions) {
				allSessions.push({
					resource: s.session.toString(),
					provider,
					title: s.summary ?? 'Session',
					status: SessionStatus.Idle,
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
				});
			}
		}
		return allSessions;
	}

	/**
	 * Restores a session from a previous server lifetime into the state
	 * manager. Fetches the session's message history from the agent backend,
	 * reconstructs `ITurn[]`, and creates the session in the state manager.
	 *
	 * @throws {ProtocolError} if the session URI doesn't match any agent or
	 * the agent cannot retrieve the session messages.
	 */
	async handleRestoreSession(session: ProtocolURI): Promise<void> {
		// Already in state manager - nothing to do.
		if (this._stateManager.getSessionState(session)) {
			return;
		}

		const agent = this._options.getAgent(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${session}`);
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
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${session}: ${message}`);
		}
		const meta = allSessions.find(s => s.session.toString() === session);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${session}`);
		}

		const sessionUri = URI.parse(session);
		let messages;
		try {
			messages = await agent.getSessionMessages(sessionUri);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${session}: ${message}`);
		}
		const turns = this._buildTurnsFromMessages(messages);

		const summary: ISessionSummary = {
			resource: session,
			provider: agent.id,
			title: meta.summary ?? 'Session',
			status: SessionStatus.Idle,
			createdAt: meta.startTime,
			modifiedAt: meta.modifiedTime,
			workingDirectory: meta.workingDirectory,
		};

		this._stateManager.restoreSession(summary, turns);
		this._logService.info(`[AgentSideEffects] Restored session ${session} with ${turns.length} turns`);
	}

	/**
	 * Reconstructs completed `ITurn[]` from a sequence of agent session
	 * messages (user messages, assistant messages, tool starts, tool
	 * completions). Each user-message starts a new turn; the assistant
	 * message closes it.
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
				// Flush any in-progress turn (e.g. interrupted/cancelled
				// turn that never got a closing assistant message).
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

	handleGetResourceMetadata(): IResourceMetadata {
		const resources = this._options.agents.get().flatMap(a => a.getProtectedResources());
		return { resources };
	}

	async handleAuthenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		for (const agent of this._options.agents.get()) {
			const resources = agent.getProtectedResources();
			if (resources.some(r => r.resource === params.resource)) {
				const accepted = await agent.authenticate(params.resource, params.token);
				if (accepted) {
					return { authenticated: true };
				}
			}
		}
		return { authenticated: false };
	}

	async handleBrowseDirectory(uri: ProtocolURI): Promise<IBrowseDirectoryResult> {
		let stat;
		try {
			stat = await this._fileService.resolve(URI.parse(uri));
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

	getDefaultDirectory(): ProtocolURI {
		return URI.file(os.homedir()).toString();
	}

	async handleFetchContent(uri: ProtocolURI): Promise<IFetchContentResult> {
		// Handle session-db: URIs that reference file-edit content stored
		// in a per-session SQLite database.
		const dbFields = parseSessionDbUri(uri);
		if (dbFields) {
			return this._fetchSessionDbContent(dbFields);
		}

		try {
			const content = await this._fileService.readFile(URI.parse(uri));
			return {
				data: content.value.toString(),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} catch (_e) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri}`);
		}
	}

	async handleWriteFile(params: IWriteFileParams): Promise<IWriteFileResult> {
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

	private async _fetchSessionDbContent(fields: ISessionDbUriFields): Promise<IFetchContentResult> {
		const sessionUri = URI.parse(fields.sessionUri);
		const ref = this._options.sessionDataService.openDatabase(sessionUri);
		try {
			const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
			if (!content) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			const bytes = fields.part === 'before' ? content.beforeContent : content.afterContent;
			return {
				data: new TextDecoder().decode(bytes),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			ref.dispose();
		}
	}

	override dispose(): void {
		this._toolCallAgents.clear();
		super.dispose();
	}
}
