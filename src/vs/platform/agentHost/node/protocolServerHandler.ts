/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, type IAgentService, type IAuthenticateParams } from '../common/agentService.js';
import type { ICommandMap } from '../common/state/protocol/messages.js';
import { IActionEnvelope, INotification, isSessionAction, type ISessionAction } from '../common/state/sessionActions.js';
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import {
	AHP_PROVIDER_NOT_FOUND,
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	isJsonRpcNotification,
	isJsonRpcRequest,
	JSON_RPC_INTERNAL_ERROR,
	ProtocolError,
	type IAhpServerNotification,
	type IInitializeParams,
	type IJsonRpcResponse,
	type IReconnectParams,
	type IStateSnapshot,
} from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI, SessionStatus } from '../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { SessionStateManager } from './sessionStateManager.js';

/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;

/** Build a JSON-RPC success response suitable for transport.send(). */
function jsonRpcSuccess(id: number, result: unknown): IJsonRpcResponse {
	return { jsonrpc: '2.0', id, result };
}

/** Build a JSON-RPC error response suitable for transport.send(). */
function jsonRpcError(id: number, code: number, message: string, data?: unknown): IJsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** Build a JSON-RPC error response from an unknown thrown value, preserving {@link ProtocolError} fields. */
function jsonRpcErrorFrom(id: number, err: unknown): IJsonRpcResponse {
	if (err instanceof ProtocolError) {
		return jsonRpcError(id, err.code, err.message, err.data);
	}
	const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
	return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}

/**
 * Methods handled by the request dispatcher. Excludes `initialize` and
 * `reconnect` which are handled during the handshake phase.
 */
type RequestMethod = Exclude<keyof ICommandMap, 'initialize' | 'reconnect' | 'authenticate'>;

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
 * Configuration for protocol-level concerns outside of IAgentService.
 */
export interface IProtocolServerConfig {
	/** Default directory returned to clients during the initialize handshake. */
	readonly defaultDirectory?: string;
}

/**
 * Server-side handler that manages protocol connections, routes JSON-RPC
 * messages to the agent service, and broadcasts actions/notifications
 * to subscribed clients.
 */
export class ProtocolServerHandler extends Disposable {

	private readonly _clients = new Map<string, IConnectedClient>();
	private readonly _replayBuffer: IActionEnvelope[] = [];

	private readonly _onDidChangeConnectionCount = this._register(new Emitter<number>());

	/** Fires with the current client count whenever a client connects or disconnects. */
	readonly onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _stateManager: SessionStateManager,
		private readonly _server: IProtocolServer,
		private readonly _config: IProtocolServerConfig,
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
						transport.send(jsonRpcErrorFrom(msg.id, err));
					}
					return;
				}
				if (!client && msg.method === 'reconnect') {
					try {
						const result = this._handleReconnect(msg.params, transport, disposables);
						client = result.client;
						transport.send(jsonRpcSuccess(msg.id, result.response));
					} catch (err) {
						transport.send(jsonRpcErrorFrom(msg.id, err));
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
							const action = msg.params.action as ISessionAction;
							this._agentService.dispatchAction(action, client.clientId, msg.params.clientSeq);
						}
						break;
				}
			}
			// Responses from the client (if any) are ignored on the server side.
		}));

		disposables.add(transport.onClose(() => {
			if (client && this._clients.get(client.clientId) === client) {
				this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}`);
				this._clients.delete(client.clientId);
				this._onDidChangeConnectionCount.fire(this._clients.size);
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
		this._onDidChangeConnectionCount.fire(this._clients.size);

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
				defaultDirectory: this._config.defaultDirectory,
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
		this._onDidChangeConnectionCount.fire(this._clients.size);

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
			try {
				const snapshot = await this._agentService.subscribe(URI.parse(params.resource));
				client.subscriptions.add(params.resource);
				return { snapshot };
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.resource}`);
			}
		},
		createSession: async (_client, params) => {
			let createdSession: URI;
			try {
				createdSession = await this._agentService.createSession({
					provider: params.provider,
					model: params.model,
					workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
					session: URI.parse(params.session),
				});
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
			}
			// Verify the provider honored the client-chosen session URI per the protocol contract
			if (createdSession.toString() !== URI.parse(params.session).toString()) {
				this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.session}`);
			}
			return null;
		},
		disposeSession: async (_client, params) => {
			await this._agentService.disposeSession(URI.parse(params.session));
			return null;
		},
		writeFile: async (_client, params) => {
			return this._agentService.writeFile(params);
		},
		listSessions: async () => {
			const sessions = await this._agentService.listSessions();
			const items = sessions.map(s => ({
				resource: s.session.toString(),
				provider: AgentSession.provider(s.session) ?? 'copilot',
				title: s.summary ?? 'Session',
				status: SessionStatus.Idle,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
				workingDirectory: s.workingDirectory?.toString(),
			}));
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
			return this._agentService.browseDirectory(URI.parse(params.uri));
		},
		fetchContent: async (_client, params) => {
			return this._agentService.fetchContent(URI.parse(params.uri));
		},
	};

	private _handleRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method as RequestMethod] : undefined;
		if (handler) {
			(handler as (client: IConnectedClient, params: unknown) => Promise<unknown>)(client, params).then(result => {
				this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
				client.transport.send(jsonRpcSuccess(id, result ?? null));
			}).catch(err => {
				this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
				client.transport.send(jsonRpcErrorFrom(id, err));
			});
			return;
		}

		// VS Code extension methods (not in the typed protocol maps yet)
		const extensionResult = this._handleExtensionRequest(method, params);
		if (extensionResult) {
			extensionResult.then(result => {
				client.transport.send(jsonRpcSuccess(id, result ?? null));
			}).catch(err => {
				this._logService.error(`[ProtocolServer] Extension request '${method}' failed`, err);
				client.transport.send(jsonRpcErrorFrom(id, err));
			});
			return;
		}

		client.transport.send(jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, `Unknown method: ${method}`));
	}

	/**
	 * Handle VS Code extension methods that are not yet part of the typed
	 * protocol. Returns a Promise if the method was recognized, undefined
	 * otherwise.
	 */
	private _handleExtensionRequest(method: string, params: unknown): Promise<unknown> | undefined {
		switch (method) {
			case 'getResourceMetadata':
				return this._agentService.getResourceMetadata();
			case 'authenticate': {
				const authParams = params as IAuthenticateParams;
				if (!authParams || typeof authParams.resource !== 'string' || typeof authParams.token !== 'string') {
					return Promise.reject(new ProtocolError(-32602, 'Invalid authenticate params'));
				}
				return this._agentService.authenticate(authParams);
			}
			case 'refreshModels':
				return this._agentService.refreshModels();
			case 'listAgents':
				return this._agentService.listAgents();
			case 'shutdown':
				return this._agentService.shutdown();
			default:
				return undefined;
		}
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
