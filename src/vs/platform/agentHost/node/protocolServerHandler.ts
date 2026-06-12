/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { isJsonRpcResponse } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AHPFileSystemProvider } from '../common/agentHostFileSystemProvider.js';
import { AgentSession, type IAgentService, type IMcpNotification } from '../common/agentService.js';
import type { CommandMap } from '../common/state/protocol/messages.js';
import { ActionEnvelope, ActionType, INotification, isSessionAction, isTerminalAction, type SessionAction, type TerminalAction, type IRootConfigChangedAction } from '../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { negotiateProtocolVersion } from '../common/state/protocol/version/negotiation.js';
import { VSCODE_UPGRADE_METHOD, type UnsupportedProtocolVersionErrorDataEx } from '../common/state/protocolUpgrade.js';
import { getAgentHostManagementSocketPath, requestAgentHostUpgrade } from './agentHostUpgradeChannel.js';
import {
	AHP_AUTH_REQUIRED,
	AHP_PROVIDER_NOT_FOUND,
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	JsonRpcRequest,
	isJsonRpcNotification,
	isJsonRpcRequest,
	JSON_RPC_INTERNAL_ERROR,
	JsonRpcErrorCodes,
	ProtocolError,
	type AhpServerNotification,
	type InitializeParams,
	type JsonRpcResponse,
	type ReconnectParams,
	type IStateSnapshot,
} from '../common/state/sessionProtocol.js';
import { isAhpResourceWatchChannel, isAhpRootChannel, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, type SessionState } from '../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import {
	buildOtlpLogsChannelUri,
	extractLevelFromOtlpLogsUri,
	levelToSeverityNumber,
	OTLP_CHANNEL_SCHEME,
	OTLP_LOGS_CHANNEL_TEMPLATE,
	OtlpLogEmitter,
	toResourceLogsPayload,
	type IOtlpLogRecord,
	type OtlpLogLevelName,
} from '../common/otlp/otlpLogEmitter.js';

/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;

const CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT = 30_000;

/** A client tool call in any of these statuses is still awaiting its result. */
function isPendingToolCallStatus(status: ToolCallStatus): boolean {
	return status === ToolCallStatus.Streaming
		|| status === ToolCallStatus.Running
		|| status === ToolCallStatus.PendingConfirmation;
}

/** Build a JSON-RPC success response suitable for transport.send(). */
function jsonRpcSuccess(id: number, result: unknown): JsonRpcResponse {
	return { jsonrpc: '2.0', id, result };
}

/** Build a JSON-RPC error response suitable for transport.send(). */
function jsonRpcError(id: number, code: number, message: string, data?: unknown): JsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** Build a JSON-RPC error response from an unknown thrown value, preserving {@link ProtocolError} fields. */
function jsonRpcErrorFrom(id: number, err: unknown): JsonRpcResponse {
	if (err instanceof ProtocolError) {
		return jsonRpcError(id, err.code, err.message, err.data);
	}
	const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
	return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}

/** True when `value` is a non-null params object (as opposed to an array or primitive). */
function isParamsObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the `channel` URI carried on a request's params when it is an
 * `mcp://` channel — the AHP routing envelope for raw MCP requests
 * tunnelled over the JSON-RPC connection. Returns `undefined` for any
 * other params shape.
 */
function readMcpChannel(params: unknown): string | undefined {
	if (!isParamsObject(params)) {
		return undefined;
	}
	const channel = params['channel'];
	if (typeof channel !== 'string' || !channel.startsWith('mcp://')) {
		return undefined;
	}
	return channel;
}

/**
 * Methods handled by the request dispatcher. Excludes `initialize`,
 * `reconnect`, and `ping`, which are handled directly during message
 * dispatch without requiring an established client context.
 */
type RequestMethod = Exclude<keyof CommandMap, 'initialize' | 'reconnect' | 'ping'>;

/**
 * Typed handler map: each key is a request method, each value is a handler
 * that receives the correctly-typed params and must return the correctly-typed
 * result. The compiler will error if a handler returns the wrong shape.
 */
type RequestHandlerMap = {
	[M in RequestMethod]: (client: IConnectedClient, params: CommandMap[M]['params']) => Promise<CommandMap[M]['result']>;
};

/**
 * Discriminant for {@link ChannelSubscription}. Distinguishes a regular
 * state-bearing channel (root, session, terminal, changeset) from the
 * stateless OTLP signal channels so each subscribe/unsubscribe path can
 * dispatch through a single typed lookup.
 */
const enum ChannelKind {
	/**
	 * Subscribed via {@link IAgentService.subscribe} and tracked by the
	 * server-side refcount. Carries replayable state, participates in
	 * action broadcasts ({@link _broadcastAction}) and reconnect
	 * snapshot/replay.
	 */
	State = 'state',
	/**
	 * Resource-watch channels (`ahp-resource-watch:/<id>`). Tracked
	 * separately so subscribe/unsubscribe routes through the agent
	 * service's per-watch refcount + grace timer rather than the
	 * session-shaped {@link IAgentService.subscribe} path.
	 */
	ResourceWatch = 'resource-watch',
	/**
	 * Subscribed against the OTLP logs channel template advertised in
	 * {@link InitializeResult.telemetry}. Stateless — no snapshot, no
	 * agent-service refcount. The `level` field records the minimum
	 * severity the client asked to receive.
	 */
	OtlpLogs = 'otlp-logs',
}

/**
 * Per-channel server-side subscription record. Stored on every
 * {@link IConnectedClient} so each subscribed channel can be routed by
 * its `kind` without re-deriving it from the URI on every dispatch.
 *
 * `uri` is the canonical channel URI string used everywhere a subscription
 * is referenced — the same string is broadcast on outbound notifications
 * and persists across reconnects.
 */
type ChannelSubscription =
	| { readonly kind: ChannelKind.State; readonly uri: string }
	| { readonly kind: ChannelKind.ResourceWatch; readonly uri: string }
	| { readonly kind: ChannelKind.OtlpLogs; readonly uri: string; readonly level: OtlpLogLevelName };

/**
 * Represents a connected protocol client with its subscription state.
 */
interface IConnectedClient {
	readonly clientId: string;
	readonly protocolVersion: string;
	readonly transport: IProtocolTransport;
	/**
	 * Every channel the client is currently subscribed to, keyed by the
	 * canonical channel URI. OTLP channel URIs are canonicalised to
	 * `buildOtlpLogsChannelUri(level)` so URI variants that resolve to
	 * the same logical channel collapse to one entry.
	 */
	readonly subscriptions: Map<string, ChannelSubscription>;
	readonly disposables: DisposableStore;
}

/**
 * Per-client server-side record, keyed by clientId in
 * {@link ProtocolServerHandler._clients}. Unlike {@link IConnectedClient}, the
 * record OUTLIVES the connection: when a client disconnects, `connection` is
 * cleared to `undefined` but the record is retained (until pruned) so the
 * tool-call disconnect-grace machinery can still compute the remaining window
 * and hold any armed timeouts.
 */
interface IClientRecord {
	/** Live connection while connected; `undefined` after disconnect (record retained for the grace window). */
	connection: IConnectedClient | undefined;
	/**
	 * Epoch ms the client was last seen connected (handshake or disconnect).
	 * `undefined` when the client has never connected. Drives the
	 * disconnect-timeout grace window: a pending client tool call fails
	 * `CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT` ms after this point, never instantly
	 * and never never.
	 */
	lastSeenAt: number | undefined;
	/**
	 * Pending tool-call disconnect timeouts owned by this client, keyed by
	 * session URI. Armed when the client owns a pending client tool call but is
	 * not connected; fires a failing completion if it does not (re)connect
	 * within the grace window. Disposing an entry (or the whole map) clears the
	 * underlying timer.
	 */
	readonly disconnectTimeouts: DisposableMap<string>;
}

/**
 * Classifies a raw channel URI string into its {@link ChannelKind} and
 * returns the canonical URI to key subscriptions by. Returns `undefined`
 * when the channel is OTLP-flavoured but the URI does not parse into a
 * supported shape (unknown level, missing path) so the caller can
 * silently drop the subscribe rather than installing a broken entry.
 *
 * For state channels the canonical URI is just the input verbatim — the
 * agent service is the authoritative deduplication point and tolerates
 * whatever URI form the client sent.
 */
function classifyChannel(channel: string): ChannelSubscription | undefined {
	if (channel.toLowerCase().startsWith(`${OTLP_CHANNEL_SCHEME}:`)) {
		const level = extractLevelFromOtlpLogsUri(channel);
		if (!level) {
			return undefined;
		}
		return { kind: ChannelKind.OtlpLogs, uri: buildOtlpLogsChannelUri(level), level };
	}
	if (isAhpResourceWatchChannel(channel)) {
		return { kind: ChannelKind.ResourceWatch, uri: channel };
	}
	return { kind: ChannelKind.State, uri: channel };
}

/**
 * Configuration for protocol-level concerns outside of IAgentService.
 */
export interface IProtocolServerConfig {
	/** Default directory returned to clients during the initialize handshake. */
	readonly defaultDirectory?: string;
	/**
	 * Characters that, when typed in a {@link UserMessage} input, SHOULD
	 * cause the client to issue a `completions` request. Announced to
	 * clients in the `initialize` response.
	 */
	readonly completionTriggerCharacters?: readonly string[];
	/**
	 * Optional emitter to use as the source for the OTLP logs channel
	 * advertised via `InitializeResult.telemetry.logs`. When present, this
	 * handler will route `subscribe`/`unsubscribe` requests on
	 * `ahp-otlp:` channels to its internal OTLP subscription registry and
	 * broadcast every record fed into the emitter as an
	 * `otlp/exportLogs` notification. When absent, the OTLP channel is
	 * not advertised and any inbound `ahp-otlp:` subscribe request is
	 * rejected.
	 */
	readonly otlpLogEmitter?: OtlpLogEmitter;
}

/**
 * Server-side handler that manages protocol connections, routes JSON-RPC
 * messages to the agent service, and broadcasts actions/notifications
 * to subscribed clients.
 */
export class ProtocolServerHandler extends Disposable {

	/**
	 * Per-client records keyed by clientId. Holds both connected clients
	 * (`connection` set) and recently-disconnected ones retained for the
	 * tool-call disconnect-grace window (`connection === undefined`). See
	 * {@link IClientRecord}.
	 */
	private readonly _clients = new Map<string, IClientRecord>();
	private readonly _replayBuffer: ActionEnvelope[] = [];

	private readonly _onDidChangeConnectionCount = this._register(new Emitter<number>());

	/** Fires with the current client count whenever a client connects or disconnects. */
	readonly onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _server: IProtocolServer,
		private readonly _config: IProtocolServerConfig,
		private readonly _clientFileSystemProvider: AHPFileSystemProvider,
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
			// A client tool call may be issued for a client that is no longer
			// connected — e.g. a stale stamp from a window that reloaded. The
			// live-disconnect path (`_handleClientDisconnected`) does not cover
			// these because no disconnect event fires for an already-gone
			// client. Detect the orphan at issuance time and arm the same
			// grace-period timeout so the call cannot hang forever. Calls
			// stamped while no client is connected are failed immediately by
			// the provider, so they never reach this path.
			if (envelope.action.type === ActionType.SessionToolCallStart || envelope.action.type === ActionType.SessionToolCallReady) {
				this._checkOrphanedClientToolCalls(envelope.channel);
			}
		}));

		this._register(this._stateManager.onDidEmitNotification(notification => {
			this._broadcastNotification(notification);
		}));

		this._register(this._agentService.onMcpNotification(notification => {
			this._broadcastMcpNotification(notification);
		}));

		if (this._config.otlpLogEmitter) {
			this._register(this._config.otlpLogEmitter.onDidLog(record => this._broadcastOtlpLog(record)));
		}
	}

	// ---- Connection handling -------------------------------------------------

	private _handleNewConnection(transport: IProtocolTransport): void {
		const disposables = new DisposableStore();
		let client: IConnectedClient | undefined;

		disposables.add(transport.onMessage(msg => {
			if (isJsonRpcRequest(msg)) {
				this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);

				// Ping is stateless and MUST be answerable regardless of whether
				// the connection has been initialized. Carries no payload — the
				// round-trip itself is the liveness signal.
				if (msg.method === 'ping') {
					transport.send(jsonRpcSuccess(msg.id, null));
					return;
				}

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
					let responsePromise: Promise<unknown>;
					try {
						const result = this._handleReconnect(msg.params, transport, disposables);
						client = result.client;
						responsePromise = result.responsePromise;
					} catch (err) {
						transport.send(jsonRpcErrorFrom(msg.id, err));
						return;
					}
					responsePromise.then(
						response => transport.send(jsonRpcSuccess(msg.id, response)),
						err => transport.send(jsonRpcErrorFrom(msg.id, err)),
					);
					return;
				}

				// The VS Code upgrade request rides on the same transport but
				// is callable pre-`initialize`: by definition we get here when
				// the client's protocol version was rejected, so the client
				// never managed to complete the handshake.
				if ((msg.method as string) === VSCODE_UPGRADE_METHOD) {
					this._handleVscodeUpgrade(msg.id, transport);
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
							this._removeSubscription(client, msg.params.channel);
						}
						break;
					case 'dispatchAction':
						if (client) {
							this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(msg.params.action.type)}`);
							const action = msg.params.action as SessionAction | TerminalAction | IRootConfigChangedAction;
							const channel = msg.params.channel;
							if (isSessionAction(action) || isTerminalAction(action) || action.type === ActionType.RootConfigChanged) {
								this._agentService.dispatchAction(channel, action, client.clientId, msg.params.clientSeq);
							}
						}
						break;
				}
			} else if (isJsonRpcResponse(msg)) {
				const pending = this._pendingReverseRequests.get(msg.id);
				if (pending) {
					this._pendingReverseRequests.delete(msg.id);
					if (hasKey(msg, { error: true })) {
						pending.reject(new ProtocolError(
							msg.error?.code ?? -32000,
							msg.error?.message ?? 'Reverse RPC error',
							msg.error?.data,
						));
					} else {
						pending.resolve(msg.result);
					}
				}
			}
		}));

		disposables.add(transport.onClose(() => {
			const record = client ? this._clients.get(client.clientId) : undefined;
			if (client && record && record.connection === client) {
				this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}, subscriptions=${client.subscriptions.size}`);
				// Treat disconnect as an implicit unsubscribe of every channel the
				// client held, so the server-side refcount can drop to zero and any
				// idle restored session state can be evicted. OTLP subscriptions
				// have no server-side state to release, so the per-client map is
				// simply discarded.
				for (const sub of client.subscriptions.values()) {
					if (sub.kind === ChannelKind.State) {
						this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
					} else if (sub.kind === ChannelKind.ResourceWatch) {
						this._agentService.onResourceWatchUnsubscribed(sub.uri);
					}
				}
				client.subscriptions.clear();
				record.connection = undefined;
				record.lastSeenAt = Date.now();
				this._rejectPendingReverseRequests(client.clientId);
				this._handleClientDisconnected(client.clientId);
				this._onDidChangeConnectionCount.fire(this._connectedClientCount);
			}
			disposables.dispose();
		}));

		disposables.add(transport);
	}

	// ---- Handshake handlers ----------------------------------------------------

	private _handleInitialize(
		params: InitializeParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; response: unknown } {
		const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
		this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, protocolVersions=[${offered.join(', ')}]`);

		const negotiated = negotiateProtocolVersion(offered, PROTOCOL_VERSION);
		if (!negotiated) {
			const data: UnsupportedProtocolVersionErrorDataEx = {
				supportedVersions: [`^${PROTOCOL_VERSION}`],
				// Only advertise the in-band upgrade method when the agent
				// host was spawned by a VS Code CLI that is listening for
				// management requests (presence of the env var). Otherwise
				// there is no supervisor to actually act on it, so don't
				// lie to the client.
				_meta: getAgentHostManagementSocketPath()
					? { vscodeUpgradeMethod: VSCODE_UPGRADE_METHOD }
					: undefined,
			};
			throw new ProtocolError(
				AHP_UNSUPPORTED_PROTOCOL_VERSION,
				`Client offered protocol versions [${offered.join(', ')}], none of which are compatible with this server's version ${PROTOCOL_VERSION} (server accepts ^${PROTOCOL_VERSION}).`,
				data,
			);
		}

		const client: IConnectedClient = {
			clientId: params.clientId,
			protocolVersion: negotiated,
			transport,
			subscriptions: new Map(),
			disposables,
		};
		const record = this._ensureClientRecord(params.clientId);
		record.connection = client;
		record.lastSeenAt = Date.now();
		this._pruneClientRecords();
		this._onDidChangeConnectionCount.fire(this._connectedClientCount);

		this._registerClientFileSystemAuthority(params.clientId, disposables);


		const snapshots: IStateSnapshot[] = [];
		if (params.initialSubscriptions) {
			for (const uri of params.initialSubscriptions) {
				const snapshot = this._addInitialSubscription(client, uri.toString());
				if (snapshot) {
					snapshots.push(snapshot);
				}
			}
		}

		return {
			client,
			response: {
				protocolVersion: negotiated,
				serverSeq: this._stateManager.serverSeq,
				snapshots,
				defaultDirectory: this._config.defaultDirectory,
				completionTriggerCharacters: this._config.completionTriggerCharacters,
				telemetry: this._config.otlpLogEmitter ? { logs: OTLP_LOGS_CHANNEL_TEMPLATE } : undefined,
			},
		};
	}

	/**
	 * Helper for `initialize` and `reconnect` initial-subscription
	 * processing: classify `channel`, install the matching subscription
	 * on the client, and return the snapshot to include in the handshake
	 * response (or `undefined` for stateless channels and missing state).
	 *
	 * Side effects:
	 * - State channels: register with the agent service and clear any
	 *   pending tool-call disconnect timeout.
	 * - OTLP channels: install the canonical entry on the client's
	 *   {@link IConnectedClient.subscriptions} map.
	 *
	 * Channels with unsupported shapes (e.g. `ahp-otlp://logs/verbose`
	 * with no recognised level, or a state channel the state manager
	 * does not know about) are silently dropped.
	 */
	private _addInitialSubscription(client: IConnectedClient, channel: string): IStateSnapshot | undefined {
		const sub = classifyChannel(channel);
		if (!sub) {
			return undefined;
		}
		if (sub.kind === ChannelKind.OtlpLogs) {
			if (!this._config.otlpLogEmitter) {
				this._logService.warn(`[ProtocolServer] Ignoring OTLP initialSubscription ${channel}: no OTLP emitter configured.`);
				return undefined;
			}
			client.subscriptions.set(sub.uri, sub);
			return undefined;
		}
		const snapshot = this._stateManager.getSnapshot(channel);
		if (!snapshot) {
			return undefined;
		}
		client.subscriptions.set(sub.uri, sub);
		this._agentService.addSubscriber(URI.parse(sub.uri), client.clientId);
		this._clearClientToolCallDisconnectTimeout(client.clientId, sub.uri);
		return snapshot;
	}

	/**
	 * Forwards a client's upgrade request to the hosting VS Code CLI's
	 * HTTP management API (advertised via the {@link VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV}).
	 * Returns the CLI's parsed response verbatim so the client can render
	 * a meaningful status (already up-to-date, restart scheduled, etc.).
	 *
	 * When the server was not spawned by a managing CLI, responds with
	 * `MethodNotFound` — the upgrade method is only meaningfully callable
	 * on CLI-hosted servers.
	 */
	private _handleVscodeUpgrade(id: number, transport: IProtocolTransport): void {
		const socketPath = getAgentHostManagementSocketPath();
		if (!socketPath) {
			transport.send(jsonRpcError(
				id,
				JsonRpcErrorCodes.MethodNotFound,
				`No upgrade supervisor is available for this agent host.`,
			));
			return;
		}
		requestAgentHostUpgrade(socketPath).then(
			(result) => transport.send(jsonRpcSuccess(id, result)),
			(err: unknown) => {
				this._logService.warn(`[ProtocolServer] vscodeUpgrade signal failed: ${err instanceof Error ? err.message : String(err)}`);
				transport.send(jsonRpcErrorFrom(id, err));
			},
		);
	}

	private _handleReconnect(
		params: ReconnectParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; responsePromise: Promise<unknown> } {
		this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);

		// Synchronously install the client so messages arriving on this transport
		// while we restore subscriptions can find a valid client object. The
		// reconnect response is only sent once `responsePromise` resolves below.
		const client: IConnectedClient = {
			clientId: params.clientId,
			protocolVersion: PROTOCOL_VERSION,
			transport,
			subscriptions: new Map(),
			disposables,
		};
		const record = this._ensureClientRecord(params.clientId);
		record.connection = client;
		record.lastSeenAt = Date.now();
		this._pruneClientRecords();
		this._onDidChangeConnectionCount.fire(this._connectedClientCount);

		// Re-establish the reverse-RPC filesystem authority for this client.
		// The prior transport's `onClose` disposed the previous registration,
		// so without this step any subsequent `resourceRead` / `resourceWrite`
		// / etc. from the agent host would fail with "no connection registered
		// for authority" until the client disconnected and re-initialized.
		this._registerClientFileSystemAuthority(params.clientId, disposables);

		const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
		const canReplay = params.lastSeenServerSeq >= oldestBuffered;

		const responsePromise = this._restoreReconnectSubscriptions(client, params, canReplay);
		return { client, responsePromise };
	}

	/**
	 * Wires the reverse-RPC filesystem callbacks for `clientId` and binds
	 * the unregister to `disposables` (the transport's per-connection
	 * store). The callbacks dispatch through {@link _sendReverseRequest},
	 * which looks up the *current* connected client by id — so re-binding
	 * after a reconnect picks up the new transport without rebuilding the
	 * closures.
	 */
	private _registerClientFileSystemAuthority(clientId: string, disposables: DisposableStore): void {
		disposables.add(this._clientFileSystemProvider.registerAuthority(clientId, {
			resourceList: (uri) => this._sendReverseRequest(clientId, 'resourceList', { uri: uri.toString() }),
			resourceRead: (uri) => this._sendReverseRequest(clientId, 'resourceRead', { uri: uri.toString() }),
			resourceWrite: (params_) => this._sendReverseRequest(clientId, 'resourceWrite', params_),
			resourceCopy: (params_) => this._sendReverseRequest(clientId, 'resourceCopy', params_),
			resourceDelete: (params_) => this._sendReverseRequest(clientId, 'resourceDelete', params_),
			resourceMove: (params_) => this._sendReverseRequest(clientId, 'resourceMove', params_),
			resourceRequest: (params_) => this._sendReverseRequest(clientId, 'resourceRequest', params_),
			resourceResolve: (params_) => this._sendReverseRequest(clientId, 'resourceResolve', params_),
			resourceMkdir: (params_) => this._sendReverseRequest(clientId, 'resourceMkdir', params_),
		}));
	}

	/**
	 * Re-establish each of the client's prior subscriptions on the server side.
	 * Uses {@link IAgentService.subscribe} (rather than a bare `addSubscriber`
	 * + `getSnapshot`) so any session state that was evicted while the client
	 * was disconnected is restored. Returns the appropriate reconnect response
	 * payload — `replay` actions when the client's last-seen seq is still in
	 * the buffer, otherwise fresh `snapshot`s.
	 */
	private async _restoreReconnectSubscriptions(
		client: IConnectedClient,
		params: ReconnectParams,
		canReplay: boolean,
	): Promise<unknown> {
		const missing: string[] = [];
		const snapshots = await Promise.all(params.subscriptions.map(async sub => {
			const key = sub.toString();
			const classified = classifyChannel(key);
			if (!classified) {
				return undefined;
			}
			if (classified.kind === ChannelKind.OtlpLogs) {
				if (!this._config.otlpLogEmitter) {
					this._logService.warn(`[ProtocolServer] Reconnect: dropping OTLP subscription ${key}: no OTLP emitter configured.`);
					return undefined;
				}
				// Stateless: re-install without going through the agent service.
				client.subscriptions.set(classified.uri, classified);
				return undefined;
			}
			if (classified.kind === ChannelKind.ResourceWatch) {
				const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
				if (!descriptor) {
					this._logService.info(`[ProtocolServer] Reconnect: resource watch ${key} no longer parses`);
					missing.push(sub);
					return undefined;
				}
				client.subscriptions.set(classified.uri, classified);
				return {
					resource: classified.uri,
					state: descriptor,
					fromSeq: this._stateManager.serverSeq,
				};
			}
			try {
				const snapshot = await this._agentService.subscribe(URI.parse(key), client.clientId);
				client.subscriptions.set(classified.uri, classified);
				this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
				return snapshot;
			} catch (err) {
				this._logService.info(`[ProtocolServer] Reconnect: failed to restore subscription ${key}: ${err instanceof Error ? err.message : String(err)}`);
				missing.push(sub);
				return undefined;
			}
		}));

		if (canReplay) {
			const actions: ActionEnvelope[] = [];
			for (const envelope of this._replayBuffer) {
				if (envelope.serverSeq > params.lastSeenServerSeq) {
					if (this._isRelevantToClient(client, envelope)) {
						actions.push(envelope);
					}
				}
			}
			return { type: 'replay', actions, missing };
		}
		return { type: 'snapshot', snapshots: snapshots.filter((s): s is IStateSnapshot => s !== undefined) };
	}

	private _handleClientDisconnected(clientId: string): void {
		for (const session of this._stateManager.getSessionUris()) {
			const state = this._stateManager.getSessionState(session);
			const ownsPendingToolCall = state ? this._hasPendingClientToolCall(state, clientId) : false;
			if (state?.activeClient?.clientId === clientId) {
				this._stateManager.dispatchServerAction(session, {
					type: ActionType.SessionActiveClientChanged,
					activeClient: null,
				});
			}
			if (state?.activeClient?.clientId === clientId || ownsPendingToolCall) {
				this._startClientToolCallDisconnectTimeout(clientId, session);
			}
		}
	}

	/**
	 * Yields every still-pending client-contributed tool call in `state`'s
	 * active turn, paired with its owning `clientId`. Single source of truth
	 * for the disconnect-grace machinery: detect ownership
	 * ({@link _hasPendingClientToolCall}), arm timeouts
	 * ({@link _checkOrphanedClientToolCalls}), and fail orphaned calls
	 * ({@link _completeDisconnectedClientToolCalls}).
	 */
	private *_pendingClientToolCalls(state: SessionState | undefined) {
		const activeTurn = state?.activeTurn;
		if (!activeTurn) {
			return;
		}
		for (const part of activeTurn.responseParts) {
			if (part.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			const toolCall = part.toolCall;
			const contributor = toolCall.contributor;
			if (contributor?.kind === ToolCallContributorKind.Client && isPendingToolCallStatus(toolCall.status)) {
				yield { toolCall, clientId: contributor.clientId };
			}
		}
	}

	private _hasPendingClientToolCall(state: SessionState | undefined, clientId: string): boolean {
		for (const pending of this._pendingClientToolCalls(state)) {
			if (pending.clientId === clientId) {
				return true;
			}
		}
		return false;
	}

	private _hasReplacementActiveClientTool(state: SessionState, clientId: string, toolName: string): boolean {
		const activeClient = state.activeClient;
		return activeClient !== undefined
			&& activeClient.clientId !== clientId
			&& activeClient.tools.some(tool => tool.name === toolName);
	}

	/**
	 * Arm (or re-arm) the per-(clientId, session) timeout that fails pending
	 * client tool calls owned by `clientId` if it does not (re)connect. The
	 * delay is the remaining grace measured from when the client was last
	 * seen — so a client that disconnected a while before the call was issued
	 * gets the residual window rather than a fresh one, and a stamp from a
	 * long-dead client fails promptly. A client never seen at all has its
	 * grace clock pinned to the first arm, so re-arms triggered by later
	 * orphaned tool calls in the same session shrink the remaining window
	 * instead of resetting it.
	 */
	private _startClientToolCallDisconnectTimeout(clientId: string, session: string): void {
		this._clearClientToolCallDisconnectTimeout(clientId, session);
		const record = this._ensureClientRecord(clientId);
		if (record.lastSeenAt === undefined) {
			record.lastSeenAt = Date.now();
		}
		const elapsed = Date.now() - record.lastSeenAt;
		const delay = Math.max(0, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT - elapsed);
		record.disconnectTimeouts.set(session, disposableTimeout(() => {
			record.disconnectTimeouts.deleteAndDispose(session);
			this._completeDisconnectedClientToolCalls(clientId, session);
		}, delay));
	}

	/**
	 * Scan a session for pending client tool calls whose owning client is not
	 * currently connected, and arm the disconnect timeout for each such owner.
	 * Called when a `SessionToolCallStart` / `SessionToolCallReady` envelope is
	 * observed — covering calls issued for an already-gone client, which the
	 * live disconnect path never sees. Ownerless client tool calls (no client
	 * connected at stamp time) are failed immediately by the provider, so they
	 * never reach a pending state here.
	 */
	private _checkOrphanedClientToolCalls(session: string): void {
		const state = this._stateManager.getSessionState(session);
		const orphanOwners = new Set<string>();
		for (const { clientId } of this._pendingClientToolCalls(state)) {
			const ownerRecord = this._clients.get(clientId);
			if (!ownerRecord || ownerRecord.connection === undefined) {
				orphanOwners.add(clientId);
			}
		}
		for (const ownerId of orphanOwners) {
			this._startClientToolCallDisconnectTimeout(ownerId, session);
		}
	}

	/**
	 * Get the existing per-client record or create an empty one. A freshly
	 * created record has no connection and `lastSeenAt === undefined`.
	 */
	private _ensureClientRecord(clientId: string): IClientRecord {
		let record = this._clients.get(clientId);
		if (!record) {
			record = { connection: undefined, lastSeenAt: undefined, disconnectTimeouts: new DisposableMap() };
			this._clients.set(clientId, record);
		}
		return record;
	}

	/** Number of records that currently hold a live connection. */
	private get _connectedClientCount(): number {
		let count = 0;
		for (const record of this._clients.values()) {
			if (record.connection) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Drop disconnected, timer-less client records whose last-seen time is
	 * stale beyond the retention window (10× the disconnect timeout), plus
	 * never-connected placeholder records (e.g. a stamp from a long-dead
	 * client) once their timeouts have fired. Bounds {@link _clients} without
	 * tracking liveness precisely — a pruned-then-resurfacing stamp simply
	 * falls back to the full grace window.
	 */
	private _pruneClientRecords(): void {
		const cutoff = Date.now() - CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT * 10;
		for (const [clientId, record] of this._clients) {
			if (record.connection === undefined
				&& record.disconnectTimeouts.size === 0
				&& (record.lastSeenAt === undefined || record.lastSeenAt < cutoff)) {
				this._clients.delete(clientId);
			}
		}
	}

	private _clearClientToolCallDisconnectTimeout(clientId: string, session: string): void {
		this._clients.get(clientId)?.disconnectTimeouts.deleteAndDispose(session);
	}

	private _completeDisconnectedClientToolCalls(clientId: string, session: string): void {
		const state = this._stateManager.getSessionState(session);
		const activeTurn = state?.activeTurn;
		if (!state || !activeTurn) {
			return;
		}
		for (const { toolCall, clientId: ownerId } of this._pendingClientToolCalls(state)) {
			if (ownerId !== clientId) {
				continue;
			}
			const mayRetryWithReplacementClient = this._hasReplacementActiveClientTool(state, clientId, toolCall.toolName);
			if (toolCall.status === ToolCallStatus.Streaming) {
				this._stateManager.dispatchServerAction(session, {
					type: ActionType.SessionToolCallReady,
					turnId: activeTurn.id,
					toolCallId: toolCall.toolCallId,
					invocationMessage: toolCall.invocationMessage ?? toolCall.displayName,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				});
			}
			this._stateManager.dispatchServerAction(session, {
				type: ActionType.SessionToolCallComplete,
				turnId: activeTurn.id,
				toolCallId: toolCall.toolCallId,
				result: {
					success: false,
					pastTenseMessage: `${toolCall.displayName} failed`,
					...(mayRetryWithReplacementClient ? { content: [{ type: ToolResultContentType.Text, text: `The client that was running ${toolCall.displayName} disconnected, but another active client now provides ${toolCall.displayName}. You may try calling the tool again.` }] } : {}),
					error: { message: `Client ${clientId} disconnected before completing ${toolCall.displayName}` },
				},
			});
		}
	}

	// ---- Requests (expect a response) ---------------------------------------

	/**
	 * Methods handled by the request dispatcher (excludes initialize/reconnect
	 * which are handled during the handshake phase).
	 */
	private readonly _requestHandlers: RequestHandlerMap = {
		subscribe: async (client, params) => {
			const classified = classifyChannel(params.channel);
			if (!classified) {
				// OTLP-flavoured URI we don't understand (e.g. unknown
				// level). Acknowledge as stateless so the client doesn't
				// hang, but install nothing.
				return {};
			}
			if (classified.kind === ChannelKind.OtlpLogs) {
				if (!this._config.otlpLogEmitter) {
					this._logService.warn(`[ProtocolServer] Ignoring OTLP subscribe for ${params.channel}: no OTLP emitter configured.`);
					return {};
				}
				client.subscriptions.set(classified.uri, classified);
				return {};
			}
			if (classified.kind === ChannelKind.ResourceWatch) {
				const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
				if (!descriptor) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource watch not found: ${params.channel}`);
				}
				client.subscriptions.set(classified.uri, classified);
				return {
					snapshot: {
						resource: classified.uri,
						state: descriptor,
						fromSeq: this._stateManager.serverSeq,
					},
				};
			}
			try {
				const snapshot = await this._agentService.subscribe(URI.parse(params.channel), client.clientId);
				client.subscriptions.set(classified.uri, classified);
				this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
				return { snapshot };
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.channel}`);
			}
		},
		createSession: async (_client, params) => {
			let createdSession: URI;
			// Resolve fork turnId to a 0-based index using the source session's
			// turn list in the state manager.
			let fork: { session: URI; turnIndex: number; turnId: string } | undefined;
			if (params.fork) {
				const sourceState = this._stateManager.getSessionState(params.fork.session);
				if (!sourceState) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork source session not found: ${params.fork.session}`);
				}
				const turnIndex = sourceState.turns.findIndex(t => t.id === params.fork!.turnId);
				if (turnIndex < 0) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork turn ID ${params.fork.turnId} not found in session ${params.fork.session}`);
				}
				fork = { session: URI.parse(params.fork.session), turnIndex, turnId: params.fork.turnId };
			}
			// If the client eagerly claimed the active client role, validate
			// the clientId matches the connection before forwarding.
			if (params.activeClient && params.activeClient.clientId !== _client.clientId) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `createSession.activeClient.clientId must match the connection's clientId`);
			}
			try {
				createdSession = await this._agentService.createSession({
					provider: params.provider,
					model: params.model,
					agent: params.agent,
					workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
					session: URI.parse(params.channel),
					fork,
					config: params.config,
					activeClient: params.activeClient,
				});
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
			}
			// Verify the provider honored the client-chosen session URI per the protocol contract
			if (createdSession.toString() !== URI.parse(params.channel).toString()) {
				this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.channel}`);
			}
			return null;
		},
		disposeSession: async (_client, params) => {
			await this._agentService.disposeSession(URI.parse(params.channel));
			return null;
		},
		resourceWrite: async (_client, params) => {
			return this._agentService.resourceWrite(params);
		},
		listSessions: async () => {
			const sessions = await this._agentService.listSessions();
			const items = sessions.map(s => {
				const provider = AgentSession.provider(s.session);
				if (!provider) {
					throw new Error(`Agent session URI has no provider scheme: ${s.session.toString()}`);
				}
				// Encode isRead/isArchived as status bitmask flags
				let status = s.status ?? SessionStatus.Idle;
				if (s.isRead) {
					status |= SessionStatus.IsRead;
				}
				if (s.isArchived) {
					status |= SessionStatus.IsArchived;
				}
				return {
					resource: s.session.toString(),
					provider,
					title: s.summary ?? 'Session',
					status,
					activity: s.activity,
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
					...(s.project ? { project: { uri: s.project.uri.toString(), displayName: s.project.displayName } } : {}),
					model: s.model,
					workingDirectory: s.workingDirectory?.toString(),
					changes: s.changes,
				};
			});
			return { items };
		},
		resolveSessionConfig: async (_client, params) => {
			return this._agentService.resolveSessionConfig({
				provider: params.provider,
				workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
				config: params.config,
			});
		},
		sessionConfigCompletions: async (_client, params) => {
			return this._agentService.sessionConfigCompletions({
				provider: params.provider,
				workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
				config: params.config,
				property: params.property,
				query: params.query,
			});
		},
		completions: async (_client, params) => {
			return this._agentService.completions(params);
		},
		fetchTurns: async (_client, params) => {
			const state = this._stateManager.getSessionState(params.channel);
			if (!state) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
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
		resourceList: async (_client, params) => {
			return this._agentService.resourceList(URI.parse(params.uri));
		},
		resourceRead: async (_client, params) => {
			return this._agentService.resourceRead(URI.parse(params.uri));
		},
		resourceCopy: async (_client, params) => {
			return this._agentService.resourceCopy(params);
		},
		resourceDelete: async (_client, params) => {
			return this._agentService.resourceDelete(params);
		},
		resourceMove: async (_client, params) => {
			return this._agentService.resourceMove(params);
		},
		resourceResolve: async (_client, params) => {
			return this._agentService.resourceResolve(params);
		},
		resourceMkdir: async (_client, params) => {
			return this._agentService.resourceMkdir(params);
		},
		createResourceWatch: async (_client, params) => {
			return this._agentService.createResourceWatch(params);
		},
		resourceRequest: async (_client, _params) => {
			// The local agent host does not yet enforce per-resource grants
			// for client → server access. Always grant; receivers MAY rescind
			// access by returning `PermissionDenied` on subsequent operations.
			return {};
		},
		authenticate: async (_client, params) => {
			const result = await this._agentService.authenticate(params);
			if (!result.authenticated) {
				throw new ProtocolError(AHP_AUTH_REQUIRED, `Authentication failed for resource: ${params.resource}`);
			}
			return {};
		},
		createTerminal: async (_client, params) => {
			await this._agentService.createTerminal(params);
			return null;
		},
		disposeTerminal: async (_client, params) => {
			await this._agentService.disposeTerminal(URI.parse(params.channel));
			return null;
		},
		invokeChangesetOperation: async (_client, params) => {
			return this._agentService.invokeChangesetOperation(params);
		},
	};


	// ---- Reverse RPC (server → client requests) ----------------------------

	private _reverseRequestId = 0;
	private readonly _pendingReverseRequests = new Map<number, { clientId: string; resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

	/**
	 * Sends a JSON-RPC request to a connected client and waits for the response.
	 * Used for reverse-RPC operations like reading client-side files.
	 * Rejects if the client disconnects or the server is disposed.
	 */
	private _sendReverseRequest<T>(clientId: string, method: string, params: unknown): Promise<T> {
		const client = this._clients.get(clientId)?.connection;
		if (!client) {
			return Promise.reject(new Error(`Client ${clientId} is not connected`));
		}
		const id = ++this._reverseRequestId;
		return new Promise<T>((resolve, reject) => {
			this._pendingReverseRequests.set(id, { clientId, resolve: resolve as (value: unknown) => void, reject });
			const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
			client.transport.send(request);
		});
	}

	/**
	 * Rejects and clears all pending reverse-RPC requests for a given client.
	 */
	private _rejectPendingReverseRequests(clientId: string): void {
		for (const [id, pending] of this._pendingReverseRequests) {
			if (pending.clientId === clientId) {
				this._pendingReverseRequests.delete(id);
				pending.reject(new Error(`Client ${clientId} disconnected`));
			}
		}
	}

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

		// MCP side-channel: requests targeting an `mcp://` channel carry the
		// channel URI in `params.channel`. We forward them through the
		// agent service, which routes by `<providerId>/<sessionId>/<serverName>`
		// to the owning agent's MCP App implementation. Unknown channels and
		// unknown methods are rejected with `-32601`.
		const mcpChannel = readMcpChannel(params);
		if (mcpChannel !== undefined) {
			const paramsObj = isParamsObject(params) ? params : undefined;
			this._agentService.handleMcpRequest(mcpChannel, method, paramsObj).then(result => {
				client.transport.send(jsonRpcSuccess(id, result ?? null));
			}).catch(err => {
				if (err instanceof Error && err.message.startsWith('Method not found')) {
					client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, err.message));
					return;
				}
				this._logService.error(`[ProtocolServer] mcp:// request '${method}' on ${mcpChannel} failed`, err);
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
	private _handleExtensionRequest(method: string, _params: unknown): Promise<unknown> | undefined {
		switch (method) {
			case 'shutdown':
				return this._agentService.shutdown();
			default:
				return undefined;
		}
	}

	// ---- Broadcasting -------------------------------------------------------

	private _broadcastAction(envelope: ActionEnvelope): void {
		this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
		const msg: AhpServerNotification<'action'> = { jsonrpc: '2.0', method: 'action', params: envelope };
		for (const record of this._clients.values()) {
			const client = record.connection;
			if (client && this._isRelevantToClient(client, envelope)) {
				client.transport.send(msg);
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		// Each protocol notification now ships as its own top-level method. The
		// `type` discriminant on our local {@link ProtocolNotification} union is
		// the wire-level method name, so we can route it directly.
		const { type, ...params } = notification;
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const msg = { jsonrpc: '2.0', method: type, params } as AhpServerNotification;
		for (const record of this._clients.values()) {
			record.connection?.transport.send(msg);
		}
	}

	/**
	 * Forward an MCP server-originated notification (e.g.
	 * `notifications/tools/list_changed`) over the AHP transport. The
	 * `channel` field on `params` is the AHP routing envelope; the
	 * receiving client demultiplexes by it. Notifications are broadcast
	 * to every connected client — per-channel subscription filtering is
	 * left to the client, since MCP notifications are cheap and the
	 * client already knows which channels it cares about.
	 */
	private _broadcastMcpNotification(notification: IMcpNotification): void {
		const params: Record<string, unknown> = { ...(notification.params ?? {}), channel: notification.channel };
		// MCP notifications don't share a discriminated `method` literal
		// with the known {@link AhpServerNotification} union, so cast
		// through `unknown` to satisfy the transport contract.
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const msg = { jsonrpc: '2.0' as const, method: notification.method, params } as unknown as AhpServerNotification;
		for (const record of this._clients.values()) {
			record.connection?.transport.send(msg);
		}
	}

	/**
	 * Drop a subscription identified by `channel` from `client`. Handles
	 * canonicalisation for OTLP URIs (so an `unsubscribe` with a URI
	 * variant collapses to the same entry as the original `subscribe`)
	 * and tears down the agent-service refcount for state channels.
	 */
	private _removeSubscription(client: IConnectedClient, channel: string): void {
		const classified = classifyChannel(channel);
		if (!classified) {
			// OTLP-flavoured URI with an unknown level — there can never
			// have been a matching subscription. Silently ignore.
			return;
		}
		const sub = client.subscriptions.get(classified.uri);
		if (!sub) {
			return;
		}
		client.subscriptions.delete(classified.uri);
		if (sub.kind === ChannelKind.State) {
			this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
		} else if (sub.kind === ChannelKind.ResourceWatch) {
			this._agentService.onResourceWatchUnsubscribed(sub.uri);
		}
	}

	/**
	 * Fan out an OTLP log record to every connected client that has
	 * subscribed to a logs channel whose `{level}` band includes the
	 * record's `severityNumber`. The notification's `channel` field is
	 * the canonical URI the client subscribed against — clients can
	 * route by URI without re-deriving the level.
	 */
	private _broadcastOtlpLog(record: IOtlpLogRecord): void {
		const payload = toResourceLogsPayload(record);
		for (const clientRecord of this._clients.values()) {
			const client = clientRecord.connection;
			if (!client) {
				continue;
			}
			for (const sub of client.subscriptions.values()) {
				if (sub.kind !== ChannelKind.OtlpLogs) {
					continue;
				}
				if (record.severityNumber < levelToSeverityNumber(sub.level)) {
					continue;
				}
				const msg: AhpServerNotification<'otlp/exportLogs'> = {
					jsonrpc: '2.0',
					method: 'otlp/exportLogs',
					params: { channel: sub.uri, payload },
				};
				client.transport.send(msg);
			}
		}
	}

	private _isRelevantToClient(client: IConnectedClient, envelope: ActionEnvelope): boolean {
		// The root channel has two equivalent string forms (`ahp-root://` and
		// the URI-roundtripped `ahp-root:`). Treat them interchangeably so a
		// client that subscribed with either form receives root broadcasts
		// regardless of which form the envelope carries. See
		// {@link isAhpRootChannel}.
		if (isAhpRootChannel(envelope.channel)) {
			for (const sub of client.subscriptions.values()) {
				if (sub.kind === ChannelKind.State && isAhpRootChannel(sub.uri)) {
					return true;
				}
			}
			return false;
		}
		const sub = client.subscriptions.get(envelope.channel);
		return sub?.kind === ChannelKind.State || sub?.kind === ChannelKind.ResourceWatch;
	}

	override dispose(): void {
		for (const record of this._clients.values()) {
			record.connection?.disposables.dispose();
			record.disconnectTimeouts.dispose();
		}
		this._clients.clear();
		for (const [, pending] of this._pendingReverseRequests) {
			pending.reject(new Error('ProtocolServerHandler disposed'));
		}
		this._pendingReverseRequests.clear();
		this._replayBuffer.length = 0;
		super.dispose();
	}
}
