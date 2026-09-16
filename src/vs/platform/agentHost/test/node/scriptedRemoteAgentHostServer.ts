/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import { chatReducer } from '../../common/state/sessionReducers.js';
import { ActionType, isChatAction, type ChatAction, type ChatTurnStartedAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, ResponsePartKind, ROOT_STATE_URI, SessionStatus, type ChatState, type RootState } from '../../common/state/sessionState.js';
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

/**
 * Minimal fixed-WebSocket Agent Host used by remote-provider integration tests.
 */
export class ScriptedRemoteAgentHostServer extends Disposable {
	static async create(catalog: RootState, logService: ILogService, response?: IScriptedRemoteAgentHostResponse): Promise<ScriptedRemoteAgentHostServer> {
		const server = await WebSocketProtocolServer.create({ port: 0, host: '127.0.0.1' }, logService);
		const fixture = new ScriptedRemoteAgentHostServer(server, catalog, response);
		try {
			await server.whenListening;
			return fixture;
		} catch (error) {
			fixture.dispose();
			throw error;
		}
	}

	private readonly _connections = this._register(new DisposableMap<IProtocolTransport, DisposableStore>());
	readonly createSessionCalls: IScriptedRemoteAgentHostCreateSessionCall[] = [];
	readonly receivedTurnStartedActions: ChatTurnStartedAction[] = [];

	get activeConnectionCount(): number {
		return this._connections.size;
	}

	get address(): string {
		return `ws://127.0.0.1:${this._server.boundPort}`;
	}

	private constructor(
		private readonly _server: WebSocketProtocolServer,
		private readonly _catalog: RootState,
		private readonly _response: IScriptedRemoteAgentHostResponse | undefined,
	) {
		super();
		this._register(_server);
		this._register(_server.onConnection(transport => this._acceptConnection(transport)));
	}

	private _acceptConnection(transport: IProtocolTransport): void {
		const connection = new DisposableStore();
		const state: IScriptedConnectionState = {
			serverSeq: 0,
		};
		this._connections.set(transport, connection);
		connection.add(Event.once(transport.onClose)(() => this._connections.deleteAndDispose(transport)));
		connection.add(transport.onMessage(message => this._acceptMessage(transport, state, message)));
		connection.add(transport);
	}

	private _acceptMessage(transport: IProtocolTransport, state: IScriptedConnectionState, message: ProtocolMessage): void {
		const sendAction = (action: ChatAction, origin?: { clientId: string; clientSeq: number }) => {
			if (!state.chatState || !state.downstreamChat) {
				throw new Error('Scripted downstream chat is not initialized');
			}
			state.chatState = chatReducer(state.chatState, action);
			transport.send({
				jsonrpc: '2.0',
				method: 'action',
				params: {
					channel: state.downstreamChat,
					action,
					serverSeq: ++state.serverSeq,
					origin,
				},
			});
		};
		if (isJsonRpcRequest(message)) {
			switch (message.method) {
				case 'initialize':
					state.clientId = message.params.clientId;
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							protocolVersion: PROTOCOL_VERSION,
							serverSeq: state.serverSeq,
							snapshots: [{ resource: ROOT_STATE_URI, state: this._catalog, fromSeq: state.serverSeq }],
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
					state.downstreamChat = buildDefaultChatUri(session);
					state.chatState = {
						resource: state.downstreamChat,
						title: 'Scripted downstream chat',
						status: SessionStatus.Idle,
						modifiedAt: new Date(0).toISOString(),
						turns: [],
					};
					transport.send({ jsonrpc: '2.0', id: message.id, result: null });
					return;
				}
				case 'subscribe':
					if (!state.chatState || message.params.channel !== state.downstreamChat) {
						throw new Error(`Unexpected scripted subscription: ${message.params.channel}`);
					}
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							snapshot: {
								resource: state.downstreamChat,
								state: state.chatState,
								fromSeq: state.serverSeq,
							},
						},
					});
					return;
			}
		}
		if (!this._response || !isJsonRpcNotification(message) || message.method !== 'dispatchAction' || !isChatAction(message.params.action)) {
			return;
		}
		const action = message.params.action;
		if (action.type !== ActionType.ChatTurnStarted) {
			return;
		}
		if (!state.clientId) {
			throw new Error('Scripted downstream client was not initialized');
		}
		this.receivedTurnStartedActions.push(action);
		sendAction({ ...action, startedAt: this._response.startedAt }, { clientId: state.clientId, clientSeq: message.params.clientSeq });
		sendAction({
			type: ActionType.ChatResponsePart,
			turnId: action.turnId,
			part: { kind: ResponsePartKind.Markdown, id: this._response.partId, content: '' },
		});
		sendAction({
			type: ActionType.ChatDelta,
			turnId: action.turnId,
			partId: this._response.partId,
			content: this._response.content,
		});
		sendAction({
			type: ActionType.ChatTurnComplete,
			turnId: action.turnId,
			duration: this._response.duration,
		});
	}
}

interface IScriptedConnectionState {
	clientId?: string;
	downstreamChat?: string;
	chatState?: ChatState;
	serverSeq: number;
}
