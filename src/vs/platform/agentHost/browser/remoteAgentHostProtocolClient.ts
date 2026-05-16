/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol client for communicating with a remote agent host process.
// Wraps WebSocketClientTransport and SessionClientState to provide a
// higher-level API matching IAgentService.

import { DeferredPromise, IntervalTimer } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, IReference } from '../../../base/common/lifecycle.js';
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
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ProtocolError, ReconnectResultType, type ProtocolMessage, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { isClientTransport, type IProtocolTransport } from '../common/state/sessionTransport.js';
import { AhpErrorCodes } from '../common/state/protocol/errors.js';
import { ContentEncoding, ResourceRequestParams, type CompletionsParams, type CompletionsResult, type CreateTerminalParams, type ResolveSessionConfigResult, type SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { ILoadEstimator, LoadEstimator } from '../../../base/parts/ipc/common/ipc.net.js';

const AHP_CLIENT_CONNECTION_CLOSED = -32000;

/** Initial delay before the first transport-level reconnect attempt. */
const RECONNECT_INITIAL_DELAY_MS = 1_000;

/** Upper bound on the exponential backoff between reconnect attempts. */
const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * How often the connection liveness watchdog runs.
 *
 * Mirrors {@link ProtocolConstants.KeepAliveSendTime} from the regular
 * remote extension host stack. Cheap because the check is just a couple
 * of timestamp comparisons.
 */
const WATCHDOG_CHECK_INTERVAL_MS = 5_000;

/**
 * If a request has been outstanding for this long AND no message of any
 * kind has been received in the same window, declare the transport dead
 * and force-close it so the renderer's reconnect logic kicks in.
 *
 * Matches {@link ProtocolConstants.TimeoutTime} from the regular remote
 * extension host stack.
 *
 * Idle connections are not probed — no ping traffic is sent. The first
 * user-driven request after the transport goes silent will surface the
 * timeout within {@link WATCHDOG_TIMEOUT_MS}ms.
 */
const WATCHDOG_TIMEOUT_MS = 20_000;

function connectionTimeoutError(address: string, sinceLastReadMs: number, oldestRequestAgeMs: number): ProtocolError {
	return new ProtocolError(
		AHP_CLIENT_CONNECTION_CLOSED,
		`Connection appears dead: ${address}; no message received for ${sinceLastReadMs}ms, oldest pending request is ${oldestRequestAgeMs}ms old.`,
	);
}

function connectionClosedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection closed: ${address}`);
}

function connectionDisposedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection disposed: ${address}`);
}

function transportLostError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Transport lost (reconnecting): ${address}`);
}

interface IRemoteAgentHostExtensionCommandMap {
	'shutdown': { params: undefined; result: void };
}

/**
 * High-level connection state of a {@link RemoteAgentHostProtocolClient}.
 * Exposed via {@link RemoteAgentHostProtocolClient.onDidChangeConnectionState}
 * so consumers can surface transient reconnect activity in the UI.
 */
export const enum AgentHostClientState {
	/** Initial handshake in progress. */
	Connecting = 'connecting',
	/** Transport is open and handshake/reconnect has completed. */
	Connected = 'connected',
	/** Transport closed unexpectedly; an automatic reconnect is in flight or scheduled. */
	Reconnecting = 'reconnecting',
	/** Client has been disposed or has given up reconnecting. Terminal state. */
	Closed = 'closed',
}

/**
 * Reconnect-only bookkeeping. Lives exclusively inside the `Reconnecting`
 * variant of {@link ClientState} so the fields can't be read or mutated when
 * they're not meaningful.
 */
interface IReconnectState {
	/**
	 * Resolves when the current attempt's handshake succeeds; rejected and
	 * replaced (via {@link _newReconnectGate}) on a failed attempt so awaiting
	 * callers see the failure while new callers gate on the next attempt.
	 */
	gate: DeferredPromise<void>;
	/**
	 * Wire messages buffered while the gate is engaged. Drained onto the new
	 * transport by {@link _drainAfterReconnect} once the handshake completes;
	 * survives across failed attempts so messages ride through retry cycles.
	 */
	readonly outbox: ProtocolMessage[];
	/** Number of reconnect attempts performed in this reconnect cycle. */
	attempt: number;
	/** Timer for the next scheduled attempt, if any. */
	timeoutHandle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Internal connection state, discriminated by {@link AgentHostClientState}.
 * Mutually-exclusive fields (close error, reconnect bookkeeping) live inside
 * the variant where they're meaningful so callers can't accidentally read or
 * write them in the wrong state.
 */
type ClientState =
	| { readonly kind: AgentHostClientState.Connecting }
	| { readonly kind: AgentHostClientState.Connected }
	| { readonly kind: AgentHostClientState.Reconnecting; readonly reconnect: IReconnectState }
	| { readonly kind: AgentHostClientState.Closed; readonly error: ProtocolError };

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
	private readonly _transportFactory: (() => IProtocolTransport) | undefined;
	private _transport!: IProtocolTransport;
	/** Disposable holding the listeners attached to the current transport. */
	private readonly _transportListeners = this._register(new MutableDisposable<DisposableStore>());
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

	private readonly _onDidChangeConnectionState = this._register(new Emitter<AgentHostClientState>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

	/**
	 * Discriminated state union. Read via narrowing (`_state.kind === ...`);
	 * reconnect-only fields like the gate/outbox/attempt counter are only
	 * accessible while {@link _state.kind} is {@link AgentHostClientState.Reconnecting},
	 * and the close error is only accessible while it's {@link AgentHostClientState.Closed}.
	 */
	private _state: ClientState = { kind: AgentHostClientState.Connecting };

	/** Pending JSON-RPC requests keyed by request id. */
	private readonly _pendingRequests = new Map<number, { deferred: DeferredPromise<unknown>; sentAt: number }>();
	private _nextRequestId = 1;

	/**
	 * Timestamp of the most recent message of any kind received from the
	 * server. Updated in {@link _handleMessage}. Used by the watchdog to
	 * decide if the transport has gone silent.
	 */
	private _lastReadTime = Date.now();

	/**
	 * Periodic check that fires {@link _handleClose} when there are
	 * outstanding requests *and* nothing has been received for
	 * {@link WATCHDOG_TIMEOUT_MS}ms. Detects silently-dead transports
	 * (e.g. SSH/tunnel after laptop sleep + network change) that don't
	 * produce a socket close event of their own. See {@link _watchdogTick}.
	 */
	private readonly _watchdog = this._register(new IntervalTimer());

	/**
	 * Used to suppress watchdog-triggered closes when our own JS event loop
	 * has been pegged — in that case the silence is on our side, not the
	 * remote's, and tearing down the transport would just generate a useless
	 * reconnect cycle that aborts in-flight requests.
	 */
	private readonly _loadEstimator: ILoadEstimator;

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

	get connectionState(): AgentHostClientState {
		return this._state.kind;
	}

	constructor(
		address: string,
		transportOrFactory: IProtocolTransport | (() => IProtocolTransport),
		loadEstimator: ILoadEstimator | undefined,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostPermissionService private readonly _permissionService: IAgentHostPermissionService,
	) {
		super();
		this._address = address;
		this._connectionAuthority = agentHostAuthority(address);
		this._loadEstimator = loadEstimator ?? LoadEstimator.getInstance();

		if (typeof transportOrFactory === 'function') {
			this._transportFactory = transportOrFactory;
			this._installTransport(transportOrFactory());
		} else {
			this._transportFactory = undefined;
			this._installTransport(transportOrFactory);
		}

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

		// Detect silently-dead transports — see {@link _watchdogTick}.
		this._watchdog.cancelAndSet(() => this._watchdogTick(), WATCHDOG_CHECK_INTERVAL_MS);
	}

	/**
	 * Install a transport and wire listeners. Used both for the initial
	 * transport and for replacements created by the factory during a
	 * transport-level reconnect.
	 */
	private _installTransport(transport: IProtocolTransport): void {
		const listeners = new DisposableStore();
		listeners.add(transport);
		listeners.add(transport.onMessage(msg => this._handleMessage(msg)));
		listeners.add(transport.onClose(() => this._handleTransportClose()));
		this._transport = transport;
		this._transportListeners.value = listeners;
	}

	/**
	 * Transition to a new {@link ClientState}. Fires {@link onDidChangeConnectionState}
	 * only when the variant kind actually changes; in-place mutation of
	 * reconnect-state fields (e.g. swapping the gate on a failed retry) does
	 * NOT count as a transition and produces no event.
	 */
	private _transitionTo(next: ClientState): void {
		if (this._state.kind === next.kind) {
			return;
		}
		this._state = next;
		this._onDidChangeConnectionState.fire(next.kind);
	}

	private _newReconnectGate(): DeferredPromise<void> {
		const deferred = new DeferredPromise<void>();
		// Always-attached handler so a rejection without an awaiter (e.g. a
		// retry-fail during the reconnect RPC bypass window) doesn't get
		// flagged as unhandled. Actual consumers attach their own `.then`/`await`.
		deferred.p.then(undefined, () => { /* swallow — each real consumer handles its own await */ });
		return deferred;
	}

	private _newReconnectState(): IReconnectState {
		return { gate: this._newReconnectGate(), outbox: [], attempt: 0, timeoutHandle: undefined };
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
		this._transitionTo({ kind: AgentHostClientState.Connected });
	}

	/**
	 * Called from the transport's `onClose` event. When a {@link _transportFactory}
	 * is configured we attempt to soft-reconnect rather than fire `onDidClose` —
	 * the protocol-level `reconnect` request lets the server replay missed
	 * actions and preserves the `clientId` so pending tool calls etc. are not
	 * cancelled by the host-side disconnect timeout. Without a factory
	 * (passive-transport SSH/relay path) we fall back to "close means closed"
	 * and let the service decide whether to spin up a fresh client.
	 */
	private _handleTransportClose(): void {
		switch (this._state.kind) {
			case AgentHostClientState.Closed:
				return;
			case AgentHostClientState.Connecting:
				// No handshake yet; we can't resume so always treat as fatal
				// regardless of whether a factory is configured.
				this._handleClose(connectionClosedError(this._address));
				return;
			case AgentHostClientState.Connected: {
				if (!this._transportFactory) {
					// Passive-transport path (SSH/tunnel): the transport
					// can't be reconstructed from here, so we surface the
					// close and let the service decide whether to spin up
					// a fresh client.
					this._handleClose(connectionClosedError(this._address));
					return;
				}
				this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address}; scheduling reconnect.`);
				this._transitionTo({ kind: AgentHostClientState.Reconnecting, reconnect: this._newReconnectState() });
				this._watchdog.cancel();
				// In-flight requests can't be answered — the new transport has a
				// separate request-id space. Reject them so callers can retry.
				this._rejectPendingRequests(transportLostError(this._address));
				this._scheduleReconnect();
				return;
			}
			case AgentHostClientState.Reconnecting:
				// A second transport drop while a reconnect was already in flight.
				// Reject the in-flight `reconnect` RPC so `_attemptReconnect`'s
				// catch path runs and schedules the next attempt — returning early
				// would leave the await pending forever (#agent-host-deadlock).
				// Scheduling lives in the catch so we don't end up with two
				// concurrent setTimeouts racing to install new transports.
				this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address} mid-reconnect; aborting the current attempt.`);
				this._watchdog.cancel();
				this._rejectPendingRequests(transportLostError(this._address));
				return;
		}
	}

	private _scheduleReconnect(): void {
		if (this._state.kind !== AgentHostClientState.Reconnecting || !this._transportFactory) {
			return;
		}
		const reconnect = this._state.reconnect;
		if (reconnect.timeoutHandle !== undefined) {
			return;
		}
		const attempt = reconnect.attempt + 1;
		const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY_MS);
		this._logService.info(`[RemoteAgentHostProtocol] Reconnecting to ${this._address} in ${delay}ms (attempt ${attempt}).`);
		reconnect.timeoutHandle = setTimeout(() => {
			if (this._state.kind === AgentHostClientState.Reconnecting) {
				this._state.reconnect.timeoutHandle = undefined;
			}
			void this._attemptReconnect();
		}, delay);
	}

	private async _attemptReconnect(): Promise<void> {
		if (this._state.kind !== AgentHostClientState.Reconnecting || !this._transportFactory) {
			return;
		}
		const reconnect = this._state.reconnect;
		reconnect.attempt++;
		let transport: IProtocolTransport | undefined;
		try {
			transport = this._transportFactory();
			this._installTransport(transport);
			if (isClientTransport(transport)) {
				await transport.connect();
			}
			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}

			const subscriptions = this._subscriptionManager.currentSubscriptionUris().map(u => u.toString());
			// Always include the always-live root state alongside getSubscription-managed entries.
			if (!subscriptions.includes(ROOT_STATE_URI)) {
				subscriptions.unshift(ROOT_STATE_URI);
			}
			const lastSeenServerSeq = this._serverSeq;
			const result = await this._dispatchRequest<CommandMap['reconnect']['result']>('reconnect', {
				clientId: this._clientId,
				lastSeenServerSeq,
				subscriptions,
			}, { bypassReconnectGate: true });

			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}

			this._applyReconnectResult(result);

			// Drain the outbox BEFORE the transition so listeners reacting to
			// {@link onDidChangeConnectionState} that synchronously dispatch see
			// state=Connected and go direct, landing after the drained outbox
			// in wire order.
			const { gate } = reconnect;
			this._drainAfterReconnect(reconnect.outbox);

			this._lastReadTime = Date.now();
			this._watchdog.cancelAndSet(() => this._watchdogTick(), WATCHDOG_CHECK_INTERVAL_MS);
			this._transitionTo({ kind: AgentHostClientState.Connected });
			gate.complete();
			this._logService.info(`[RemoteAgentHostProtocol] Reconnected to ${this._address}.`);
		} catch (err) {
			this._logService.warn(`[RemoteAgentHostProtocol] Reconnect attempt failed for ${this._address}: ${err instanceof Error ? err.message : String(err)}`);
			transport?.dispose();
			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}
			// Replace the gate so awaiting callers see the failure but new
			// callers gate on the next attempt instead of slipping through onto
			// the dead transport. Outbox carries forward to the next attempt.
			const oldGate = this._state.reconnect.gate;
			this._state.reconnect.gate = this._newReconnectGate();
			oldGate.error(err);
			this._scheduleReconnect();
		}
	}

	/**
	 * Apply a `reconnect` RPC result to the subscription manager. On `replay`
	 * we feed each missed envelope through the normal action path; on
	 * `snapshot` we reseat each named subscription with the fresh state and
	 * advance the server seq cursor accordingly.
	 */
	private _applyReconnectResult(result: CommandMap['reconnect']['result']): void {
		if (result.type === ReconnectResultType.Replay) {
			let maxSeq = this._serverSeq;
			for (const envelope of result.actions) {
				// For own non-rejected actions, drop the matching pending entry up
				// front so we don't resend it via {@link _replayPendingActions}.
				// For rejected actions we MUST leave the entry in place so the
				// subscription's reconcile path sees `idx !== -1` and discards
				// the action instead of applying it to confirmed state.
				if (envelope.origin?.clientId === this._clientId
					&& envelope.origin.clientSeq !== undefined
					&& !envelope.rejectionReason
					&& hasKey(envelope.action, { session: true })) {
					this._subscriptionManager.dropPendingSessionAction(envelope.action.session, envelope.origin.clientSeq);
				}
				if (envelope.serverSeq > maxSeq) {
					maxSeq = envelope.serverSeq;
				}
				this._onDidAction.fire(envelope);
			}
			this._serverSeq = maxSeq;
			if (result.missing.length > 0) {
				this._logService.info(`[RemoteAgentHostProtocol] Server cannot resume ${result.missing.length} subscription(s) after reconnect.`);
				this._subscriptionManager.markSubscriptionsMissing(result.missing.map(u => URI.parse(u)));
			}
		} else {
			let maxSeq = this._serverSeq;
			for (const snapshot of result.snapshots) {
				this._subscriptionManager.applyReconnectSnapshot(URI.parse(snapshot.resource), snapshot.state, snapshot.fromSeq);
				if (snapshot.fromSeq > maxSeq) {
					maxSeq = snapshot.fromSeq;
				}
			}
			this._serverSeq = maxSeq;
		}
	}

	/**
	 * Drain queued outgoing wire traffic after a successful soft reconnect:
	 *
	 * 1. Resend pending optimistic session actions that the server did NOT
	 *    echo back in the replay buffer (i.e. anything still on
	 *    {@link AgentSubscriptionManager.getPendingSessionActions}).
	 * 2. Flush every message that {@link _sendNotification} queued onto the
	 *    outbox while the gate was engaged.
	 *
	 * Replays are deduped against the outbox by `clientSeq` so a session
	 * action that was both optimistic-tracked AND queued during the
	 * reconnect window only goes out once.
	 */
	private _drainAfterReconnect(outbox: readonly ProtocolMessage[]): void {
		// Build the set of clientSeqs already represented in the outbox so we
		// don't replay a duplicate. Only `dispatchAction` notifications carry
		// a clientSeq; nothing else is independently re-emitted by the replay
		// path, so other queued message kinds need no dedup.
		const queuedSeqs = new Set<number>();
		for (const msg of outbox) {
			if (hasKey(msg, { method: true }) && msg.method === 'dispatchAction') {
				queuedSeqs.add(msg.params.clientSeq);
			}
		}

		const replays: ProtocolMessage[] = [];
		for (const entry of this._subscriptionManager.getPendingSessionActions()) {
			if (queuedSeqs.has(entry.clientSeq)) {
				continue;
			}
			this._grantImplicitReadsForOutgoingAction(entry.action);
			replays.push({
				jsonrpc: '2.0',
				method: 'dispatchAction',
				params: { clientSeq: entry.clientSeq, action: entry.action },
			});
		}

		if (replays.length > 0) {
			this._logService.info(`[RemoteAgentHostProtocol] Replaying ${replays.length} pending action(s) after reconnect to ${this._address}.`);
		}

		// Replays first (dispatched before the reconnect window), then the
		// outbox (dispatched during it) so wire order roughly tracks
		// dispatch order.
		for (const msg of replays) {
			this._transport.send(msg);
		}
		for (const msg of outbox) {
			this._transport.send(msg);
		}
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
	private dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, _clientId: string, clientSeq: number): void {
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
	 * Send an application-level ping and wait for the server's response.
	 * Used by {@link _watchdogTick} to keep idle connections under
	 * watchdog supervision; safe to call from external code as well.
	 *
	 * The returned promise rejects with a {@link ProtocolError} if the
	 * connection closes before a response arrives.
	 */
	async ping(): Promise<void> {
		await this._sendRequest('ping', {});
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
		if (this._state.kind === AgentHostClientState.Closed) {
			// After close, the transport may still emit late messages (e.g.
			// because the same shared event source is also feeding a newer
			// transport for the same connectionId). Drop them so they can't
			// trigger any side effects.
			return;
		}

		// Any inbound traffic — including this message — is evidence the
		// transport is still alive. Update before dispatch so the watchdog
		// is consistent even if a handler synchronously schedules work.
		this._lastReadTime = Date.now();

		if (isJsonRpcRequest(msg)) {
			this._handleReverseRequest(msg.id, msg.method, msg.params);
		} else if (isJsonRpcResponse(msg)) {
			const pending = this._pendingRequests.get(msg.id);
			if (pending) {
				this._pendingRequests.delete(msg.id);
				if (hasKey(msg, { error: true })) {
					this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
					pending.deferred.error(this._toProtocolError(msg.error));
				} else {
					pending.deferred.complete(msg.result);
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
		if (this._state.kind === AgentHostClientState.Closed) {
			return;
		}
		// Stop the watchdog so it doesn't keep ticking on a dead connection
		// (the client may outlive the close, waiting to be replaced).
		this._watchdog.cancel();
		if (this._state.kind === AgentHostClientState.Reconnecting) {
			const reconnect = this._state.reconnect;
			if (reconnect.timeoutHandle !== undefined) {
				clearTimeout(reconnect.timeoutHandle);
			}
			if (!reconnect.gate.isSettled) {
				reconnect.gate.error(error);
			}
			// Outbox is dropped when the reconnect state is discarded by the
			// transition below.
		}
		this._rejectPendingRequests(error);
		this._permissionService.connectionClosed(this._address);
		this._grantedCustomizationUris.clear();
		this._transitionTo({ kind: AgentHostClientState.Closed, error });
		this._onDidClose.fire();
	}

	private async _raceClose<T>(promise: Promise<T>): Promise<T> {
		if (this._state.kind === AgentHostClientState.Closed) {
			return Promise.reject(this._state.error);
		}

		let closeListener = Disposable.None;
		const closePromise = new Promise<never>((_resolve, reject) => {
			closeListener = this.onDidClose(() => reject(this._state.kind === AgentHostClientState.Closed ? this._state.error : connectionClosedError(this._address)));
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
		// Capture the transport at request-entry so async handlers (permission
		// checks, file ops) reply on the same transport the request arrived on.
		// Without this, a soft reconnect mid-handler would route the response
		// onto a new transport with a stale id — stray response at best, id
		// collision with a new server-issued reverse RPC at worst.
		const transport = this._transport;
		const sendResult = (result: unknown) => {
			transport.send({ jsonrpc: '2.0', id, result });
		};
		const sendError = (err: unknown) => {
			const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : undefined);
			let code = -32000;
			switch (fsCode) {
				case FileSystemProviderErrorCode.FileNotFound: code = AhpErrorCodes.NotFound; break;
				case FileSystemProviderErrorCode.NoPermissions: code = AhpErrorCodes.PermissionDenied; break;
				case FileSystemProviderErrorCode.FileExists: code = AhpErrorCodes.AlreadyExists; break;
			}
			transport.send({ jsonrpc: '2.0', id, error: { code, message: err instanceof Error ? err.message : String(err) } });
		};
		const sendPermissionDenied = (request: ResourceRequestParams | undefined) => {
			transport.send({
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
		if (this._state.kind === AgentHostClientState.Closed) {
			return;
		}
		// Generic M can't satisfy the distributive AhpNotification union directly
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const message = { jsonrpc: '2.0' as const, method, params } as ProtocolMessage;
		if (this._state.kind === AgentHostClientState.Reconnecting) {
			// Queue for the new transport — drained by {@link _drainAfterReconnect}
			// once the soft-reconnect handshake completes. The outbox persists
			// across failed attempts so a message rides through retry cycles
			// rather than being silently dropped.
			this._state.reconnect.outbox.push(message);
			return;
		}
		this._transport.send(message);
	}

	/** Send a typed JSON-RPC request for a protocol-defined method. */
	private _sendRequest<M extends keyof CommandMap>(method: M, params: CommandMap[M]['params']): Promise<CommandMap[M]['result']> {
		return this._dispatchRequest<CommandMap[M]['result']>(method, params);
	}

	/** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
	private _sendExtensionRequest<M extends keyof IRemoteAgentHostExtensionCommandMap>(method: M, params?: IRemoteAgentHostExtensionCommandMap[M]['params']): Promise<IRemoteAgentHostExtensionCommandMap[M]['result']> {
		return this._dispatchRequest<IRemoteAgentHostExtensionCommandMap[M]['result']>(method, params);
	}

	/**
	 * Common path for outgoing JSON-RPC requests: gate on any in-flight
	 * reconnect (unless explicitly bypassed for the `reconnect` RPC itself),
	 * assign an id, register the pending deferred, and write to the wire.
	 *
	 * The bypass option is the single special case that exists: the
	 * `reconnect` request is sent from inside `_attemptReconnect` while the
	 * gate is engaged, so it can't wait on its own resolution.
	 */
	private async _dispatchRequest<TResult>(
		method: string,
		params: unknown,
		options: { readonly bypassReconnectGate?: boolean } = {},
	): Promise<TResult> {
		// Ride through any number of reconnect cycles until the client is
		// either Connected (proceed) or Closed (throw). A transient failed
		// attempt does NOT surface to the caller — the request stays gated
		// until the connection eventually resumes, matching how the
		// notification outbox rides across retries. A subsequent transport
		// drop that bounces us back into Reconnecting after the gate already
		// resolved is also handled here: the loop re-checks state on each
		// iteration so we never send on a dead/reconnecting transport.
		while (!options.bypassReconnectGate && this._state.kind === AgentHostClientState.Reconnecting) {
			const current = this._state as ClientState;
			if (current.kind !== AgentHostClientState.Reconnecting) {
				break;
			}
			try {
				await current.reconnect.gate.p;
			} catch {
				// Transient attempt failure — swallow and re-check state on the
				// next loop iteration. If we transitioned to Closed the check
				// after the loop surfaces the error; if we're still Reconnecting
				// with a fresh gate we'll await that one.
			}
		}
		if (this._state.kind === AgentHostClientState.Closed) {
			throw this._state.error;
		}

		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, { deferred, sentAt: Date.now() });
		const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
		this._transport.send(request);
		return deferred.p as Promise<TResult>;
	}

	private _toProtocolError(error: JsonRpcErrorResponse['error']): ProtocolError {
		return new ProtocolError(error.code, error.message, error.data);
	}

	private _rejectPendingRequests(error: ProtocolError): void {
		for (const pending of this._pendingRequests.values()) {
			pending.deferred.error(error);
		}
		this._pendingRequests.clear();
	}

	/**
	 * Fired on a {@link WATCHDOG_CHECK_INTERVAL_MS} interval. If the
	 * transport has at least one outstanding request that's been waiting
	 * for more than {@link WATCHDOG_TIMEOUT_MS} and no inbound message has
	 * arrived in the same window, declare the transport dead and trigger
	 * the renderer's reconnect path.
	 *
	 * Idle connections still get supervision: if there are no outstanding
	 * requests, the tick fires off a {@link ping} so the next tick has
	 * something to time out on. This catches silently-dead transports
	 * (e.g. SSH/tunnel after laptop sleep + network change) even when
	 * there's no user activity. Tolerates servers that don't implement
	 * `ping` — the error response still updates `_lastReadTime`.
	 *
	 * The {@link ILoadEstimator} guards against the *local* side of the
	 * confusion: if our own JS event loop has been pegged we suppress the
	 * close — the silence is on our end, not the remote's, and tearing
	 * down the transport would just abort in-flight requests.
	 *
	 * After laptop sleep + wake the JS event loop is paused, so the
	 * interval fires only once after wake. The lookback comparison still
	 * works — we're comparing wall-clock {@link Date.now()} values, not
	 * counting ticks.
	 */
	private _watchdogTick(): void {
		if (this._state.kind === AgentHostClientState.Closed) {
			return;
		}
		if (this._pendingRequests.size === 0) {
			// Active liveness probe — keep idle connections under
			// supervision. Fire-and-forget; the next tick checks for
			// staleness via the normal pending-request path.
			void this.ping().catch(() => undefined);
			return;
		}
		const now = Date.now();
		const sinceLastRead = now - this._lastReadTime;
		if (sinceLastRead < WATCHDOG_TIMEOUT_MS) {
			return;
		}
		// Find the oldest outstanding request; treat it as a proxy for
		// "how long have we been waiting for *any* response from the
		// remote". Iterating is cheap — _pendingRequests is at most a
		// few dozen entries in practice.
		let oldestSentAt = now;
		for (const pending of this._pendingRequests.values()) {
			if (pending.sentAt < oldestSentAt) {
				oldestSentAt = pending.sentAt;
			}
		}
		const oldestAge = now - oldestSentAt;
		if (oldestAge < WATCHDOG_TIMEOUT_MS) {
			return;
		}
		if (this._loadEstimator.hasHighLoad()) {
			return;
		}
		this._logService.info(
			`[RemoteAgentHostProtocol] Watchdog: connection to ${this._address} appears dead — `
			+ `${this._pendingRequests.size} request(s) outstanding, no message received for ${sinceLastRead}ms, `
			+ `oldest request ${oldestAge}ms old. Forcing close to trigger reconnect.`,
		);
		if (this._transportFactory) {
			// In factory mode, route directly through the soft-reconnect path.
			// We can't rely on `_transport.dispose()` to fire the transport's
			// `onClose` listener: WebSocketClientTransport.dispose() disposes
			// its emitters synchronously before the native WebSocket close
			// event arrives, so a watchdog-triggered dispose alone would never
			// reach {@link _handleTransportClose} and the client would stall.
			this._rejectPendingRequests(connectionTimeoutError(this._address, sinceLastRead, oldestAge));
			this._handleTransportClose();
			return;
		}
		this._handleClose(connectionTimeoutError(this._address, sinceLastRead, oldestAge));
	}

	/**
	 * Get the next client sequence number for optimistic dispatch.
	 */
	nextClientSeq(): number {
		return this._nextClientSeq++;
	}
}
