/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol client for communicating with a remote agent host process.
// Wraps WebSocketClientTransport and SessionClientState to provide a
// higher-level API matching IAgentService.

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, IAgentConnection, IAgentCreateSessionConfig, IAgentDescriptor, IAgentSessionMetadata } from '../common/agentService.js';
import type { IClientNotificationMap, ICommandMap } from '../common/state/protocol/messages.js';
import type { IActionEnvelope, INotification, ISessionAction } from '../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcResponse, type IJsonRpcResponse, type IProtocolMessage, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import type { ISessionSummary } from '../common/state/sessionState.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';

/**
 * A protocol-level client for a single remote agent host connection.
 * Manages the WebSocket transport, handshake, subscriptions, action dispatch,
 * and command/response correlation.
 *
 * Implements {@link IAgentConnection} so consumers can program against
 * a single interface regardless of whether the agent host is local or remote.
 */
export class RemoteAgentHostProtocolClient extends Disposable implements IAgentConnection {

	declare readonly _serviceBrand: undefined;

	private readonly _clientId = generateUuid();
	private readonly _transport: WebSocketClientTransport;
	private _serverSeq = 0;
	private _nextClientSeq = 1;
	private _defaultDirectory: string | undefined;

	private readonly _onDidAction = this._register(new Emitter<IActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	/** Pending JSON-RPC requests keyed by request id. */
	private readonly _pendingRequests = new Map<number, DeferredPromise<unknown>>();
	private _nextRequestId = 1;

	get clientId(): string {
		return this._clientId;
	}

	get address(): string {
		return this._transport['_address'];
	}

	get defaultDirectory(): string | undefined {
		return this._defaultDirectory;
	}

	constructor(
		address: string,
		connectionToken: string | undefined,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._transport = this._register(new WebSocketClientTransport(address, connectionToken));
		this._register(this._transport.onMessage(msg => this._handleMessage(msg)));
		this._register(this._transport.onClose(() => this._onDidClose.fire()));
	}

	/**
	 * Connect to the remote agent host and perform the protocol handshake.
	 */
	async connect(): Promise<void> {
		await this._transport.connect();

		const result = await this._sendRequest('initialize', {
			protocolVersion: PROTOCOL_VERSION,
			clientId: this._clientId,
		});
		this._serverSeq = result.serverSeq;
		this._defaultDirectory = result.defaultDirectory;
	}

	/**
	 * Subscribe to state at a URI. Returns the current state snapshot.
	 */
	async subscribe(resource: URI): Promise<IStateSnapshot> {
		const result = await this._sendRequest('subscribe', { resource: resource.toString() });
		return result.snapshot;
	}

	/**
	 * Unsubscribe from state at a URI.
	 */
	unsubscribe(resource: URI): void {
		this._sendNotification('unsubscribe', { resource: resource.toString() });
	}

	/**
	 * Dispatch a client action to the server. Returns the clientSeq used.
	 */
	dispatchAction(action: ISessionAction, _clientId: string, clientSeq: number): void {
		this._sendNotification('dispatchAction', { clientSeq, action });
	}

	/**
	 * Create a new session on the remote agent host.
	 */
	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const provider = config?.provider ?? 'copilot';
		const session = AgentSession.uri(provider, generateUuid());
		await this._sendRequest('createSession', {
			session: session.toString(),
			provider,
			model: config?.model,
			workingDirectory: config?.workingDirectory,
		});
		return session;
	}

	/**
	 * Push a GitHub auth token to the remote agent host.
	 */
	async setAuthToken(token: string): Promise<void> {
		this._sendExtensionNotification('setAuthToken', { token });
	}

	/**
	 * Refresh the model list from all providers on the remote host.
	 */
	async refreshModels(): Promise<void> {
		await this._sendExtensionRequest('refreshModels');
	}

	/**
	 * Discover available agent backends from the remote host.
	 */
	async listAgents(): Promise<IAgentDescriptor[]> {
		return await this._sendExtensionRequest('listAgents') as IAgentDescriptor[];
	}

	/**
	 * Gracefully shut down all sessions on the remote host.
	 */
	async shutdown(): Promise<void> {
		await this._sendExtensionRequest('shutdown');
	}

	/**
	 * Dispose a session on the remote agent host.
	 */
	async disposeSession(session: URI): Promise<void> {
		await this._sendRequest('disposeSession', { session: session.toString() });
	}

	/**
	 * List all sessions from the remote agent host.
	 */
	async listSessions(): Promise<IAgentSessionMetadata[]> {
		const result = await this._sendRequest('listSessions', {});
		return result.items.map((s: ISessionSummary) => ({
			session: URI.parse(s.resource),
			startTime: s.createdAt,
			modifiedTime: s.modifiedAt,
			summary: s.title,
		}));
	}

	/**
	 * List the contents of a directory on the remote host's filesystem.
	 */
	async browseDirectory(uri: URI): Promise<ICommandMap['browseDirectory']['result']> {
		return await this._sendRequest('browseDirectory', { uri: uri.toString() });
	}

	private _handleMessage(msg: IProtocolMessage): void {
		if (isJsonRpcResponse(msg)) {
			const pending = this._pendingRequests.get(msg.id);
			if (pending) {
				this._pendingRequests.delete(msg.id);
				if (hasKey(msg, { error: true })) {
					this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
					pending.error(new Error(msg.error.message));
				} else {
					pending.complete(msg.result);
				}
			} else {
				this._logService.warn(`[RemoteAgentHostProtocol] Received response for unknown request id ${msg.id}`);
			}
		} else if (isJsonRpcNotification(msg)) {
			switch (msg.method) {
				case 'action': {
					// Protocol envelope → VS Code envelope (superset of action types)
					const envelope = msg.params as unknown as IActionEnvelope;
					this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
					this._onDidAction.fire(envelope);
					break;
				}
				case 'notification': {
					const notification = msg.params.notification as unknown as INotification;
					this._logService.trace(`[RemoteAgentHostProtocol] Notification: ${notification.type}`);
					this._onDidNotification.fire(notification);
					break;
				}
				default:
					this._logService.trace(`[RemoteAgentHostProtocol] Unhandled method: ${msg.method}`);
					break;
			}
		} else {
			this._logService.warn(`[RemoteAgentHostProtocol] Unrecognized message:`, JSON.stringify(msg));
		}
	}

	/** Send a typed JSON-RPC notification for a protocol-defined method. */
	private _sendNotification<M extends keyof IClientNotificationMap>(method: M, params: IClientNotificationMap[M]['params']): void {
		// Generic M can't satisfy the distributive IAhpNotification union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0' as const, method, params } as IProtocolMessage);
	}

	/** Send a JSON-RPC notification for a VS Code extension method (not in the protocol spec). */
	private _sendExtensionNotification(method: string, params?: unknown): void {
		// Cast: extension methods aren't in the typed protocol maps yet
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0', method, params } as unknown as IJsonRpcResponse);
	}

	/** Send a typed JSON-RPC request for a protocol-defined method. */
	private _sendRequest<M extends keyof ICommandMap>(method: M, params: ICommandMap[M]['params']): Promise<ICommandMap[M]['result']> {
		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, deferred);
		// Generic M can't satisfy the distributive IAhpRequest union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0' as const, id, method, params } as IProtocolMessage);
		return deferred.p as Promise<ICommandMap[M]['result']>;
	}

	/** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
	private _sendExtensionRequest(method: string, params?: unknown): Promise<unknown> {
		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, deferred);
		// Cast: extension methods aren't in the typed protocol maps yet
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0', id, method, params } as unknown as IJsonRpcResponse);
		return deferred.p;
	}

	/**
	 * Get the next client sequence number for optimistic dispatch.
	 */
	nextClientSeq(): number {
		return this._nextClientSeq++;
	}
}
