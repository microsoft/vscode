/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { ICommandMap } from '../common/state/protocol/messages.js';
import { IActionEnvelope, INotification, isSessionAction, type ISessionAction } from '../common/state/sessionActions.js';
import { isActionKnownToVersion, MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import {
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	isJsonRpcNotification,
	isJsonRpcRequest,
	JSON_RPC_INTERNAL_ERROR,
	ProtocolError,
	type IAhpServerNotification,
	type IBrowseDirectoryResult,
	type ICreateSessionParams,
	type IInitializeParams,
	type IJsonRpcResponse,
	type IReconnectParams,
	type ISetAuthTokenParams,
	type IStateSnapshot,
} from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI, type ISessionSummary, type URI } from '../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { SessionStateManager } from './sessionStateManager.js';

/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;

/** Build a JSON-RPC success response suitable for transport.send(). */
function jsonRpcSuccess(id: number, result: unknown): IJsonRpcResponse {
	return { jsonrpc: '2.0', id, result };
}

/** Build a JSON-RPC error response suitable for transport.send(). */
function jsonRpcError(id: number, code: number, message: string): IJsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Methods handled by the request dispatcher. Excludes `initialize` and
 * `reconnect` which are handled during the handshake phase.
 */
type RequestMethod = Exclude<keyof ICommandMap, 'initialize' | 'reconnect'>;

/**
 * Typed handler map: each key is a request method, each value is a handler
 * that receives the correctly-typed params and must return the correctly-typed
 * result. The compiler will error if a handler returns the wrong shape.
 */
type RequestHandlerMap = {
	[M in RequestMethod]: (client: IConnectedClient, params: ICommandMap[M]['params']) => Promise<ICommandMap[M]['result']>;
};

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
				if (!client && msg.method === 'initialize') {
					try {
						const result = this._handleInitialize(msg.params, transport, disposables);
						client = result.client;
						transport.send(jsonRpcSuccess(msg.id, result.response));
					} catch (err) {
						const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
						const message = err instanceof Error ? err.message : String(err);
						transport.send(jsonRpcError(msg.id, code, message));
					}
					return;
				}
				if (!client && msg.method === 'reconnect') {
					try {
						const result = this._handleReconnect(msg.params, transport, disposables);
						client = result.client;
						transport.send(jsonRpcSuccess(msg.id, result.response));
					} catch (err) {
						const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
						const message = err instanceof Error ? err.message : String(err);
						transport.send(jsonRpcError(msg.id, code, message));
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
							client.subscriptions.delete(msg.params.resource);
						}
						break;
					case 'dispatchAction':
						if (client) {
							this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(msg.params.action.type)}`);
							const origin = { clientId: client.clientId, clientSeq: msg.params.clientSeq };
							const action = msg.params.action as ISessionAction;
							this._stateManager.dispatchClientAction(action, origin);
							this._sideEffectHandler.handleAction(action);
						}
						break;
					default: {
						// VS Code extension: setAuthToken (not part of the protocol spec)
						const method = msg.method as string;
						if (method === 'setAuthToken') {
							const p = msg.params as unknown as ISetAuthTokenParams;
							this._sideEffectHandler.handleSetAuthToken(p.token);
						}
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
				defaultDirectory: this._sideEffectHandler.getDefaultDirectory?.(),
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
				const snapshot = this._stateManager.getSnapshot(sub);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(sub);
				}
			}
			return { client, response: { type: 'snapshot', snapshots } };
		}
	}

	// ---- Requests (expect a response) ---------------------------------------

	/**
	 * Methods handled by the request dispatcher (excludes initialize/reconnect
	 * which are handled during the handshake phase).
	 */
	private readonly _requestHandlers: RequestHandlerMap = {
		subscribe: async (client, params) => {
			const snapshot = this._stateManager.getSnapshot(params.resource);
			if (!snapshot) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.resource}`);
			}
			client.subscriptions.add(params.resource);
			return { snapshot };
		},
		createSession: async (_client, params) => {
			await this._sideEffectHandler.handleCreateSession(params);
			return null;
		},
		disposeSession: async (_client, params) => {
			this._sideEffectHandler.handleDisposeSession(params.session);
			return null;
		},
		listSessions: async () => {
			const items = await this._sideEffectHandler.handleListSessions();
			return { items };
		},
		fetchTurns: async (_client, params) => {
			const state = this._stateManager.getSessionState(params.session);
			if (!state) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.session}`);
			}
			const turns = state.turns;
			const limit = Math.min(params.limit ?? 50, 100);

			let endIndex = turns.length;
			if (params.before) {
				const idx = turns.findIndex(t => t.id === params.before);
				if (idx !== -1) {
					endIndex = idx;
				}
			}

			const startIndex = Math.max(0, endIndex - limit);
			return {
				turns: turns.slice(startIndex, endIndex),
				hasMore: startIndex > 0,
			};
		},
		browseDirectory: async (_client, params) => {
			return this._sideEffectHandler.handleBrowseDirectory(params.uri);
		},
		fetchContent: async () => {
			throw new Error('fetchContent not implemented');
		},
	};

	private _handleRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method as RequestMethod] : undefined;
		if (!handler) {
			client.transport.send(jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, `Unknown method: ${method}`));
			return;
		}
		(handler as (client: IConnectedClient, params: unknown) => Promise<unknown>)(client, params).then(result => {
			this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
			client.transport.send(jsonRpcSuccess(id, result ?? null));
		}).catch(err => {
			this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
			const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
			const message = err instanceof ProtocolError
				? err.message
				: err instanceof Error && err.stack
					? err.stack
					: String(err?.message ?? err);
			client.transport.send(jsonRpcError(id, code, message));
		});
	}

	// ---- Broadcasting -------------------------------------------------------

	private _broadcastAction(envelope: IActionEnvelope): void {
		this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
		const msg: IAhpServerNotification<'action'> = { jsonrpc: '2.0', method: 'action', params: envelope };
		for (const client of this._clients.values()) {
			if (this._isRelevantToClient(client, envelope)) {
				client.transport.send(msg);
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		const msg: IAhpServerNotification<'notification'> = { jsonrpc: '2.0', method: 'notification', params: { notification } };
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
			return client.subscriptions.has(ROOT_STATE_URI);
		}
		if (isSessionAction(action)) {
			return client.subscriptions.has(action.session);
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
	handleAction(action: ISessionAction): void;
	handleCreateSession(command: ICreateSessionParams): Promise<void>;
	handleDisposeSession(session: URI): void;
	handleListSessions(): Promise<ISessionSummary[]>;
	handleSetAuthToken(token: string): void;
	handleBrowseDirectory(uri: URI): Promise<IBrowseDirectoryResult>;
	/** Returns the server's default browsing directory, if available. */
	getDefaultDirectory?(): URI;
}
