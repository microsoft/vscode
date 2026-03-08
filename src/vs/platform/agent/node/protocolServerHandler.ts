/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IActionEnvelope, INotification, isSessionAction } from '../common/state/sessionActions.js';
import { isActionKnownToVersion, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import type { IClientMessage, IServerMessage, IStateSnapshot } from '../common/state/sessionProtocol.js';
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
 * Server-side handler that manages protocol connections, routes client
 * messages to the state manager, and broadcasts actions/notifications
 * to subscribed clients.
 *
 * This replaces the ProxyChannel-based approach for transport-agnostic
 * protocol communication.
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

		// Accept new connections
		this._register(this._server.onConnection(transport => {
			this._handleNewConnection(transport);
		}));

		// Forward action envelopes to subscribed clients
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			this._replayBuffer.push(envelope);
			if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
				this._replayBuffer.shift();
			}
			this._broadcastAction(envelope);
		}));

		// Forward notifications to all connected clients
		this._register(this._stateManager.onDidEmitNotification(notification => {
			this._broadcastNotification(notification);
		}));
	}

	private _handleNewConnection(transport: IProtocolTransport): void {
		const disposables = new DisposableStore();
		let client: IConnectedClient | undefined;

		disposables.add(transport.onMessage(msg => {
			const message = msg as IClientMessage;
			switch (message.type) {
				case 'clientHello':
					client = this._handleClientHello(message, transport, disposables);
					break;
				case 'clientReconnect':
					client = this._handleClientReconnect(message, transport, disposables);
					break;
				case 'subscribe':
					if (client) {
						this._handleSubscribe(client, message.resource);
					}
					break;
				case 'unsubscribe':
					if (client) {
						client.subscriptions.delete(message.resource.toString());
					}
					break;
				case 'action':
					if (client) {
						const origin = { clientId: client.clientId, clientSeq: message.clientSeq };
						this._stateManager.dispatchClientAction(message.action, origin);
						this._sideEffectHandler.handleAction(message.action);
					}
					break;
				case 'command':
					if (client) {
						this._handleCommand(client, message.command);
					}
					break;
			}
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

	private _handleClientHello(
		message: Extract<IClientMessage, { type: 'clientHello' }>,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): IConnectedClient {
		this._logService.info(`[ProtocolServer] ClientHello: clientId=${message.clientId}, version=${message.protocolVersion}`);

		const client: IConnectedClient = {
			clientId: message.clientId,
			protocolVersion: message.protocolVersion,
			transport,
			subscriptions: new Set(),
			disposables,
		};
		this._clients.set(message.clientId, client);

		// Build snapshots for initial subscriptions
		const snapshots: IStateSnapshot[] = [];
		if (message.initialSubscriptions) {
			for (const uri of message.initialSubscriptions) {
				const snapshot = this._stateManager.getSnapshot(uri);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(uri.toString());
				}
			}
		}

		const hello: IServerMessage = {
			type: 'serverHello',
			protocolVersion: PROTOCOL_VERSION,
			serverSeq: this._stateManager.serverSeq,
			snapshots,
		};
		transport.send(hello);

		return client;
	}

	private _handleClientReconnect(
		message: Extract<IClientMessage, { type: 'clientReconnect' }>,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): IConnectedClient {
		this._logService.info(`[ProtocolServer] ClientReconnect: clientId=${message.clientId}, lastSeenSeq=${message.lastSeenServerSeq}`);

		const client: IConnectedClient = {
			clientId: message.clientId,
			protocolVersion: PROTOCOL_VERSION, // Reconnecting clients use current version
			transport,
			subscriptions: new Set(),
			disposables,
		};
		this._clients.set(message.clientId, client);

		// Check if we can replay from the buffer
		const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
		const canReplay = message.lastSeenServerSeq >= oldestBuffered;

		if (canReplay) {
			// Replay missed actions
			for (const sub of message.subscriptions) {
				client.subscriptions.add(sub.toString());
			}
			for (const envelope of this._replayBuffer) {
				if (envelope.serverSeq > message.lastSeenServerSeq) {
					if (this._isRelevantToClient(client, envelope)) {
						transport.send({ type: 'action', envelope });
					}
				}
			}
		} else {
			// Gap too large — send fresh snapshots
			const snapshots: IStateSnapshot[] = [];
			for (const sub of message.subscriptions) {
				const snapshot = this._stateManager.getSnapshot(sub);
				if (snapshot) {
					snapshots.push(snapshot);
					client.subscriptions.add(sub.toString());
				}
			}
			const response: IServerMessage = {
				type: 'reconnectResponse',
				serverSeq: this._stateManager.serverSeq,
				snapshots,
			};
			transport.send(response);
		}

		return client;
	}

	private _handleSubscribe(client: IConnectedClient, resource: URI): void {
		const snapshot = this._stateManager.getSnapshot(resource);
		if (snapshot) {
			client.subscriptions.add(resource.toString());
			client.transport.send(snapshot);
		}
	}

	private _handleCommand(
		client: IConnectedClient,
		command: Extract<IClientMessage, { type: 'command' }>['command'],
	): void {
		switch (command.type) {
			case 'listSessions':
				this._sideEffectHandler.handleListSessions().then(sessions => {
					client.transport.send({ type: 'listSessionsResponse', sessions });
				}).catch(err => {
					this._logService.error('[ProtocolServer] handleListSessions failed', err);
				});
				break;
			case 'createSession':
				this._sideEffectHandler.handleCreateSession(command);
				break;
			case 'disposeSession':
				this._sideEffectHandler.handleDisposeSession(command.session);
				break;
			// fetchContent and fetchTurns left for future implementation
		}
	}

	private _broadcastAction(envelope: IActionEnvelope): void {
		const actionMsg: IServerMessage = { type: 'action', envelope };
		for (const client of this._clients.values()) {
			if (this._isRelevantToClient(client, envelope)) {
				client.transport.send(actionMsg);
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		const notifMsg: IServerMessage = { type: 'notification', notification };
		for (const client of this._clients.values()) {
			client.transport.send(notifMsg);
		}
	}

	private _isRelevantToClient(client: IConnectedClient, envelope: IActionEnvelope): boolean {
		const action = envelope.action;
		// Version-based filtering: don't send actions the client doesn't understand
		if (!isActionKnownToVersion(action, client.protocolVersion)) {
			return false;
		}
		// Root actions go to clients subscribed to root
		if (action.type.startsWith('root/')) {
			return client.subscriptions.has(ROOT_STATE_URI.toString());
		}
		// Session actions go to clients subscribed to that session
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
	handleCreateSession(command: import('../common/state/sessionProtocol.js').ICreateSessionCommand): void;
	handleDisposeSession(session: URI): void;
	handleListSessions(): Promise<import('../common/state/sessionState.js').ISessionSummary[]>;
}
