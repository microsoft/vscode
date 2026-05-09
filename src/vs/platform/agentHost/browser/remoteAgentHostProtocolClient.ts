/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol client for communicating with a remote agent host process.
// Wraps WebSocketClientTransport and SessionClientState to provide a
// higher-level API matching IAgentService.

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IReference } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { AgentSession, IAgentConnection, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../common/agentService.js';
import { AgentSubscriptionManager, type IAgentSubscription } from '../common/state/agentSubscription.js';
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../common/agentHostUri.js';
import { AgentHostPermissionMode, IAgentHostPermissionService } from '../common/agentHostPermissionService.js';
import type { ClientNotificationMap, CommandMap, JsonRpcErrorResponse, JsonRpcRequest } from '../common/state/protocol/messages.js';
import { ActionType, type ActionEnvelope, type INotification, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import { SessionSummary, SessionStatus, ROOT_STATE_URI, StateComponents, type CustomizationRef, type RootState } from '../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ProtocolError, type ProtocolMessage, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { isClientTransport, type IProtocolTransport } from '../common/state/sessionTransport.js';
import { AhpErrorCodes } from '../common/state/protocol/errors.js';
import { ContentEncoding, ResourceRequestParams, type CompletionsParams, type CompletionsResult, type CreateTerminalParams, type ResolveSessionConfigResult, type SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';

const AHP_CLIENT_CONNECTION_CLOSED = -32000;

function connectionClosedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection closed: ${address}`);
}

function connectionDisposedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection disposed: ${address}`);
}

interface IRemoteAgentHostExtensionCommandMap {
	'shutdown': { params: undefined; result: void };
}

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
	private _completionTriggerCharacters: readonly string[] = [];
	private readonly _subscriptionManager: AgentSubscriptionManager;

	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	/** Pending JSON-RPC requests keyed by request id. */
	private readonly _pendingRequests = new Map<number, DeferredPromise<unknown>>();
	private _nextRequestId = 1;
	private _isClosed = false;
	private _closeError: ProtocolError | undefined;

	/**
	 * Comparison keys of customization URIs we have already granted implicit
	 * read access for on this connection. Dedupes repeat sends so we don't
	 * pile up grants per dispatch. Cleared with the connection.
	 */
	private readonly _grantedCustomizationUris = new Set<string>();

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
		@IAgentHostPermissionService private readonly _permissionService: IAgentHostPermissionService,
	) {
		super();
		this._address = address;
		this._connectionAuthority = agentHostAuthority(address);
		this._transport = transport;
		this._register(this._transport);
		this._register(this._transport.onMessage(msg => this._handleMessage(msg)));
		this._register(this._transport.onClose(() => this._handleClose(connectionClosedError(this._address))));

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

	override dispose(): void {
		this._handleClose(connectionDisposedError(this._address));
		super.dispose();
	}

	/**
	 * Connect to the remote agent host and perform the protocol handshake.
	 */
	async connect(): Promise<void> {
		if (isClientTransport(this._transport)) {
			await this._raceClose(this._transport.connect());
		}

		const result = await this._sendRequest('initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: this._clientId,
			initialSubscriptions: [ROOT_STATE_URI],
		});
		this._serverSeq = result.serverSeq;

		// Hydrate root state from the initial snapshot
		for (const snapshot of result.snapshots ?? []) {
			if (snapshot.resource === ROOT_STATE_URI) {
				this._subscriptionManager.handleRootSnapshot(snapshot.state as RootState, snapshot.fromSeq);
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

		this._completionTriggerCharacters = result.completionTriggerCharacters ?? [];
	}

	// ---- IAgentConnection subscription API ----------------------------------

	get rootState(): IAgentSubscription<RootState> {
		return this._subscriptionManager.rootState;
	}

	getSubscription<T>(kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		return this._subscriptionManager.getSubscription<T>(kind, resource);
	}

	getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		return this._subscriptionManager.getSubscriptionUnmanaged<T>(resource);
	}

	dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
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
	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, _clientId: string, clientSeq: number): void {
		this._grantImplicitReadsForOutgoingAction(action);
		this._sendNotification('dispatchAction', { clientSeq, action });
	}

	/**
	 * Create a new session on the remote agent host.
	 */
	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const provider = config?.provider;
		if (!provider) {
			throw new Error('Cannot create remote agent host session without a provider.');
		}
		const session = config?.session ?? AgentSession.uri(provider, generateUuid());
		if (config?.activeClient?.customizations) {
			this._grantImplicitReadsForCustomizations(config.activeClient.customizations);
		}
		await this._sendRequest('createSession', {
			session: session.toString(),
			provider,
			model: config?.model,
			workingDirectory: config?.workingDirectory ? fromAgentHostUri(config.workingDirectory).toString() : undefined,
			config: config?.config,
			activeClient: config?.activeClient,
		});
		return session;
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this._sendRequest('resolveSessionConfig', {
			provider: params.provider,
			workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : undefined,
			config: params.config,
		});
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this._sendRequest('sessionConfigCompletions', {
			provider: params.provider,
			workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : undefined,
			config: params.config,
			property: params.property,
			query: params.query,
		});
	}

	async completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._sendRequest('completions', params);
	}

	/**
	 * Returns the trigger characters captured from the `initialize` handshake.
	 * Empty when the remote host did not announce any.
	 */
	async getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._completionTriggerCharacters;
	}

	/**
	 * Authenticate with the remote agent host using a specific scheme.
	 */
	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
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
	async createTerminal(params: CreateTerminalParams): Promise<void> {
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
		return result.items.map((s: SessionSummary) => ({
			session: URI.parse(s.resource),
			startTime: s.createdAt,
			modifiedTime: s.modifiedAt,
			...(s.project ? {
				project: {
					uri: this._toLocalProjectUri(URI.parse(s.project.uri)),
					displayName: s.project.displayName,
				}
			} : {}),
			summary: s.title,
			status: s.status,
			activity: s.activity,
			workingDirectory: typeof s.workingDirectory === 'string' ? toAgentHostUri(URI.parse(s.workingDirectory), this._connectionAuthority) : undefined,
			isRead: !!(s.status & SessionStatus.IsRead),
			isArchived: !!(s.status & SessionStatus.IsArchived),
			diffs: s.diffs,
		}));
	}

	private _toLocalProjectUri(uri: URI): URI {
		return uri.scheme === Schemas.file ? toAgentHostUri(uri, this._connectionAuthority) : uri;
	}

	/**
	 * Inspect an outgoing client-dispatched action and grant implicit reads
	 * for any customization URIs it carries. Today this covers
	 * `SessionActiveClientChanged`, which is the only client-dispatched
	 * action that ships customization URIs to the host.
	 */
	private _grantImplicitReadsForOutgoingAction(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		if (action.type === ActionType.SessionActiveClientChanged && action.activeClient?.customizations) {
			this._grantImplicitReadsForCustomizations(action.activeClient.customizations);
		}
	}

	/**
	 * Register implicit read grants for each customization URI that we are
	 * about to send to the host. The host needs to read these to materialize
	 * the customization, but should not need to write them. Grants are
	 * deduped per connection and revoked when the connection closes.
	 */
	private _grantImplicitReadsForCustomizations(refs: readonly CustomizationRef[]): void {
		for (const ref of refs) {
			let uri: URI;
			try {
				uri = URI.parse(ref.uri);
			} catch {
				continue;
			}
			const key = uri.toString();
			if (this._grantedCustomizationUris.has(key)) {
				continue;
			}
			this._grantedCustomizationUris.add(key);
			// Disposable is owned by the permission service; cleared on
			// connectionClosed.
			this._permissionService.grantImplicitRead(this._address, uri);
		}
	}

	/**
	 * List the contents of a directory on the remote host's filesystem.
	 */
	async resourceList(uri: URI): Promise<CommandMap['resourceList']['result']> {
		return await this._sendRequest('resourceList', { uri: uri.toString() });
	}

	/**
	 * Read the content of a resource on the remote host.
	 */
	async resourceRead(uri: URI): Promise<CommandMap['resourceRead']['result']> {
		return this._sendRequest('resourceRead', { uri: uri.toString() });
	}

	async resourceWrite(params: CommandMap['resourceWrite']['params']): Promise<CommandMap['resourceWrite']['result']> {
		return this._sendRequest('resourceWrite', params);
	}

	async resourceCopy(params: CommandMap['resourceCopy']['params']): Promise<CommandMap['resourceCopy']['result']> {
		return this._sendRequest('resourceCopy', params);
	}

	async resourceDelete(params: CommandMap['resourceDelete']['params']): Promise<CommandMap['resourceDelete']['result']> {
		return this._sendRequest('resourceDelete', params);
	}

	async resourceMove(params: CommandMap['resourceMove']['params']): Promise<CommandMap['resourceMove']['result']> {
		return this._sendRequest('resourceMove', params);
	}

	private _handleMessage(msg: ProtocolMessage): void {
		if (isJsonRpcRequest(msg)) {
			this._handleReverseRequest(msg.id, msg.method, msg.params);
		} else if (isJsonRpcResponse(msg)) {
			const pending = this._pendingRequests.get(msg.id);
			if (pending) {
				this._pendingRequests.delete(msg.id);
				if (hasKey(msg, { error: true })) {
					this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
					pending.error(this._toProtocolError(msg.error));
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

	private _handleClose(error: ProtocolError): void {
		if (this._isClosed) {
			return;
		}

		this._isClosed = true;
		this._closeError = error;
		this._rejectPendingRequests(error);
		this._permissionService.connectionClosed(this._address);
		this._grantedCustomizationUris.clear();
		this._onDidClose.fire();
	}

	private async _raceClose<T>(promise: Promise<T>): Promise<T> {
		if (this._closeError) {
			return Promise.reject(this._closeError);
		}

		let closeListener = Disposable.None;
		const closePromise = new Promise<never>((_resolve, reject) => {
			closeListener = this.onDidClose(() => reject(this._closeError));
		});

		try {
			return await Promise.race([promise, closePromise]);
		} finally {
			closeListener.dispose();
		}
	}

	/**
	 * Handles reverse RPC requests from the server (e.g. resourceList,
	 * resourceRead). Reads from the local file service and sends a response.
	 *
	 * Filesystem-mutating reverse requests are gated through
	 * {@link IAgentHostPermissionService} — denied operations return a typed
	 * `PermissionDenied` error advertising a `resourceRequest` payload that,
	 * if granted, would unlock the operation. Hosts SHOULD then issue a
	 * `resourceRequest` and retry.
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
		const sendPermissionDenied = (request: ResourceRequestParams | undefined) => {
			this._transport.send({
				jsonrpc: '2.0',
				id,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: request
						? `Access to ${request.uri} is not granted.`
						: 'Access to the requested resource is not granted.',
					data: request ? { request } : undefined,
				},
			});
		};

		/**
		 * Runs `fn` if the permission service grants access for `(uri, mode)`.
		 * Otherwise replies with `PermissionDenied` advertising the request
		 * that, if granted, would unlock the operation. Errors thrown from
		 * `fn` are reported via `sendError`.
		 */
		const gateAndHandle = async (
			uri: URI,
			mode: AgentHostPermissionMode,
			deniedRequest: ResourceRequestParams,
			fn: () => Promise<unknown>,
		): Promise<void> => {
			try {
				if (!await this._permissionService.check(this._address, uri, mode)) {
					sendPermissionDenied(deniedRequest);
					return;
				}
				sendResult(await fn());
			} catch (err) {
				sendError(err);
			}
		};

		const p = params as Record<string, unknown>;
		switch (method) {
			case 'resourceList': {
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				const uri = URI.parse(p.uri as string);
				return void gateAndHandle(uri, AgentHostPermissionMode.Read, { uri: uri.toString(), read: true }, async () => {
					const stat = await this._fileService.resolve(uri);
					return { entries: (stat.children ?? []).map(c => ({ name: c.name, type: c.isDirectory ? 'directory' as const : 'file' as const })) };
				});
			}
			case 'resourceRead': {
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				const uri = URI.parse(p.uri as string);
				return void gateAndHandle(uri, AgentHostPermissionMode.Read, { uri: uri.toString(), read: true }, async () => {
					const content = await this._fileService.readFile(uri);
					return { data: encodeBase64(content.value), encoding: ContentEncoding.Base64 };
				});
			}
			case 'resourceWrite': {
				if (!p.uri || !p.data) { sendError(new Error('Missing uri or data')); return; }
				const writeUri = URI.parse(p.uri as string);
				return void gateAndHandle(writeUri, AgentHostPermissionMode.Write, { uri: writeUri.toString(), write: true }, async () => {
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
			}
			case 'resourceDelete': {
				if (!p.uri) { sendError(new Error('Missing uri')); return; }
				const deleteUri = URI.parse(p.uri as string);
				return void gateAndHandle(deleteUri, AgentHostPermissionMode.Write, { uri: deleteUri.toString(), write: true }, () =>
					this._fileService.del(deleteUri, { recursive: !!p.recursive }).then(() => ({})));
			}
			case 'resourceMove': {
				if (!p.source || !p.destination) { sendError(new Error('Missing source or destination')); return; }
				const sourceUri = URI.parse(p.source as string);
				const destUri = URI.parse(p.destination as string);
				return void (async () => {
					try {
						const [sourceOk, destOk] = await Promise.all([
							this._permissionService.check(this._address, sourceUri, AgentHostPermissionMode.Write),
							this._permissionService.check(this._address, destUri, AgentHostPermissionMode.Write),
						]);
						if (!sourceOk) {
							sendPermissionDenied({ uri: sourceUri.toString(), write: true });
							return;
						}
						if (!destOk) {
							sendPermissionDenied({ uri: destUri.toString(), write: true });
							return;
						}
						await this._fileService.move(sourceUri, destUri, !p.failIfExists);
						sendResult({});
					} catch (err) {
						sendError(err);
					}
				})();
			}
			case 'resourceRequest': {
				const requestParams = p as unknown as ResourceRequestParams;
				this._permissionService.request(this._address, requestParams)
					.then(() => sendResult({}))
					.catch(err => {
						if (err instanceof CancellationError) {
							sendPermissionDenied(undefined);
						} else {
							sendError(err);
						}
					});
				return;
			}
			default:
				this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
				sendError(new Error(`Unknown method: ${method}`));
		}
	}

	/** Send a typed JSON-RPC notification for a protocol-defined method. */
	private _sendNotification<M extends keyof ClientNotificationMap>(method: M, params: ClientNotificationMap[M]['params']): void {
		// Generic M can't satisfy the distributive AhpNotification union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0' as const, method, params } as ProtocolMessage);
	}

	/** Send a typed JSON-RPC request for a protocol-defined method. */
	private _sendRequest<M extends keyof CommandMap>(method: M, params: CommandMap[M]['params']): Promise<CommandMap[M]['result']> {
		if (this._closeError) {
			return Promise.reject(this._closeError);
		}

		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, deferred);
		// Generic M can't satisfy the distributive AhpRequest union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		this._transport.send({ jsonrpc: '2.0' as const, id, method, params } as ProtocolMessage);
		return deferred.p as Promise<CommandMap[M]['result']>;
	}

	/** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
	private _sendExtensionRequest<M extends keyof IRemoteAgentHostExtensionCommandMap>(method: M, params?: IRemoteAgentHostExtensionCommandMap[M]['params']): Promise<IRemoteAgentHostExtensionCommandMap[M]['result']> {
		if (this._closeError) {
			return Promise.reject(this._closeError);
		}

		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, deferred);
		const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
		this._transport.send(request);
		return deferred.p as Promise<IRemoteAgentHostExtensionCommandMap[M]['result']>;
	}

	private _toProtocolError(error: JsonRpcErrorResponse['error']): ProtocolError {
		return new ProtocolError(error.code, error.message, error.data);
	}

	private _rejectPendingRequests(error: ProtocolError): void {
		for (const pending of this._pendingRequests.values()) {
			pending.error(error);
		}
		this._pendingRequests.clear();
	}

	/**
	 * Get the next client sequence number for optimistic dispatch.
	 */
	nextClientSeq(): number {
		return this._nextClientSeq++;
	}
}
