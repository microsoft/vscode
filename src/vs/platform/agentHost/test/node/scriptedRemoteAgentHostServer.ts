/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import { chatReducer, sessionReducer } from '../../common/state/sessionReducers.js';
import { ActionType, isChatAction, isSessionAction, type ChatAction, type ChatToolCallCompleteAction, type ChatTurnStartedAction, type SessionAction } from '../../common/state/sessionActions.js';
import { ReconnectResultType } from '../../common/state/protocol/commands.js';
import { SessionInputRequestKind, type SessionState, type SessionToolClientExecutionRequest, type SessionToolConfirmationRequest } from '../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, type ChatState, type RootState, type ToolCallResult } from '../../common/state/sessionState.js';
import { isJsonRpcNotification, isJsonRpcRequest, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { WebSocketProtocolServer } from '../../node/webSocketTransport.js';

export interface IScriptedRemoteAgentHostResponse {
	readonly startedAt: string;
	readonly partId: string;
	readonly content: string;
	readonly duration: number;
}

export interface IScriptedRemoteAgentHostCreateSessionCall {
	readonly channel: string;
	readonly provider: string;
	readonly workingDirectories: readonly string[] | undefined;
}

export interface IScriptedRemoteAgentHostClientTool {
	readonly name: string;
	readonly displayName: string;
	readonly input: string;
	readonly toolCallId: string;
	readonly requiresConfirmation?: boolean;
}

interface IScriptedSession {
	readonly session: string;
	readonly chat: string;
	sessionState: SessionState;
	chatState: ChatState;
}

interface IScriptedClientToolInvocation {
	readonly session: string;
	readonly chat: string;
	readonly request: SessionToolClientExecutionRequest;
}

/**
 * Minimal fixed-WebSocket Agent Host used by remote-provider integration tests.
 */
export class ScriptedRemoteAgentHostServer extends Disposable {
	static async create(catalog: RootState, logService: ILogService, response?: IScriptedRemoteAgentHostResponse, clientTool?: IScriptedRemoteAgentHostClientTool): Promise<ScriptedRemoteAgentHostServer> {
		const server = await WebSocketProtocolServer.create({ port: 0, host: '127.0.0.1' }, logService);
		const fixture = new ScriptedRemoteAgentHostServer(server, catalog, response, clientTool);
		try {
			await server.whenListening;
			return fixture;
		} catch (error) {
			fixture.dispose();
			throw error;
		}
	}

	private readonly _connections = this._register(new DisposableMap<IProtocolTransport, DisposableStore>());
	private readonly _sessions = new Map<string, IScriptedSession>();
	private _serverSeq = 0;
	private _lastClientToolInvocation: IScriptedClientToolInvocation | undefined;
	readonly createSessionCalls: IScriptedRemoteAgentHostCreateSessionCall[] = [];
	readonly receivedTurnStartedActions: ChatTurnStartedAction[] = [];
	readonly receivedClientToolResults: ToolCallResult[] = [];

	get activeConnectionCount(): number {
		return this._connections.size;
	}

	get advertisedClientTools(): readonly string[] {
		return [...this._sessions.values()].flatMap(session =>
			session.sessionState.activeClients.flatMap(client => client.tools.map(tool => tool.name))
		);
	}

	get address(): string {
		return `ws://127.0.0.1:${this._server.boundPort}`;
	}

	private constructor(
		private readonly _server: WebSocketProtocolServer,
		private readonly _catalog: RootState,
		private readonly _response: IScriptedRemoteAgentHostResponse | undefined,
		private readonly _clientTool: IScriptedRemoteAgentHostClientTool | undefined,
	) {
		super();
		this._register(_server);
		this._register(_server.onConnection(transport => this._acceptConnection(transport)));
	}

	private _acceptConnection(transport: IProtocolTransport): void {
		const connection = new DisposableStore();
		const state: IScriptedConnectionState = {};
		this._connections.set(transport, connection);
		connection.add(Event.once(transport.onClose)(() => this._connections.deleteAndDispose(transport)));
		connection.add(transport.onMessage(message => this._acceptMessage(transport, state, message)));
		connection.add(transport);
	}

	private _acceptMessage(transport: IProtocolTransport, state: IScriptedConnectionState, message: ProtocolMessage): void {
		if (isJsonRpcRequest(message)) {
			switch (message.method) {
				case 'ping':
					transport.send({ jsonrpc: '2.0', id: message.id, result: null });
					return;
				case 'initialize':
					state.clientId = message.params.clientId;
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							protocolVersion: PROTOCOL_VERSION,
							serverSeq: this._serverSeq,
							snapshots: [{ resource: ROOT_STATE_URI, state: this._catalog, fromSeq: this._serverSeq }],
						},
					});
					return;
				case 'reconnect':
					state.clientId = message.params.clientId;
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							type: ReconnectResultType.Snapshot,
							snapshots: message.params.subscriptions
								.map(resource => this._snapshot(resource))
								.filter(snapshot => snapshot !== undefined),
						},
					});
					return;
				case 'resolveSessionConfig':
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							schema: { type: 'object', properties: {} },
							values: message.params.config ?? {},
						},
					});
					return;
				case 'createSession': {
					if (!message.params.provider) {
						throw new Error('Scripted downstream session requires a provider');
					}
					this.createSessionCalls.push({
						channel: message.params.channel,
						provider: message.params.provider,
						workingDirectories: message.params.workingDirectories,
					});
					const session = URI.parse(message.params.channel);
					const chat = buildDefaultChatUri(session);
					this._sessions.set(session.toString(), {
						session: session.toString(),
						chat,
						sessionState: {
							provider: message.params.provider,
							title: 'Scripted downstream session',
							status: SessionStatus.Idle,
							lifecycle: SessionLifecycle.Ready,
							activeClients: message.params.activeClient ? [message.params.activeClient] : [],
							chats: [],
						},
						chatState: {
							resource: chat,
							title: 'Scripted downstream chat',
							status: SessionStatus.Idle,
							modifiedAt: new Date(0).toISOString(),
							turns: [],
						},
					});
					transport.send({ jsonrpc: '2.0', id: message.id, result: null });
					return;
				}
				case 'subscribe': {
					const snapshot = this._snapshot(message.params.channel);
					if (!snapshot) {
						throw new Error(`Unexpected scripted subscription: ${message.params.channel}`);
					}
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: { snapshot },
					});
					return;
				}
				case 'disposeSession':
					this._sessions.delete(message.params.channel);
					transport.send({ jsonrpc: '2.0', id: message.id, result: null });
					return;
			}
		}
		if (!isJsonRpcNotification(message) || message.method !== 'dispatchAction') {
			return;
		}
		const scripted = this._findSession(message.params.channel);
		if (!scripted) {
			return;
		}
		const origin = state.clientId ? { clientId: state.clientId, clientSeq: message.params.clientSeq } : undefined;
		if (isSessionAction(message.params.action)) {
			this._sendSessionAction(transport, scripted, message.params.action, origin);
			return;
		}
		if (!isChatAction(message.params.action)) {
			return;
		}
		const action = message.params.action;
		if (action.type === ActionType.ChatToolCallConfirmed) {
			this._confirmClientTool(transport, scripted, action, origin);
			return;
		}
		if (action.type === ActionType.ChatToolCallComplete) {
			this._completeClientTool(transport, scripted, action, origin);
			return;
		}
		if (action.type === ActionType.ChatTurnCancelled) {
			const confirmations = scripted.sessionState.inputNeeded?.filter(request =>
				request.kind === SessionInputRequestKind.ToolConfirmation && request.turnId === action.turnId) ?? [];
			for (const confirmation of confirmations) {
				this._sendSessionAction(transport, scripted, {
					type: ActionType.SessionInputNeededRemoved,
					id: confirmation.id,
				});
			}
			this._sendChatAction(transport, scripted, action, origin);
			return;
		}
		if (action.type !== ActionType.ChatTurnStarted) {
			return;
		}
		if (!state.clientId) {
			throw new Error('Scripted downstream client was not initialized');
		}
		this.receivedTurnStartedActions.push(action);
		const startedAction = this._response ? { ...action, startedAt: this._response.startedAt } : action;
		this._sendChatAction(transport, scripted, startedAction, origin);
		if (this._clientTool) {
			this._startClientTool(transport, scripted, action, state.clientId);
		} else {
			this._completeTurn(transport, scripted, action.turnId);
		}
	}

	replayClientToolInvocation(): void {
		const invocation = this._lastClientToolInvocation;
		if (!invocation) {
			throw new Error('No scripted client tool invocation to replay');
		}
		const scripted = this._sessions.get(invocation.session);
		if (!scripted) {
			throw new Error(`Missing scripted session: ${invocation.session}`);
		}
		for (const transport of this._connections.keys()) {
			this._sendSessionAction(transport, scripted, {
				type: ActionType.SessionInputNeededSet,
				request: invocation.request,
			});
		}
	}

	disconnectClients(): void {
		for (const transport of [...this._connections.keys()]) {
			this._connections.deleteAndDispose(transport);
		}
	}

	private _snapshot(resource: string): { readonly resource: string; readonly state: RootState | SessionState | ChatState; readonly fromSeq: number } | undefined {
		if (resource === ROOT_STATE_URI) {
			return { resource, state: this._catalog, fromSeq: this._serverSeq };
		}
		const scripted = this._findSession(resource);
		if (!scripted) {
			return undefined;
		}
		if (resource === scripted.session) {
			return { resource, state: scripted.sessionState, fromSeq: this._serverSeq };
		}
		if (resource === scripted.chat) {
			return { resource, state: scripted.chatState, fromSeq: this._serverSeq };
		}
		return undefined;
	}

	private _findSession(resource: string): IScriptedSession | undefined {
		const direct = this._sessions.get(resource);
		if (direct) {
			return direct;
		}
		for (const scripted of this._sessions.values()) {
			if (scripted.chat === resource) {
				return scripted;
			}
		}
		return undefined;
	}

	private _sendSessionAction(transport: IProtocolTransport, scripted: IScriptedSession, action: SessionAction, origin?: { readonly clientId: string; readonly clientSeq: number }): void {
		scripted.sessionState = sessionReducer(scripted.sessionState, action);
		this._sendAction(transport, scripted.session, action, origin);
	}

	private _sendChatAction(transport: IProtocolTransport, scripted: IScriptedSession, action: ChatAction, origin?: { readonly clientId: string; readonly clientSeq: number }): void {
		scripted.chatState = chatReducer(scripted.chatState, action);
		this._sendAction(transport, scripted.chat, action, origin);
	}

	private _sendAction(transport: IProtocolTransport, channel: string, action: SessionAction | ChatAction, origin?: { readonly clientId: string; readonly clientSeq: number }): void {
		transport.send({
			jsonrpc: '2.0',
			method: 'action',
			params: {
				channel,
				action,
				serverSeq: ++this._serverSeq,
				origin,
			},
		});
	}

	private _startClientTool(transport: IProtocolTransport, scripted: IScriptedSession, turn: ChatTurnStartedAction, clientId: string): void {
		const tool = this._clientTool;
		if (!tool) {
			return;
		}
		const activeClient = scripted.sessionState.activeClients.find(client => client.clientId === clientId);
		if (!activeClient?.tools.some(candidate => candidate.name === tool.name)) {
			throw new Error(`Scripted client tool is not registered: ${tool.name}`);
		}
		const contributor = { kind: ToolCallContributorKind.Client, clientId } as const;
		this._sendChatAction(transport, scripted, {
			type: ActionType.ChatToolCallStart,
			turnId: turn.turnId,
			toolCallId: tool.toolCallId,
			toolName: tool.name,
			displayName: tool.displayName,
			contributor,
		});
		this._sendChatAction(transport, scripted, {
			type: ActionType.ChatToolCallReady,
			turnId: turn.turnId,
			toolCallId: tool.toolCallId,
			invocationMessage: tool.displayName,
			toolInput: tool.input,
			...(tool.requiresConfirmation ? {} : { confirmed: ToolCallConfirmationReason.UserAction }),
			contributor,
		});
		if (tool.requiresConfirmation) {
			const request: SessionToolConfirmationRequest = {
				id: `toolConfirmation:${scripted.chat}:${turn.turnId}:${tool.toolCallId}`,
				kind: SessionInputRequestKind.ToolConfirmation,
				chat: scripted.chat,
				turnId: turn.turnId,
				toolCall: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: tool.toolCallId,
					toolName: tool.name,
					displayName: tool.displayName,
					invocationMessage: tool.displayName,
					toolInput: tool.input,
					contributor,
				},
			};
			this._sendSessionAction(transport, scripted, {
				type: ActionType.SessionInputNeededSet,
				request,
			});
			return;
		}
		this._startClientToolExecution(transport, scripted, turn.turnId, clientId, ToolCallConfirmationReason.UserAction);
	}

	private _confirmClientTool(
		transport: IProtocolTransport,
		scripted: IScriptedSession,
		action: Extract<ChatAction, { type: ActionType.ChatToolCallConfirmed }>,
		origin: { readonly clientId: string; readonly clientSeq: number } | undefined,
	): void {
		const confirmation = scripted.sessionState.inputNeeded?.find((request): request is SessionToolConfirmationRequest =>
			request.kind === SessionInputRequestKind.ToolConfirmation
			&& request.turnId === action.turnId
			&& request.toolCall.toolCallId === action.toolCallId);
		const contributor = confirmation?.toolCall.contributor;
		if (!confirmation
			|| contributor?.kind !== ToolCallContributorKind.Client) {
			return;
		}
		this._sendChatAction(transport, scripted, action, origin);
		this._sendSessionAction(transport, scripted, {
			type: ActionType.SessionInputNeededRemoved,
			id: confirmation.id,
		});
		if (!action.approved) {
			this._completeTurn(transport, scripted, action.turnId);
			return;
		}
		this._startClientToolExecution(transport, scripted, action.turnId, contributor.clientId, action.confirmed);
	}

	private _startClientToolExecution(
		transport: IProtocolTransport,
		scripted: IScriptedSession,
		turnId: string,
		clientId: string,
		confirmed: ToolCallConfirmationReason,
	): void {
		const tool = this._clientTool;
		if (!tool) {
			return;
		}
		const contributor = { kind: ToolCallContributorKind.Client, clientId } as const;
		const request: SessionToolClientExecutionRequest = {
			id: `toolClientExecution:${scripted.chat}:${turnId}:${tool.toolCallId}`,
			kind: SessionInputRequestKind.ToolClientExecution,
			chat: scripted.chat,
			turnId,
			clientId,
			toolCall: {
				status: ToolCallStatus.Running,
				toolCallId: tool.toolCallId,
				toolName: tool.name,
				displayName: tool.displayName,
				invocationMessage: tool.displayName,
				toolInput: tool.input,
				confirmed,
				contributor,
			},
		};
		this._lastClientToolInvocation = { session: scripted.session, chat: scripted.chat, request };
		this._sendSessionAction(transport, scripted, {
			type: ActionType.SessionInputNeededSet,
			request,
		});
	}

	private _completeClientTool(
		transport: IProtocolTransport,
		scripted: IScriptedSession,
		action: ChatToolCallCompleteAction,
		origin: { readonly clientId: string; readonly clientSeq: number } | undefined,
	): void {
		this.receivedClientToolResults.push(action.result);
		this._sendChatAction(transport, scripted, action, origin);
		const invocation = this._lastClientToolInvocation;
		if (invocation) {
			this._sendSessionAction(transport, scripted, {
				type: ActionType.SessionInputNeededRemoved,
				id: invocation.request.id,
			});
		}
		this._completeTurn(transport, scripted, action.turnId);
	}

	private _completeTurn(transport: IProtocolTransport, scripted: IScriptedSession, turnId: string): void {
		if (!this._response) {
			return;
		}
		this._sendChatAction(transport, scripted, {
			type: ActionType.ChatResponsePart,
			turnId,
			part: { kind: ResponsePartKind.Markdown, id: this._response.partId, content: '' },
		});
		this._sendChatAction(transport, scripted, {
			type: ActionType.ChatDelta,
			turnId,
			partId: this._response.partId,
			content: this._response.content,
		});
		this._sendChatAction(transport, scripted, {
			type: ActionType.ChatTurnComplete,
			turnId,
			duration: this._response.duration,
		});
	}
}

interface IScriptedConnectionState {
	clientId?: string;
}
