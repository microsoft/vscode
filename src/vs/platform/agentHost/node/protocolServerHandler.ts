/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IActionEnvelope, INotification, isSessionAction } from '../common/state/sessionActions.js';
import { isActionKnownToVersion, MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import {
	isJsonRpcRequest,
	isJsonRpcNotification,
	JSON_RPC_INTERNAL_ERROR,
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	ProtocolError,
	type IBrowseDirectoryParams,
	type ICreateSessionParams,
	type IDispatchActionParams,
	type IDisposeSessionParams,
	type IFetchTurnsParams,
	type IInitializeParams,
	type IProtocolMessage,
	type IReconnectParams,
	type ISetAuthTokenParams,
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
				this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);

				// Handle initialize/reconnect as requests that set up the client
				if (!client && (msg.method === 'initialize' || msg.method === 'reconnect')) {
					try {
						const result = msg.method === 'initialize'
							? this._handleInitialize(msg.params as IInitializeParams, transport, disposables)
							: this._handleReconnect(msg.params as IReconnectParams, transport, disposables);
						client = result.client;
						transport.send({ jsonrpc: '2.0', id: msg.id, result: result.response });
					} catch (err) {
						const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
						const message = err instanceof Error ? err.message : String(err);
						transport.send({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
					}
					return;
				}

				if (!client) {
					return;
				}
				this._handleRequest(client, msg.method, msg.params, msg.id);
			} else if (isJsonRpcNotification(msg)) {
				this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
				// Notification — fire-and-forget
				switch (msg.method) {
					case 'unsubscribe':
						if (client) {
							client.subscriptions.delete((msg.params as IUnsubscribeParams).resource.toString());
						}
						break;
					case 'dispatchAction':
						if (client) {
							const params = msg.params as IDispatchActionParams;
							this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(params.action.type)}`);
							const origin = { clientId: client.clientId, clientSeq: params.clientSeq };
							this._stateManager.dispatchClientAction(params.action, origin);
							this._sideEffectHandler.handleAction(params.action);
						}
						break;
					case 'setAuthToken': {
						const p = msg.params as ISetAuthTokenParams;
						this._sideEffectHandler.handleSetAuthToken(p.token);
						break;
					}
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

	// ---- Handshake handlers ----------------------------------------------------

	private _handleInitialize(
		params: IInitializeParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; response: unknown } {
		this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, version=${params.protocolVersion}`);

		if (params.protocolVersion < MIN_PROTOCOL_VERSION) {
			throw new ProtocolError(
				AHP_UNSUPPORTED_PROTOCOL_VERSION,
				`Client protocol version ${params.protocolVersion} is below minimum ${MIN_PROTOCOL_VERSION}`,
			);
		}

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

		return {
			client,
			response: {
				protocolVersion: PROTOCOL_VERSION,
				serverSeq: this._stateManager.serverSeq,
				snapshots,
				homeDirectory: this._sideEffectHandler.getHomeDirectory?.(),
			},
		};
	}

	private _handleReconnect(
		params: IReconnectParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; response: unknown } {
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
			const actions: IActionEnvelope[] = [];
			for (const sub of params.subscriptions) {
				client.subscriptions.add(sub.toString());
			}
			for (const envelope of this._replayBuffer) {
				if (envelope.serverSeq > params.lastSeenServerSeq) {
					if (this._isRelevantToClient(client, envelope)) {
						actions.push(envelope);
					}
				}
			}
			return { client, response: { type: 'replay', actions } };
		} else {
			const snapshots: IStateSnapshot[] = [];
			for (const sub of params.subscriptions) {
				const resource = URI.revive(sub);
				const snapshot = this._stateManager.getSnapshot(resource);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(resource.toString());
				}
			}
			return { client, response: { type: 'snapshot', snapshots } };
		}
	}

	// ---- Requests (expect a response) ---------------------------------------

	private _handleRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		this._handleRequestAsync(client, method, params).then(result => {
			this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
			client.transport.send({ jsonrpc: '2.0', id, result: result ?? null });
		}).catch(err => {
			this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
			const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
			const message = err instanceof Error && err.stack
				? err.stack
				: String(err?.message ?? err);
			client.transport.send({
				jsonrpc: '2.0',
				id,
				error: { code, message },
			});
		});
	}

	private async _handleRequestAsync(client: IConnectedClient, method: string, params: unknown): Promise<unknown> {
		switch (method) {
			case 'subscribe': {
				const p = params as ISubscribeParams;
				const resource = URI.revive(p.resource);
				const snapshot = this._stateManager.getSnapshot(resource);
				if (snapshot) {
					client.subscriptions.add(resource.toString());
				}
				return snapshot ?? null;
			}
			case 'createSession': {
				const session = await this._sideEffectHandler.handleCreateSession(params as ICreateSessionParams);
				return { session };
			}
			case 'disposeSession': {
				this._sideEffectHandler.handleDisposeSession(URI.revive((params as IDisposeSessionParams).session));
				return null;
			}
			case 'listSessions': {
				const sessions = await this._sideEffectHandler.handleListSessions();
				return { sessions };
			}
			case 'fetchTurns': {
				const p = params as IFetchTurnsParams;
				const session = URI.revive(p.session);
				const state = this._stateManager.getSessionState(session);
				if (!state) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${session.toString()}`);
				}
				const turns = state.turns;
				const limit = Math.min(p.limit ?? 50, 100);

				let endIndex = turns.length;
				if (p.before) {
					const idx = turns.findIndex(t => t.id === p.before);
					if (idx !== -1) {
						endIndex = idx;
					}
				}

				const startIndex = Math.max(0, endIndex - limit);
				return {
					turns: turns.slice(startIndex, endIndex),
					hasMore: startIndex > 0,
				};
			}
			case 'browseDirectory': {
				const p = params as IBrowseDirectoryParams;
				return this._sideEffectHandler.handleBrowseDirectory(p.path);
			}
			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	// ---- Broadcasting -------------------------------------------------------

	private _broadcastAction(envelope: IActionEnvelope): void {
		this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
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
	handleCreateSession(command: import('../common/state/sessionProtocol.js').ICreateSessionParams): Promise<URI>;
	handleDisposeSession(session: URI): void;
	handleListSessions(): Promise<import('../common/state/sessionState.js').ISessionSummary[]>;
	handleSetAuthToken(token: string): void;
	handleBrowseDirectory(path: string): Promise<import('../common/state/sessionProtocol.js').IBrowseDirectoryResult>;
	/** Returns the server's home directory, if available. */
	getHomeDirectory?(): string;
}
