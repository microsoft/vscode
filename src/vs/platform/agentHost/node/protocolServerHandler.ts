/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IActionEnvelope, INotification, isSessionAction, type ISessionAction } from '../common/state/sessionActions.js';
import { isActionKnownToVersion, MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import { protocolReviver, type AhpIncomingMessage } from '../common/state/protocol/protocolSerialization.js';
import type { IAhpRequest, IAhpClientNotification } from '../common/state/protocol/messages.js';
import {
	JSON_RPC_INTERNAL_ERROR,
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	ProtocolError,
	type IBrowseDirectoryResult,
	type ICreateSessionParams,
	type IInitializeParams,
	type IReconnectParams,
	type ISetAuthTokenParams,
	type IStateSnapshot,
} from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI, type ISessionSummary } from '../common/state/sessionState.js';
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

function isAhpRequest(msg: AhpIncomingMessage): msg is IAhpRequest {
	return 'method' in msg && 'id' in msg;
}

function isAhpNotification(msg: AhpIncomingMessage): msg is IAhpClientNotification {
	return 'method' in msg && !('id' in msg);
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

		disposables.add(transport.onMessage(raw => {
			const msg = protocolReviver(raw);
			if (isAhpRequest(msg)) {
				this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);

				// Handle initialize/reconnect as requests that set up the client
				if (!client && (msg.method === 'initialize' || msg.method === 'reconnect')) {
					try {
						let result: { client: IConnectedClient; response: unknown };
						if (msg.method === 'initialize') {
							result = this._handleInitialize(msg.params, transport, disposables);
						} else {
							result = this._handleReconnect(msg.params, transport, disposables);
						}
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
				this._handleRequest(client, msg, msg.id);
			} else if (isAhpNotification(msg)) {
				this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
				// Notification — fire-and-forget
				if (msg.method === 'unsubscribe') {
					if (client) {
						client.subscriptions.delete(msg.params.resource.toString());
					}
				} else if (msg.method === 'dispatchAction') {
					if (client) {
						const action = msg.params.action;
						this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(action.type)}`);
						const origin = { clientId: client.clientId, clientSeq: msg.params.clientSeq };
						this._stateManager.dispatchClientAction(action, origin);
						if (isSessionAction(action)) {
							this._sideEffectHandler.handleAction(action);
						}
					}
				} else {
					// VS Code-specific notifications not in the protocol maps
					const raw = msg as unknown as { method: string; params?: unknown };
					if (raw.method === 'setAuthToken') {
						const p = raw.params as ISetAuthTokenParams;
						this._sideEffectHandler.handleSetAuthToken(p.token);
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
					client.subscriptions.add(sub.toString());
				}
			}
			return { client, response: { type: 'snapshot', snapshots } };
		}
	}

	// ---- Requests (expect a response) ---------------------------------------

	private _handleRequest(client: IConnectedClient, req: IAhpRequest, id: number): void {
		this._handleRequestAsync(client, req).then(result => {
			this._logService.trace(`[ProtocolServer] Request '${req.method}' id=${id} succeeded`);
			client.transport.send({ jsonrpc: '2.0', id, result: result ?? null });
		}).catch(err => {
			this._logService.error(`[ProtocolServer] Request '${req.method}' failed`, err);
			const code = err instanceof ProtocolError ? err.code : JSON_RPC_INTERNAL_ERROR;
			const message = err instanceof ProtocolError
				? err.message
				: err instanceof Error && err.stack
					? err.stack
					: String(err?.message ?? err);
			client.transport.send({
				jsonrpc: '2.0',
				id,
				error: { code, message },
			});
		});
	}

	private async _handleRequestAsync(client: IConnectedClient, req: IAhpRequest): Promise<unknown> {
		switch (req.method) {
			case 'subscribe': {
				const snapshot = this._stateManager.getSnapshot(req.params.resource);
				if (snapshot) {
					client.subscriptions.add(req.params.resource.toString());
				}
				return snapshot ?? null;
			}
			case 'createSession': {
				const session = await this._sideEffectHandler.handleCreateSession(req.params);
				return { session };
			}
			case 'disposeSession': {
				this._sideEffectHandler.handleDisposeSession(req.params.session);
				return null;
			}
			case 'listSessions': {
				const sessions = await this._sideEffectHandler.handleListSessions();
				return { items: sessions };
			}
			case 'fetchTurns': {
				const state = this._stateManager.getSessionState(req.params.session);
				if (!state) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${req.params.session.toString()}`);
				}
				const turns = state.turns;
				const limit = Math.min(req.params.limit ?? 50, 100);

				let endIndex = turns.length;
				if (req.params.before) {
					const idx = turns.findIndex(t => t.id === req.params.before);
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
				return this._sideEffectHandler.handleBrowseDirectory(req.params.uri);
			}
			default:
				throw new Error(`Unknown method: ${req.method}`);
		}
	}

	// ---- Broadcasting -------------------------------------------------------

	private _broadcastAction(envelope: IActionEnvelope): void {
		this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
		const msg = { jsonrpc: '2.0' as const, method: 'action', params: { envelope } };
		for (const client of this._clients.values()) {
			if (this._isRelevantToClient(client, envelope)) {
				client.transport.send(msg);
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		const msg = { jsonrpc: '2.0' as const, method: 'notification', params: { notification } };
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
	handleAction(action: ISessionAction): void;
	handleCreateSession(command: ICreateSessionParams): Promise<URI>;
	handleDisposeSession(session: URI): void;
	handleListSessions(): Promise<ISessionSummary[]>;
	handleSetAuthToken(token: string): void;
	handleBrowseDirectory(uri: URI): Promise<IBrowseDirectoryResult>;
	/** Returns the server's default browsing directory, if available. */
	getDefaultDirectory?(): URI;
}
