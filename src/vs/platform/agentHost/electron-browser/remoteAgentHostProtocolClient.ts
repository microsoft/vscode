/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol client for communicating with a remote agent host process.
// Wraps WebSocketClientTransport and SessionClientState to provide a
// higher-level API matching IAgentService.

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IReference } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { AgentSession, IAgentConnection, IAgentCreateSessionConfig, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult } from '../common/agentService.js';
import { AgentSubscriptionManager, type IAgentSubscription } from '../common/state/agentSubscription.js';
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../common/agentHostUri.js';
import type { IClientNotificationMap, ICommandMap } from '../common/state/protocol/messages.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from '../common/state/sessionActions.js';
import { ISessionSummary, ROOT_STATE_URI, StateComponents, type IRootState } from '../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, type IJsonRpcResponse, type IProtocolMessage, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { isClientTransport, type IProtocolTransport } from '../common/state/sessionTransport.js';
import { AhpErrorCodes } from '../common/state/protocol/errors.js';
import { ContentEncoding, type ICreateTerminalParams } from '../common/state/protocol/commands.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';

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
	private readonly _address: string;
	private readonly _transport: IProtocolTransport;
	private readonly _connectionAuthority: string;
	private _serverSeq = 0;
	private _nextClientSeq = 1;
	private _defaultDirectory: string | undefined;
	private readonly _subscriptionManager: AgentSubscriptionManager;

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
		return this._address;
	}

	get defaultDirectory(): string | undefined {
		return this._defaultDirectory;
	}

	constructor(
		address: string,
		transport: IProtocolTransport,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._address = address;
		this._connectionAuthority = agentHostAuthority(address);
		this._transport = transport;
		this._register(this._transport);
		this._register(this._transport.onMessage(msg => this._handleMessage(msg)));
		this._register(this._transport.onClose(() => this._onDidClose.fire()));

		this._subscriptionManager = this._register(new AgentSubscriptionManager(
			this._clientId,
			() => this.nextClientSeq(),
			msg => this._logService.warn(`[RemoteAgentHostProtocolClient] ${msg}`),
			resource => this.subscribe(resource),
			resource => this.unsubscribe(resource),
		));

		// Forward action envelopes from the transport to the subscription manager
		this._register(this.onDidAction(envelope => {
			this._subscriptionManager.receiveEnvelope(envelope);
		}));
	}

	/**
	 * Connect to the remote agent host and perform the protocol handshake.
	 */
	async connect(): Promise<void> {
		if (isClientTransport(this._transport)) {
			await this._transport.connect();
		}

		const result = await this._sendRequest('initialize', {
			protocolVersion: PROTOCOL_VERSION,
			clientId: this._clientId,
			initialSubscriptions: [ROOT_STATE_URI],
		});
		this._serverSeq = result.serverSeq;

		// Hydrate root state from the initial snapshot
		for (const snapshot of result.snapshots ?? []) {
			if (snapshot.resource === ROOT_STATE_URI) {
				this._subscriptionManager.handleRootSnapshot(snapshot.state as IRootState, snapshot.fromSeq);
			}
		}

		if (result.defaultDirectory) {
			const dir = result.defaultDirectory;
			if (typeof dir === 'string') {
				this._defaultDirectory = URI.parse(dir).path;
			} else {
				this._defaultDirectory = URI.revive(dir).path;
			}
		}
	}

	// ---- IAgentConnection subscription API ----------------------------------

	get rootState(): IAgentSubscription<IRootState> {
		return this._subscriptionManager.rootState;
	}

	getSubscription<T>(kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		return this._subscriptionManager.getSubscription<T>(kind, resource);
	}

	getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		return this._subscriptionManager.getSubscriptionUnmanaged<T>(resource);
	}

	dispatch(action: ISessionAction | ITerminalAction): void {
		const seq = this._subscriptionManager.dispatchOptimistic(action);
		this.dispatchAction(action, this._clientId, seq);
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
	dispatchAction(action: ISessionAction | ITerminalAction, _clientId: string, clientSeq: number): void {
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
			workingDirectory: config?.workingDirectory ? fromAgentHostUri(config.workingDirectory).toString() : undefined,
		});
		return session;
	}

	/**
	 * Authenticate with the remote agent host using a specific scheme.
	 */
	async authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		await this._sendRequest('authenticate', params);
		return { authenticated: true };
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
	 * Create a new terminal on the remote agent host.
	 */
	async createTerminal(params: ICreateTerminalParams): Promise<void> {
		await this._sendRequest('createTerminal', params);
	}

	/**
	 * Dispose a terminal on the remote agent host.
	 */
	async disposeTerminal(terminal: URI): Promise<void> {
		await this._sendRequest('disposeTerminal', { terminal: terminal.toString() });
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
			status: s.status,
			workingDirectory: typeof s.workingDirectory === 'string' ? toAgentHostUri(URI.parse(s.workingDirectory), this._connectionAuthority) : undefined,
			isRead: s.isRead,
			isDone: s.isDone,
		}));
	}

	/**
	 * List the contents of a directory on the remote host's filesystem.
	 */
	async resourceList(uri: URI): Promise<ICommandMap['resourceList']['result']> {
		return await this._sendRequest('resourceList', { uri: uri.toString() });
	}

	/**
	 * Read the content of a resource on the remote host.
	 */
	async resourceRead(uri: URI): Promise<ICommandMap['resourceRead']['result']> {
		return this._sendRequest('resourceRead', { uri: uri.toString() });
	}

	async resourceWrite(params: ICommandMap['resourceWrite']['params']): Promise<ICommandMap['resourceWrite']['result']> {
		return this._sendRequest('resourceWrite', params);
	}

	async resourceCopy(params: ICommandMap['resourceCopy']['params']): Promise<ICommandMap['resourceCopy']['result']> {
		return this._sendRequest('resourceCopy', params);
	}

	async resourceDelete(params: ICommandMap['resourceDelete']['params']): Promise<ICommandMap['resourceDelete']['result']> {
		return this._sendRequest('resourceDelete', params);
	}

	async resourceMove(params: ICommandMap['resourceMove']['params']): Promise<ICommandMap['resourceMove']['result']> {
		return this._sendRequest('resourceMove', params);
	}

	private _handleMessage(msg: IProtocolMessage): void {
		if (isJsonRpcRequest(msg)) {
			this._handleReverseRequest(msg.id, msg.method, msg.params);
		} else if (isJsonRpcResponse(msg)) {
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
					const envelope = msg.params;
					this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
					this._onDidAction.fire(envelope);
					break;
				}
				case 'notification': {
					const notification = msg.params.notification;
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

	/**
	 * Handles reverse RPC requests from the server (e.g. resourceList,
	 * resourceRead). Reads from the local file service and sends a response.
	 */
	private _handleReverseRequest(id: number, method: string, params: unknown): void {
		const sendResult = (result: unknown) => {
			this._transport.send({ jsonrpc: '2.0', id, result });
		};
		const sendError = (err: unknown) => {
			const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : undefined);
			let code = -32000;
			switch (fsCode) {
				case FileSystemProviderErrorCode.FileNotFound: code = AhpErrorCodes.NotFound; break;
				case FileSystemProviderErrorCode.NoPermissions: code = AhpErrorCodes.PermissionDenied; break;
				case FileSystemProviderErrorCode.FileExists: code = AhpErrorCodes.AlreadyExists; break;
			}
			this._transport.send({ jsonrpc: '2.0', id, error: { code, message: err instanceof Error ? err.message : String(err) } });
		};
		const handle = (fn: () => Promise<unknown>) => {
			fn().then(sendResult, sendError);
		};

		const p = params as Record<string, unknown>;
		switch (method) {
			case 'resourceList':
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				return handle(async () => {
					const stat = await this._fileService.resolve(URI.parse(p.uri as string));
					return { entries: (stat.children ?? []).map(c => ({ name: c.name, type: c.isDirectory ? 'directory' as const : 'file' as const })) };
				});
			case 'resourceRead':
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				return handle(async () => {
					const content = await this._fileService.readFile(URI.parse(p.uri as string));
					return { data: encodeBase64(content.value), encoding: ContentEncoding.Base64 };
				});
			case 'resourceWrite':
				if (!p.uri || !p.data) { sendError(new Error('Missing uri or data')); return; }
				return handle(async () => {
					const writeUri = URI.parse(p.uri as string);
					const buf = p.encoding === ContentEncoding.Base64
						? decodeBase64(p.data as string)
						: VSBuffer.fromString(p.data as string);
					if (p.createOnly) {
						await this._fileService.createFile(writeUri, buf, { overwrite: false });
					} else {
						await this._fileService.writeFile(writeUri, buf);
					}
					return {};
				});
			case 'resourceDelete':
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				return handle(() => this._fileService.del(URI.parse(p.uri as string), { recursive: !!p.recursive }).then(() => ({})));
			case 'resourceMove':
				if (!p.source || !p.destination) { sendError(new Error('Missing source or destination')); return; }
				return handle(() => this._fileService.move(URI.parse(p.source as string), URI.parse(p.destination as string), !p.failIfExists).then(() => ({})));
			default:
				this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
				sendError(new Error(`Unknown method: ${method}`));
		}
	}

	/** Send a typed JSON-RPC notification for a protocol-defined method. */
	private _sendNotification<M extends keyof IClientNotificationMap>(method: M, params: IClientNotificationMap[M]['params']): void {
		// Generic M can't satisfy the distributive IAhpNotification union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0' as const, method, params } as IProtocolMessage);
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
