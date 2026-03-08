/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IActionEnvelope, INotification, isSessionAction } from '../common/state/sessionActions.js';
import { isActionKnownToVersion, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import {
	isJsonRpcRequest,
	isJsonRpcNotification,
	JSON_RPC_INTERNAL_ERROR,
	type ICreateSessionParams,
	type IDispatchActionParams,
	type IDisposeSessionParams,
	type IFetchTurnsParams,
	type IInitializeParams,
	type IProtocolMessage,
	type IReconnectParams,
	type IStateSnapshot,
	type ISubscribeParams,
	type IUnsubscribeParams,
} from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { SessionStateManager } from './sessionStateManager.js';

/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;

/**
 * Represents a connected protocol client with its subscription state.
 */
interface IConnectedClient {
	readonly clientId: string;
	readonly protocolVersion: number;
	readonly transport: IProtocolTransport;
	readonly subscriptions: Set<string>;
	readonly disposables: DisposableStore;
}

/**
 * Server-side handler that manages protocol connections, routes JSON-RPC
 * messages to the state manager, and broadcasts actions/notifications
 * to subscribed clients.
 */
export class ProtocolServerHandler extends Disposable {

	private readonly _clients = new Map<string, IConnectedClient>();
	private readonly _replayBuffer: IActionEnvelope[] = [];

	constructor(
		private readonly _stateManager: SessionStateManager,
		private readonly _server: IProtocolServer,
		private readonly _sideEffectHandler: IProtocolSideEffectHandler,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._server.onConnection(transport => {
			this._handleNewConnection(transport);
		}));

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			this._replayBuffer.push(envelope);
			if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
				this._replayBuffer.shift();
			}
			this._broadcastAction(envelope);
		}));

		this._register(this._stateManager.onDidEmitNotification(notification => {
			this._broadcastNotification(notification);
		}));
	}

	// ---- Connection handling -------------------------------------------------

	private _handleNewConnection(transport: IProtocolTransport): void {
		const disposables = new DisposableStore();
		let client: IConnectedClient | undefined;

		disposables.add(transport.onMessage(msg => {
			if (isJsonRpcRequest(msg)) {
				// Request — expects a correlated response
				if (!client) {
					return;
				}
				this._handleRequest(client, msg.method, msg.params, msg.id);
			} else if (isJsonRpcNotification(msg)) {
				// Notification — fire-and-forget
				switch (msg.method) {
					case 'initialize':
						client = this._handleInitialize(msg.params as IInitializeParams, transport, disposables);
						break;
					case 'reconnect':
						client = this._handleReconnect(msg.params as IReconnectParams, transport, disposables);
						break;
					case 'unsubscribe':
						if (client) {
							client.subscriptions.delete((msg.params as IUnsubscribeParams).resource.toString());
						}
						break;
					case 'dispatchAction':
						if (client) {
							const params = msg.params as IDispatchActionParams;
							const origin = { clientId: client.clientId, clientSeq: params.clientSeq };
							this._stateManager.dispatchClientAction(params.action, origin);
							this._sideEffectHandler.handleAction(params.action);
						}
						break;
				}
			}
			// Responses from the client (if any) are ignored on the server side.
		}));

		disposables.add(transport.onClose(() => {
			if (client) {
				this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}`);
				this._clients.delete(client.clientId);
			}
			disposables.dispose();
		}));

		disposables.add(transport);
	}

	// ---- Notifications (fire-and-forget) ------------------------------------

	private _handleInitialize(
		params: IInitializeParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): IConnectedClient {
		this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, version=${params.protocolVersion}`);

		const client: IConnectedClient = {
			clientId: params.clientId,
			protocolVersion: params.protocolVersion,
			transport,
			subscriptions: new Set(),
			disposables,
		};
		this._clients.set(params.clientId, client);

		const snapshots: IStateSnapshot[] = [];
		if (params.initialSubscriptions) {
			for (const uri of params.initialSubscriptions) {
				const snapshot = this._stateManager.getSnapshot(uri);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(uri.toString());
				}
			}
		}

		this._sendNotification(transport, 'serverHello', {
			protocolVersion: PROTOCOL_VERSION,
			serverSeq: this._stateManager.serverSeq,
			snapshots,
		});

		return client;
	}

	private _handleReconnect(
		params: IReconnectParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): IConnectedClient {
		this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);

		const client: IConnectedClient = {
			clientId: params.clientId,
			protocolVersion: PROTOCOL_VERSION,
			transport,
			subscriptions: new Set(),
			disposables,
		};
		this._clients.set(params.clientId, client);

		const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
		const canReplay = params.lastSeenServerSeq >= oldestBuffered;

		if (canReplay) {
			for (const sub of params.subscriptions) {
				client.subscriptions.add(sub.toString());
			}
			for (const envelope of this._replayBuffer) {
				if (envelope.serverSeq > params.lastSeenServerSeq) {
					if (this._isRelevantToClient(client, envelope)) {
						this._sendNotification(transport, 'action', { envelope });
					}
				}
			}
		} else {
			const snapshots: IStateSnapshot[] = [];
			for (const sub of params.subscriptions) {
				const snapshot = this._stateManager.getSnapshot(sub);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(sub.toString());
				}
			}
			this._sendNotification(transport, 'reconnectResponse', {
				serverSeq: this._stateManager.serverSeq,
				snapshots,
			});
		}

		return client;
	}

	// ---- Requests (expect a response) ---------------------------------------

	private _handleRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		this._handleRequestAsync(client, method, params).then(result => {
			client.transport.send({ jsonrpc: '2.0', id, result: result ?? null });
		}).catch(err => {
			this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
			client.transport.send({
				jsonrpc: '2.0',
				id,
				error: { code: JSON_RPC_INTERNAL_ERROR, message: String(err?.message ?? err) },
			});
		});
	}

	private async _handleRequestAsync(client: IConnectedClient, method: string, params: unknown): Promise<unknown> {
		switch (method) {
			case 'subscribe': {
				const p = params as ISubscribeParams;
				const snapshot = this._stateManager.getSnapshot(p.resource);
				if (snapshot) {
					client.subscriptions.add(p.resource.toString());
				}
				return snapshot ?? null;
			}
			case 'createSession': {
				await this._sideEffectHandler.handleCreateSession(params as ICreateSessionParams);
				return null;
			}
			case 'disposeSession': {
				this._sideEffectHandler.handleDisposeSession((params as IDisposeSessionParams).session);
				return null;
			}
			case 'listSessions': {
				const sessions = await this._sideEffectHandler.handleListSessions();
				return { sessions };
			}
			case 'fetchTurns': {
				const p = params as IFetchTurnsParams;
				const state = this._stateManager.getSessionState(p.session);
				if (state) {
					const turns = state.turns;
					const start = Math.max(0, p.startTurn);
					const end = Math.min(turns.length, start + p.count);
					return {
						session: p.session,
						startTurn: start,
						turns: turns.slice(start, end),
						totalTurns: turns.length,
					};
				}
				return {
					session: p.session,
					startTurn: p.startTurn,
					turns: [],
					totalTurns: 0,
				};
			}
			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	// ---- Broadcasting -------------------------------------------------------

	private _sendNotification(transport: IProtocolTransport, method: string, params: unknown): void {
		transport.send({ jsonrpc: '2.0', method, params });
	}

	private _broadcastAction(envelope: IActionEnvelope): void {
		const msg: IProtocolMessage = { jsonrpc: '2.0', method: 'action', params: { envelope } };
		for (const client of this._clients.values()) {
			if (this._isRelevantToClient(client, envelope)) {
				client.transport.send(msg);
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		const msg: IProtocolMessage = { jsonrpc: '2.0', method: 'notification', params: { notification } };
		for (const client of this._clients.values()) {
			client.transport.send(msg);
		}
	}

	private _isRelevantToClient(client: IConnectedClient, envelope: IActionEnvelope): boolean {
		const action = envelope.action;
		if (!isActionKnownToVersion(action, client.protocolVersion)) {
			return false;
		}
		if (action.type.startsWith('root/')) {
			return client.subscriptions.has(ROOT_STATE_URI.toString());
		}
		if (isSessionAction(action)) {
			return client.subscriptions.has(action.session.toString());
		}
		return false;
	}

	override dispose(): void {
		for (const client of this._clients.values()) {
			client.disposables.dispose();
		}
		this._clients.clear();
		this._replayBuffer.length = 0;
		super.dispose();
	}
}

/**
 * Interface for side effects that the protocol server delegates to.
 * These are operations that involve I/O, agent backends, etc.
 */
export interface IProtocolSideEffectHandler {
	handleAction(action: import('../common/state/sessionActions.js').ISessionAction): void;
	handleCreateSession(command: import('../common/state/sessionProtocol.js').ICreateSessionParams): Promise<void>;
	handleDisposeSession(session: URI): void;
	handleListSessions(): Promise<import('../common/state/sessionState.js').ISessionSummary[]>;
}
