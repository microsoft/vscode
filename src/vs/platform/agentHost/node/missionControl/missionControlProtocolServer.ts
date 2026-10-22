/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSocket from 'ws';
import { randomInt } from 'crypto';
import { DeferredPromise, IntervalTimer, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { AgentHostClientConnectionKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import { emitConnectionDiagnostic, getConnectionDiagnosticError, type IConnectionDiagnosticEvent } from '../../common/connectionDiagnostics.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { DEFAULT_MAX_CHUNK_BYTES, Reassembler } from '../../common/webPubSub/chunking.js';
import { buildPublish, parseInbound, RELIABLE_JSON_SUBPROTOCOL, type SendToGroupCommand } from '../../common/webPubSub/framing.js';
import { parseGroupName } from '../../common/webPubSub/groups.js';
import { MissionControlControlVerifier } from './missionControlControl.js';
import { MissionControlAuthentication } from './missionControlAuthentication.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { MissionControlSessionMirror, type MissionControlMirrorEvent } from './missionControlSessionMirror.js';
import { AuthRequiredReason } from '../../common/state/protocol/common/notifications.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import type { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';

export interface IMissionControlSocket {
	send(data: string): void;
	close(): void;
	on(event: 'open', listener: () => void): void;
	on(event: 'message', listener: (data: Buffer | string) => void): void;
	on(event: 'close', listener: (code: number) => void): void;
	on(event: 'error', listener: (error: Error) => void): void;
}

export interface IMissionControlBootstrap {
	readonly url: string;
	readonly access_token: string;
	readonly groups: { readonly control: string; readonly ingest_ack?: string };
	readonly session_events_formats?: readonly string[];
}

export interface IMissionControlPublishMeasurements {
	readonly bytes: number;
	readonly frameCount: number;
	readonly chunked: boolean;
	readonly queueWaitMs: number;
	readonly ackLatencyMs: number;
	readonly maxAckLatencyMs: number;
	readonly peakInFlight: number;
}

export type MissionControlPublishFailure = 'ackTimeout' | 'publishRejected' | 'socketFailure' | 'queueLimit' | 'mirrorBackpressure';

export type MissionControlPublishDiagnostic = IConnectionDiagnosticEvent & (
	| { readonly phase: 'relayPublish'; readonly outcome: 'succeeded'; readonly durationMs: number; readonly measurements: IMissionControlPublishMeasurements }
	| { readonly phase: 'relayPublish'; readonly outcome: 'failed'; readonly failure: MissionControlPublishFailure }
	| { readonly phase: 'relayQueue'; readonly outcome: 'info'; readonly measurements: { readonly frames: number; readonly bytes: number } }
	| { readonly phase: 'relayConnection'; readonly outcome: 'info'; readonly connected: boolean }
);

export type MissionControlPublishDiagnosticObserver = (event: MissionControlPublishDiagnostic) => void;

/** Why the relay socket was lost or closed; bounded for telemetry. */
export type MissionControlRelayCloseReason =
	| 'socketClose' | 'socketError' | 'livenessTimeout' | 'ackTimeout' | 'publishRejected'
	| 'sendFailure' | 'protocolError' | 'queueFailure' | 'hostClosed';

export interface IMissionControlRelayDetails {
	readonly reason: MissionControlRelayCloseReason;
	/** WebSocket close code when the loss was a socket closure. */
	readonly closeCode?: number;
	/** Client lanes open when the socket was lost. */
	readonly activeClients: number;
	/** Recovery connection attempts made for this loss. */
	readonly attempts: number;
	/** Client lanes closed on recovery because a chunked transfer may not survive the interruption. */
	readonly interruptedClients?: number;
}

export interface IMissionControlRelayClose extends IMissionControlRelayDetails {
	readonly error?: Error;
}

export interface IMissionControlRelayRecovery extends IMissionControlRelayDetails {
	readonly durationMs: number;
}

type GlobalWebSocket = InstanceType<typeof globalThis.WebSocket>;

/** Wraps a WHATWG `WebSocket` (such as the proxy-aware global one) as an {@link IMissionControlSocket}. */
export function toMissionControlSocket(socket: GlobalWebSocket): IMissionControlSocket {
	socket.binaryType = 'arraybuffer';
	// WHATWG sockets cannot be forcibly aborted; detaching on close keeps an unresponsive peer from retaining the relay.
	const listeners = new AbortController();
	const signal = listeners.signal;
	function on(event: 'open', listener: () => void): void;
	function on(event: 'message', listener: (data: Buffer | string) => void): void;
	function on(event: 'close', listener: (code: number) => void): void;
	function on(event: 'error', listener: (error: Error) => void): void;
	function on(event: 'open' | 'message' | 'close' | 'error', listener: ((data: Buffer | string) => void) | ((code: number) => void) | ((error: Error) => void)): void {
		switch (event) {
			case 'open': {
				const onOpen = listener as () => void;
				socket.addEventListener('open', () => onOpen(), { signal });
				break;
			}
			case 'message': {
				const onMessage = listener as (data: Buffer | string) => void;
				socket.addEventListener('message', e => onMessage(typeof e.data === 'string' ? e.data : Buffer.from(e.data as ArrayBuffer)), { signal });
				break;
			}
			case 'close': {
				const onClose = listener as (code: number) => void;
				socket.addEventListener('close', e => onClose(e.code), { signal });
				break;
			}
			case 'error': {
				const onError = listener as (error: Error) => void;
				socket.addEventListener('error', () => onError(toSocketError(socket)), { signal });
				break;
			}
		}
	}
	return {
		send: data => socket.send(data),
		close: () => {
			listeners.abort();
			socket.close();
		},
		on,
	};
}

/** The proxy-aware WebSocket exposes the underlying network failure and HTTP status for diagnostics. */
function toSocketError(socket: GlobalWebSocket): Error {
	const details = socket as GlobalWebSocket & { networkError?: unknown; responseStatusCode?: unknown };
	const cause = details.networkError as { code?: unknown; cause?: { code?: unknown } } | undefined;
	const code = typeof cause?.code === 'string' ? cause.code : typeof cause?.cause?.code === 'string' ? cause.cause.code : undefined;
	const status = typeof details.responseStatusCode === 'number' ? details.responseStatusCode : undefined;
	return Object.assign(new Error('Mission Control WPS socket error'), { code, status, cause: details.networkError });
}

const relayKeepAliveTimeoutMs = 15 * 60_000;
/** Web PubSub retains a dropped reliable connection for about a minute. */
const relayRecoveryWindowMs = 60_000;
const relayRecoveryAttemptTimeoutMs = 10_000;
/** A loss within this time of a recovery counts as the same unstable connection for backoff. */
const relayFlapWindowMs = 60_000;
const relayPingIntervalMs = 20_000;
/** Without any inbound frame (including ping replies) for this long, the socket is treated as dead. */
const relayLivenessTimeoutMs = 60_000;
const maxQueuedMirrorFrames = 128;
const maxQueuedMirrorBytes = 16 * 1024 * 1024;
const maxInFlightChunkFrames = 4;
const maxInFlightPublishes = 64;
const maxInFlightPublishBytes = 4 * 1024 * 1024;
const publishAckTimeoutMs = 30_000;

function newConnectionGeneration(): number {
	return randomInt(1, 2 ** 48);
}

class MissionControlLane extends Disposable implements IProtocolTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.MissionControl;
	readonly transportKind = AgentHostTransportKind.WebSocket;
	get relayClientId(): string { return this.clientId; }
	get relayPassive(): boolean { return this.passive; }
	get relayAuthentication(): IProtocolTransport['relayAuthentication'] {
		return this._authentication ? { authenticated: this._authentication.authenticated, resource: this._authentication.resource, owner: this._authentication.owner } : undefined;
	}
	get onDidRelayAuthenticationExpire() { return this._authentication?.onDidExpire; }
	readonly relayCaptureAuthorization?: () => () => void;
	get relayHandshakeMeta(): Record<string, unknown> | undefined {
		return { ...this._authentication?.handshakeMeta, 'copilot.keepAliveTimeoutMs': relayKeepAliveTimeoutMs, ...(this.passive ? { 'copilot.passive': true } : {}) };
	}
	relayAuthenticate(params: AuthenticateParams): Promise<AuthenticateParams> {
		if (!this._authentication) {
			throw new Error('Relay authentication is unavailable');
		}
		return this._authentication.authenticate(params);
	}
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;
	private _closed = false;
	private _active = false;
	private _hasHandshake = false;
	private _handshakeId: number | string | undefined;
	private _acceptsBatch = false;
	private readonly _earlyMessages: ProtocolMessage[] = [];
	readonly generation = newConnectionGeneration();
	lastReceived = Date.now();
	get isClosed(): boolean { return this._closed; }
	get isActive(): boolean { return this._active; }
	private readonly _ahpLogger: AhpJsonlLogger | undefined;
	get acceptsBatch(): boolean { return !this._closed && this._acceptsBatch; }

	constructor(readonly clientId: string, readonly passive: boolean, private readonly _publish: (group: string, message: unknown, generation: number) => void, private readonly _prefix: string, private readonly _authentication?: MissionControlAuthentication, private readonly _rehandshake?: (lane: MissionControlLane, message: object) => void, private readonly _didClose?: (lane: MissionControlLane) => void, createAhpLogger?: (clientId: string, generation: number) => AhpJsonlLogger) {
		super();
		this._ahpLogger = createAhpLogger ? this._register(createAhpLogger(clientId, this.generation)) : undefined;
		if (_authentication) {
			this._register(_authentication);
			this.relayCaptureAuthorization = () => _authentication.captureAuthorization();
			this._register(_authentication.onDidExpire(() => this.send({
				jsonrpc: '2.0',
				method: 'auth/required',
				params: { channel: ROOT_STATE_URI, resource: { resource: _authentication.resource }, reason: AuthRequiredReason.Expired },
			})));
		}
	}

	receive(message: unknown): void {
		if (this._closed || typeof message !== 'object' || message === null || Array.isArray(message)) {
			return;
		}
		this.lastReceived = Date.now();
		const request = message as { id?: unknown; method?: unknown; params?: { clientId?: unknown } };
		if ((request.method === 'initialize' || request.method === 'reconnect') && request.params?.clientId !== this.clientId) {
			this._ahpLogger?.log(message, 'c2s');
			this.dispose();
			return;
		}
		if (request.method === 'initialize' || request.method === 'reconnect') {
			if (this._active && (this._hasHandshake || this._handshakeId !== undefined) && this._rehandshake) {
				this._rehandshake(this, message);
				return;
			}
			this._handshakeId = typeof request.id === 'number' || typeof request.id === 'string' ? request.id : undefined;
			this._authentication?.beginHandshake();
		}
		this._ahpLogger?.log(message, 'c2s');
		if (!this._authentication && (request.method === 'authenticate' || request.method === 'resourceRequest' || request.method === 'dispatchAction' || request.method === 'setClientManagedSettingsPermissions')) {
			this.dispose();
			return;
		}
		if (!this._active) {
			if (this._earlyMessages.length >= 32) {
				this.dispose();
			} else {
				this._earlyMessages.push(message as ProtocolMessage);
			}
			return;
		}
		this._onMessage.fire(message as ProtocolMessage);
	}

	activate(): void {
		this._active = true;
		for (const message of this._earlyMessages.splice(0)) {
			this._onMessage.fire(message);
		}
	}

	setReceiveCapabilities(accepts: readonly string[]): void {
		if (!this._closed) {
			this._acceptsBatch = accepts.includes('batch');
		}
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void {
		if (this._closed) {
			throw new Error('Mission Control lane closed');
		}
		const response = hasKey(message, { id: true });
		if (response && this._handshakeId !== undefined && message.id === this._handshakeId) {
			this._hasHandshake = hasKey(message, { result: true });
			this._handshakeId = undefined;
		}
		try {
			this._ahpLogger?.log(message, 's2c');
			this._publish(`${this._prefix}.${response ? 'to-client' : 'broadcast'}`, message, this.generation);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._authentication?.dispose();
			this._onClose.fire();
			this._didClose?.(this);
		}
		super.dispose();
	}
}

interface PublishFrame {
	readonly ackId: number;
	readonly frame: string;
	readonly chunkGroup?: string;
	readonly mirror?: boolean;
	readonly closure?: boolean;
	readonly clientGeneration?: number;
	readonly batch?: { readonly lane: MissionControlLane; readonly group: string; readonly generation: number };
}

interface PublishGroup {
	readonly queue: PublishQueue;
	readonly order: number;
	readonly mirrorStream?: { readonly session: string; readonly lifecycle: boolean };
	readonly watch: StopWatch;
	readonly frameCount: number;
	readonly bytes: number;
	readonly chunkGroup?: string;
	remaining: number;
	firstSentMs?: number;
	peakInFlight: number;
	ackLatencyMs: number;
	maxAckLatencyMs: number;
	cancelled?: boolean;
}

interface QueuedPublish extends PublishFrame {
	readonly bytes: number;
	readonly mirrorFrames: number;
	readonly mirrorBytes: number;
	readonly publication: PublishGroup;
}

interface PublishQueue {
	readonly frames: QueuedPublish[];
	active?: PublishGroup;
	pendingFrames: number;
}

interface IRelayRecovery {
	readonly watch: StopWatch;
	readonly reason: MissionControlRelayCloseReason;
	readonly closeCode?: number;
	readonly error: Error;
	readonly activeClients: number;
	attempts: number;
	/** Clients whose chunked transfers spanned a loss and whose lanes must close on resume; undefined means every lane. */
	interruptedClients: Set<string> | undefined;
	/** Lanes closed across all resumptions of this outage. */
	interruptedCount: number;
}

interface PendingPublish {
	readonly publish: QueuedPublish;
	readonly sentMs: number;
	deadline: number;
}

/**
 * A bounded virtual AHP server over one reliable-JSON WPS connection.
 * The bootstrap and owner are supplied by the trusted registration lifecycle.
 */
export class MissionControlProtocolServer extends Disposable implements IProtocolServer {
	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;
	private readonly _onDidRecover = this._register(new Emitter<IMissionControlRelayRecovery>());
	/** Fires when a lost socket resumed the same Web PubSub connection, so no client lane was interrupted. */
	readonly onDidRecover = this._onDidRecover.event;
	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;
	readonly address = undefined;
	private readonly _lanes = this._register(new DisposableMap<string, MissionControlLane>());
	private readonly _reassembler = new Reassembler();
	private readonly _sweep = this._register(new IntervalTimer());
	private readonly _ackTimeout = this._register(new RunOnceScheduler(() => {
		this._reportPublishFailure('ackTimeout');
		const error = new Error('Mission Control WPS acknowledgement timed out');
		// An unconfirmed resumption continues its recovery; a timeout on a confirmed resumed socket that has not
		// acknowledged anything would only repeat, so it closes instead.
		if (this._ready.isSettled && this._resumption && (this._confirming || this._recoveries === 0 || this._acknowledgedSinceRecovery)) {
			this._lost('ackTimeout', undefined, error);
			return;
		}
		this._fail('ackTimeout', error);
	}, publishAckTimeoutMs));
	private readonly _liveness = this._register(new IntervalTimer());
	private readonly _recoveryTimer = this._register(new RunOnceScheduler(() => this._attemptRecovery(), 0));
	private readonly _recoveryAttemptTimeout = this._register(new RunOnceScheduler(() => {
		this._lost('livenessTimeout', undefined, new Error('Mission Control WPS recovery attempt timed out'));
	}, relayRecoveryAttemptTimeoutMs));
	private _resumption: { readonly connectionId: string; readonly reconnectionToken: string } | undefined;
	/** The current outage, from the first socket loss until a resumed socket is confirmed or the relay closes. */
	private _recovering: IRelayRecovery | undefined;
	/** Set while a resumed socket awaits its first service frame; the outage is reported as recovered on that frame. */
	private _confirming: IRelayRecovery | undefined;
	private readonly _recoveryDeadline = this._register(new RunOnceScheduler(() => {
		const recovering = this._recovering ?? this._confirming;
		if (recovering) {
			this._recovering = this._confirming = undefined;
			this._fail(recovering.reason, recovering.error, recovering.closeCode, recovering.attempts, recovering.activeClients);
		}
	}, relayRecoveryWindowMs + relayRecoveryAttemptTimeoutMs));
	private _recoveries = 0;
	private _recoveredAt: number | undefined;
	/** Outages that began soon after the previous recovery, which extend the reconnection backoff. */
	private _flaps = 0;
	private _acknowledgedSinceRecovery = false;
	private _lastInbound = 0;
	private _closeInfo: IMissionControlRelayClose | undefined;
	private readonly _ready = new DeferredPromise<void>();
	private readonly _pending = new Map<number, PendingPublish>();
	private readonly _outbound = new Map<string, PublishQueue>();
	private readonly _mirrorPublications = new Set<PublishGroup>();
	private _outboundFrames = 0;
	private _outboundBytes = 0;
	private _pendingBytes = 0;
	private _publicationOrder = 0;
	private _acceptsMirrorBatch = false;
	private _queuedMirrorFrames = 0;
	private _queuedMirrorBytes = 0;
	private _draining = false;
	private readonly _joins = new Map<number, string>();
	private readonly _bootstrapJoins = new Set<string>();
	private _socket: IMissionControlSocket | undefined;
	private _ackId = 0;
	private _sequence = 0;
	private _connected = false;
	private _closed = false;
	private _ackDeadline: number | undefined;

	get isClosed(): boolean { return this._closed; }
	/** Why the relay closed; available once {@link onClose} fires. */
	get closeInfo(): IMissionControlRelayClose | undefined { return this._closeInfo; }

	constructor(
		private readonly _bootstrap: IMissionControlBootstrap,
		private readonly _owner: string,
		private readonly _environment: string,
		private readonly _verifier: MissionControlControlVerifier,
		private readonly _socketFactory: (url: string, protocol: string) => IMissionControlSocket = (url, protocol) => new WebSocket(url, protocol),
		private readonly _onError: (error: Error) => void = () => { },
		private readonly _authenticationFactory?: () => MissionControlAuthentication,
		readonly rootMeta?: Record<string, unknown>,
		private readonly _mirror?: MissionControlSessionMirror,
		private readonly _createAhpLogger?: (clientId: string, generation: number) => AhpJsonlLogger,
		private readonly _onDiagnostic?: MissionControlPublishDiagnosticObserver,
	) {
		super();
		parseGroupName(_bootstrap.groups.control, { expected: { uid: _owner, eid: _environment } });
		this.setSessionEventsFormats(_bootstrap.session_events_formats);
	}

	setSessionEventsFormats(formats: readonly string[] | undefined): void {
		this._acceptsMirrorBatch = formats?.includes('batch-v1') === true;
	}

	connect(): Promise<void> {
		if (this._socket || this._closed) {
			throw new Error('Mission Control socket already connected or disposed');
		}
		const url = new URL(this._bootstrap.url);
		if (url.username || url.password || url.search || url.hash
			|| (this._authenticationFactory ? url.protocol !== 'wss:' : url.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
			throw new Error('Mission Control returned an unsafe WPS endpoint');
		}
		url.searchParams.set('access_token', this._bootstrap.access_token);
		this._openSocket(url);
		this._sweep.cancelAndSet(() => {
			this._reassembler.sweepExpired();
			for (const [id, lane] of this._lanes) {
				if (Date.now() - lane.lastReceived >= relayKeepAliveTimeoutMs) {
					this._lanes.deleteAndLeak(id)?.dispose();
					if (this._socket && !this._recovering) {
						this._send({ type: 'leaveGroup', group: `user.${this._owner}.env.${this._environment}.client.${id}.to-host` });
					}
				}
			}
		}, 15_000);
		this._waitForAck();
		return this._ready.p;
	}

	private _openSocket(url: URL): void {
		const socket = this._socketFactory(url.toString(), RELIABLE_JSON_SUBPROTOCOL);
		this._socket = socket;
		this._lastInbound = Date.now();
		// Events from a socket that was already replaced or lost are ignored.
		socket.on('open', () => {
			// An opened recovery connection has resumed; the service may or may not send another `connected` message.
			if (this._socket === socket && this._recovering) {
				this._resume();
			}
		});
		socket.on('message', data => {
			if (this._socket === socket) {
				this._receive(data);
			}
		});
		socket.on('close', code => {
			if (this._socket === socket) {
				this._lost('socketClose', code, new Error(`Mission Control WPS socket closed (code ${code})`));
			}
		});
		socket.on('error', error => {
			if (this._socket === socket) {
				this._lost('socketError', undefined, error);
			}
		});
	}

	/**
	 * Handles loss of the current socket. A ready connection resumes its Web PubSub session, which retains
	 * group membership and redelivers unacknowledged messages, so client lanes survive transient network loss.
	 */
	private _lost(reason: MissionControlRelayCloseReason, closeCode: number | undefined, error: Error): void {
		if (this._closed) {
			return;
		}
		// A resumed socket lost before it was confirmed continues the same outage.
		if (this._confirming) {
			this._recovering = this._confirming;
			this._confirming = undefined;
		}
		// One loss, however many recovery attempts it takes, counts as one publication failure.
		if (!this._recovering && reason !== 'ackTimeout') {
			this._reportPublishFailure('socketFailure');
		}
		const socket = this._socket;
		this._socket = undefined;
		this._recoveryAttemptTimeout.cancel();
		this._liveness.cancel();
		this._ackTimeout.cancel();
		socket?.close();
		if (!this._recovering) {
			// A socket lost again soon after a recovery keeps backing off instead of reconnecting immediately.
			this._flaps = this._recoveredAt !== undefined && Date.now() - this._recoveredAt < relayFlapWindowMs ? this._flaps + 1 : 0;
		}
		const step = (this._recovering?.attempts ?? 0) + this._flaps;
		const delay = step === 0 ? 0 : Math.min(5_000, 500 * 2 ** (step - 1));
		// 1008 means the service removed the connection, so it cannot be resumed.
		if (this._resumption && this._ready.isSettled && closeCode !== 1008
			&& (this._recovering?.watch.elapsed() ?? 0) + delay < relayRecoveryWindowMs) {
			const interrupted = this._chunkedTransferClients();
			if (!this._recovering) {
				this._recovering = {
					watch: StopWatch.create(false), reason, closeCode, error, activeClients: this._lanes.size, attempts: 0,
					interruptedClients: interrupted, interruptedCount: 0,
				};
				this._recoveryDeadline.schedule();
			} else if (this._recovering.interruptedClients) {
				// Transfers started on an unconfirmed resumed socket are also interrupted.
				this._recovering.interruptedClients = interrupted ? new Set([...this._recovering.interruptedClients, ...interrupted]) : undefined;
			}
			this._recoveryTimer.schedule(delay);
			return;
		}
		const recovering = this._recovering;
		this._recovering = undefined;
		this._recoveryDeadline.cancel();
		this._fail(recovering?.reason ?? reason, recovering?.error ?? error, recovering?.closeCode ?? closeCode, recovering?.attempts ?? 0, recovering?.activeClients);
	}

	/**
	 * Chunked payloads are reassembled within a fixed time from their first fragment, and fragments that were
	 * acknowledged before a loss are not resent, so a transfer spanning a loss may never complete. Returns the
	 * clients with an outbound chunked transfer in flight, or undefined when an inbound one is (its client is unknown).
	 */
	private _chunkedTransferClients(): Set<string> | undefined {
		if (this._reassembler.inFlightGroupCount > 0) {
			return undefined;
		}
		const clients = new Set<string>();
		for (const [key, queue] of this._outbound) {
			if (queue.active?.chunkGroup !== undefined && key.startsWith('client:')) {
				clients.add(key.slice('client:'.length));
			}
		}
		return clients;
	}

	private _attemptRecovery(): void {
		const recovering = this._recovering;
		const resumption = this._resumption;
		if (this._closed || !recovering || !resumption) {
			return;
		}
		recovering.attempts++;
		const url = new URL(this._bootstrap.url);
		url.searchParams.set('awps_connection_id', resumption.connectionId);
		url.searchParams.set('awps_reconnection_token', resumption.reconnectionToken);
		try {
			this._openSocket(url);
		} catch (error) {
			this._lost(recovering.reason, undefined, error instanceof Error ? error : new Error(String(error)));
			return;
		}
		this._recoveryAttemptTimeout.schedule();
	}

	private _resume(): void {
		const recovering = this._recovering!;
		this._recovering = undefined;
		this._recoveryAttemptTimeout.cancel();
		this._recoveries++;
		this._acknowledgedSinceRecovery = false;
		this._startLiveness();
		// Unacknowledged requests are resent with their original IDs; the service acknowledges ones it already processed as duplicates.
		const now = Date.now();
		if (this._joins.size) {
			this._ackDeadline = now + publishAckTimeoutMs;
		}
		for (const pending of this._pending.values()) {
			pending.deadline = now + publishAckTimeoutMs;
		}
		this._confirming = recovering;
		const resent = [...this._joins].map(([ackId, group]) => JSON.stringify({ type: 'joinGroup', group, ackId }))
			.concat([...this._pending.values()].map(pending => pending.publish.frame));
		for (const frame of resent) {
			if (!this._sendRecoverable(frame)) {
				return;
			}
		}
		this._scheduleAckTimeout();
		// Lanes whose chunked transfers may be incomplete are closed so their clients reconnect and resynchronize.
		for (const [clientId, lane] of [...this._lanes]) {
			if (!lane.isClosed && (!recovering.interruptedClients || recovering.interruptedClients.has(clientId))) {
				recovering.interruptedCount++;
				lane.dispose();
			}
		}
		recovering.interruptedClients = new Set();
		// The service can accept the WebSocket and then reject the resumption, so success is reported on its first
		// frame. A ping makes the service reply promptly when nothing else is outstanding.
		if (!this._sendRecoverable(JSON.stringify({ type: 'ping' }))) {
			return;
		}
		this._drain();
		this._mirror?.resumePublishing();
	}

	private _confirmRecovery(): void {
		const recovering = this._confirming;
		if (!recovering) {
			return;
		}
		this._confirming = undefined;
		this._recoveryDeadline.cancel();
		this._recoveredAt = Date.now();
		this._onDidRecover.fire({
			reason: recovering.reason, closeCode: recovering.closeCode, activeClients: recovering.activeClients,
			attempts: recovering.attempts, durationMs: recovering.watch.elapsed(), interruptedClients: recovering.interruptedCount,
		});
	}

	/** Pings the service so a half-open socket is detected instead of silently dropping client traffic. */
	private _startLiveness(): void {
		if (!this._resumption) {
			return;
		}
		this._liveness.cancelAndSet(() => {
			if (!this._socket) {
				return;
			}
			const idle = Date.now() - this._lastInbound;
			if (idle >= relayLivenessTimeoutMs) {
				this._lost('livenessTimeout', undefined, new Error('Mission Control WPS connection stopped responding'));
			} else if (idle >= relayPingIntervalMs) {
				this._sendRecoverable(JSON.stringify({ type: 'ping' }));
			}
		}, relayPingIntervalMs);
	}

	/** Sends a frame whose failure means the socket is lost, which a ready relay can recover from. */
	private _sendRecoverable(frame: string): boolean {
		const socket = this._socket;
		try {
			socket!.send(frame);
			return true;
		} catch (error) {
			if (this._socket === socket) {
				this._lost('sendFailure', undefined, error instanceof Error ? error : new Error(String(error)));
			}
			return false;
		}
	}

	private _fail(reason: MissionControlRelayCloseReason, error?: Error, closeCode?: number, attempts = 0, activeClients = this._lanes.size): void {
		if (this._closed) {
			return;
		}
		this._closeInfo ??= { reason, closeCode, activeClients, attempts, error };
		this.dispose();
		if (error) {
			this._onError(error);
		}
	}

	private _waitForAck(): void {
		this._ackDeadline ??= Date.now() + publishAckTimeoutMs;
		this._scheduleAckTimeout();
	}

	private _reportPublishFailure(failure: MissionControlPublishFailure): void {
		if (!this._closed) {
			emitConnectionDiagnostic(this._onDiagnostic, {
				operationId: '', phase: 'relayPublish', timestamp: Date.now(), outcome: 'failed', failure,
			});
		}
	}

	private _scheduleAckTimeout(): void {
		if (!this._socket || this._recovering) {
			// Deadlines restart when a recovered socket resends the outstanding requests.
			this._ackTimeout.cancel();
			return;
		}
		let deadline = this._ackDeadline ?? Infinity;
		for (const pending of this._pending.values()) {
			deadline = Math.min(deadline, pending.deadline);
		}
		if (deadline === Infinity) {
			this._ackTimeout.cancel();
		} else {
			this._ackTimeout.schedule(Math.max(0, deadline - Date.now()));
		}
	}

	private _send(frame: object): void {
		if (this._closed || !this._socket || this._pending.size + this._joins.size >= 128) {
			throw new Error('Mission Control WPS publish queue unavailable');
		}
		this._socket.send(JSON.stringify(frame));
	}

	private _join(group: string): void {
		const ackId = ++this._ackId;
		this._joins.set(ackId, group);
		this._waitForAck();
		this._send({ type: 'joinGroup', group, ackId });
	}

	private _publish(group: string, payload: unknown, generation: number, lane: MissionControlLane): void {
		const frames = buildPublish({ group, payload, generation, nextAckId: () => ++this._ackId }).map(frame => ({
			ackId: frame.ackId,
			frame: JSON.stringify(frame),
			chunkGroup: frame.data.kind === 'chunk' ? frame.data.group_id : undefined,
			clientGeneration: generation,
			batch: frame.data.kind === 'message' ? { lane, group, generation } : undefined,
		}));
		try {
			this._enqueue(`client:${lane.clientId}`, frames);
		} catch (error) {
			if (!this._closed) {
				const queue = this._outbound.get(`client:${lane.clientId}`);
				if (queue) {
					for (let index = queue.frames.length - 1; index >= 0; index--) {
						const queued = queue.frames[index];
						if (queued.clientGeneration === generation) {
							queue.frames.splice(index, 1);
							this._outboundFrames--;
							this._outboundBytes -= queued.bytes;
							queued.publication.remaining--;
							queued.publication.cancelled = true;
						}
					}
				}
				this._onError(error instanceof Error ? error : new Error(String(error)));
			}
			throw error;
		}
	}

	publishMirrorEvent(event: MissionControlMirrorEvent): undefined | false {
		if (this._closed) {
			throw new Error('Mission Control mirror transport closed');
		}
		const ackId = this._ackId + 1;
		const frame = JSON.stringify({ ...event, ackId });
		const bytes = Buffer.byteLength(frame);
		if (this._queuedMirrorFrames >= maxQueuedMirrorFrames || this._queuedMirrorBytes + bytes > maxQueuedMirrorBytes
			|| this._outboundFrames + this._pending.size >= 512 || this._outboundBytes + this._pendingBytes + bytes > 64 * 1024 * 1024) {
			this._reportPublishFailure('mirrorBackpressure');
			return false;
		}
		this._ackId = ackId;
		const lifecycle = event.event === 'sessionLifecycle';
		const session = event.data.session_id;
		const namespace = lifecycle ? 'lifecycle' : event.data.ns;
		this._enqueue(JSON.stringify(['mirror', session, namespace]), [{ ackId, frame, mirror: true }], { session, lifecycle });
		return undefined;
	}

	private _enqueue(key: string, frames: readonly PublishFrame[], mirrorStream?: PublishGroup['mirrorStream']): void {
		const bytes = frames.reduce((total, frame) => total + Buffer.byteLength(frame.frame), 0);
		// A bounded closure reserve lets an overloaded client close without taking down other lanes.
		const closure = frames.every(frame => frame.closure);
		if (this._closed || this._outboundFrames + this._pending.size + frames.length > 512 + (closure ? 32 : 0)
			|| this._outboundBytes + this._pendingBytes + bytes > 64 * 1024 * 1024 + (closure ? 32 * 1024 : 0)) {
			this._reportPublishFailure('queueLimit');
			throw new Error('Mission Control ordered publish queue exceeded its limit');
		}
		let queue = this._outbound.get(key);
		if (!queue) {
			queue = { frames: [], pendingFrames: 0 };
			this._outbound.set(key, queue);
		}
		const publication: PublishGroup = {
			queue, order: ++this._publicationOrder, mirrorStream,
			watch: StopWatch.create(false), frameCount: frames.length, bytes, chunkGroup: frames[0].chunkGroup,
			remaining: frames.length, peakInFlight: 0, ackLatencyMs: 0, maxAckLatencyMs: 0,
		};
		if (mirrorStream) {
			this._mirrorPublications.add(publication);
		}
		queue.frames.push(...frames.map(frame => ({
			...frame, bytes: Buffer.byteLength(frame.frame), publication,
			mirrorFrames: frame.mirror ? 1 : 0, mirrorBytes: frame.mirror ? Buffer.byteLength(frame.frame) : 0,
		})));
		this._outboundFrames += frames.length;
		this._outboundBytes += bytes;
		for (const frame of frames) {
			if (frame.mirror) {
				this._queuedMirrorFrames++;
				this._queuedMirrorBytes += Buffer.byteLength(frame.frame);
			}
		}
		emitConnectionDiagnostic(this._onDiagnostic, {
			operationId: '', phase: 'relayQueue', timestamp: Date.now(), outcome: 'info',
			measurements: { frames: this._outboundFrames + this._pending.size, bytes: this._outboundBytes + this._pendingBytes },
		});
		this._drain();
	}

	private _takeOutbound(queue: PublishQueue, maxWireBytes: number): QueuedPublish {
		const first = queue.frames[0];
		const batch = first.batch;
		let count = 1;
		let frame = first.frame;
		if (batch?.lane.acceptsBatch && queue.frames.length > 1) {
			const items: unknown[] = [];
			const overhead = Buffer.byteLength(JSON.stringify({
				type: 'sendToGroup', group: batch.group, ackId: first.ackId, dataType: 'json', noEcho: true, data: null,
			})) - 4;
			const limit = Math.min(DEFAULT_MAX_CHUNK_BYTES, maxWireBytes - overhead);
			let bytes = Buffer.byteLength(JSON.stringify({ kind: 'batch', items: [], generation: batch.generation }));
			for (const queued of queue.frames) {
				if (items.length === 256 || queued.batch?.lane !== batch.lane || queued.batch.group !== batch.group || queued.batch.generation !== batch.generation) {
					break;
				}
				const command = JSON.parse(queued.frame) as SendToGroupCommand;
				if (command.data.kind !== 'message') {
					break;
				}
				const item = command.data.data;
				bytes += Buffer.byteLength(JSON.stringify(item)) + (items.length > 0 ? 1 : 0);
				if (bytes > limit) {
					break;
				}
				items.push(item);
			}
			if (items.length > 1) {
				count = items.length;
				frame = JSON.stringify({
					type: 'sendToGroup', group: batch.group, ackId: first.ackId, dataType: 'json', noEcho: true,
					data: { kind: 'batch', items, generation: batch.generation },
				});
			}
		}
		if (first.mirror && this._acceptsMirrorBatch && !first.publication.mirrorStream?.lifecycle && queue.frames.length > 1) {
			const command = JSON.parse(first.frame) as { data: { environment_id: string; session_id: string; ns: 'ahp' | 'sdk'; seq: number } };
			const items = [command.data];
			const overhead = Buffer.byteLength(JSON.stringify({ type: 'event', event: 'sessionEvents', ackId: first.ackId, dataType: 'json', data: null })) - 4;
			const limit = Math.min(DEFAULT_MAX_CHUNK_BYTES, maxWireBytes - overhead);
			let bytes = Buffer.byteLength(JSON.stringify({ kind: 'batch', items }));
			let previous = command.data.seq;
			for (const queued of queue.frames.slice(1, 256)) {
				const candidate = JSON.parse(queued.frame) as typeof command;
				if (candidate.data.environment_id !== command.data.environment_id || candidate.data.session_id !== command.data.session_id
					|| candidate.data.ns !== command.data.ns || candidate.data.seq <= previous
					|| command.data.ns === 'ahp' && candidate.data.seq !== previous + 1
					|| this._isBlockedByLifecycle(queued.publication)) {
					break;
				}
				const size = Buffer.byteLength(JSON.stringify(candidate.data)) + 1;
				if (bytes + size > limit) {
					break;
				}
				bytes += size;
				previous = candidate.data.seq;
				items.push(candidate.data);
			}
			if (items.length > 1) {
				count = items.length;
				frame = JSON.stringify({ type: 'event', event: 'sessionEvents', ackId: first.ackId, dataType: 'json', data: { kind: 'batch', items } });
			}
		}
		let mirrorFrames = 0;
		let mirrorBytes = 0;
		for (const queued of queue.frames.splice(0, count)) {
			this._outboundBytes -= queued.bytes;
			mirrorFrames += queued.mirrorFrames;
			mirrorBytes += queued.mirrorBytes;
			if (count > 1) {
				this._mirrorPublications.delete(queued.publication);
			}
		}
		this._outboundFrames -= count;
		const bytes = Buffer.byteLength(frame);
		const publication: PublishGroup = count === 1 ? first.publication : {
			queue, order: first.publication.order, mirrorStream: first.publication.mirrorStream,
			watch: first.publication.watch, frameCount: 1, bytes,
			remaining: 1, peakInFlight: 0, ackLatencyMs: 0, maxAckLatencyMs: 0,
		};
		if (publication.mirrorStream) {
			this._mirrorPublications.add(publication);
		}
		return { ...first, frame, bytes, publication, mirrorFrames, mirrorBytes };
	}

	private _isBlockedByLifecycle(publication: PublishGroup): boolean {
		const stream = publication.mirrorStream;
		return stream !== undefined && [...this._mirrorPublications].some(other =>
			other !== publication && other.order < publication.order && other.mirrorStream?.session === stream.session
			&& (stream.lifecycle || other.mirrorStream.lifecycle));
	}

	private _drain(): void {
		// While recovering, frames stay queued: a recovery socket cannot send until the service confirms the resumed connection.
		if (this._draining || this._closed || !this._socket || this._recovering) {
			return;
		}
		this._draining = true;
		try {
			let progress = true;
			while (progress && !this._closed && this._pending.size < maxInFlightPublishes) {
				progress = false;
				for (const [key, queue] of this._outbound) {
					const first = queue.frames[0];
					if (!first || queue.pendingFrames >= maxInFlightChunkFrames
						|| queue.active && (!first.chunkGroup || first.publication !== queue.active)
						|| this._isBlockedByLifecycle(first.publication)
						|| this._pending.size > 0 && this._pendingBytes + first.bytes > maxInFlightPublishBytes) {
						continue;
					}
					const next = this._takeOutbound(queue, maxInFlightPublishBytes - this._pendingBytes);
					const sentMs = next.publication.watch.elapsed();
					next.publication.firstSentMs ??= sentMs;
					queue.active = next.publication;
					queue.pendingFrames++;
					this._pending.set(next.ackId, { publish: next, sentMs, deadline: Date.now() + publishAckTimeoutMs });
					this._pendingBytes += next.bytes;
					next.publication.peakInFlight = Math.max(next.publication.peakInFlight, queue.pendingFrames);
					this._outbound.delete(key);
					this._outbound.set(key, queue);
					this._scheduleAckTimeout();
					this._socket!.send(next.frame);
					progress = true;
					break;
				}
			}
		} catch (error) {
			this._reportPublishFailure('socketFailure');
			this._closeInfo ??= { reason: 'sendFailure', activeClients: this._lanes.size, attempts: 0 };
			this.dispose();
			throw error;
		} finally {
			this._draining = false;
		}
	}

	private _receive(data: Buffer | string): void {
		if (this._closed) {
			return;
		}
		this._lastInbound = Date.now();
		try {
			if (data.length > 2 * 1024 * 1024) {
				throw new Error('Mission Control WPS frame exceeds receive limit');
			}
			const frame: unknown = JSON.parse(data.toString());
			if (typeof frame !== 'object' || frame === null) {
				throw new Error('Invalid WPS frame');
			}
			const fields = frame as Record<string, unknown>;
			// The service announces `disconnected` before closing a connection, including a rejected resumption.
			if (!(fields.type === 'system' && fields.event === 'disconnected')) {
				this._confirmRecovery();
			}
			if (fields.type === 'system' && fields.event === 'connected') {
				const connectionId = fields.connectionId;
				const reconnectionToken = fields.reconnectionToken;
				if (typeof connectionId === 'string' && /^[\w.~:+/=-]{1,256}$/.test(connectionId)
					&& typeof reconnectionToken === 'string' && reconnectionToken.length > 0 && reconnectionToken.length <= 4096) {
					this._resumption = { connectionId, reconnectionToken };
				}
				if (this._recovering) {
					this._resume();
					this._confirmRecovery();
					return;
				}
				if (this._connected) {
					return;
				}
				this._connected = true;
				this._startLiveness();
				emitConnectionDiagnostic(this._onDiagnostic, {
					operationId: '', phase: 'relayConnection', timestamp: Date.now(), outcome: 'info', connected: true,
				});
				this._bootstrapJoins.add(this._bootstrap.groups.control);
				if (this._mirror && this._bootstrap.groups.ingest_ack) {
					this._bootstrapJoins.add(this._bootstrap.groups.ingest_ack);
				}
				this._join(this._bootstrap.groups.control);
				if (this._mirror && this._bootstrap.groups.ingest_ack) {
					this._join(this._bootstrap.groups.ingest_ack);
				}
				return;
			}
			if (fields.type === 'ack') {
				const id = fields.ackId;
				if (typeof id !== 'number') {
					throw new Error('Invalid WPS acknowledgement');
				}
				const group = this._joins.get(id);
				this._joins.delete(id);
				const pending = this._pending.get(id);
				this._pending.delete(id);
				// A request resent after recovery may already have been processed.
				if ((group || pending) && fields.success !== true && (fields.error as { name?: string } | undefined)?.name !== 'Duplicate') {
					this._reportPublishFailure('publishRejected');
					this._closeInfo ??= { reason: 'publishRejected', activeClients: this._lanes.size, attempts: 0 };
					this.dispose();
					throw new Error(`Mission Control WPS operation rejected${fields.error ? `: ${getConnectionDiagnosticError(fields.error).message}` : ''}`);
				}
				this._acknowledgedSinceRecovery = true;
				if (pending) {
					pending.publish.publication.queue.pendingFrames--;
					this._pendingBytes -= pending.publish.bytes;
					if (pending.publish.mirror) {
						this._queuedMirrorFrames -= pending.publish.mirrorFrames;
						this._queuedMirrorBytes -= pending.publish.mirrorBytes;
					}
					const publication = pending.publish.publication;
					const ackLatencyMs = publication.watch.elapsed() - pending.sentMs;
					publication.ackLatencyMs += ackLatencyMs;
					publication.maxAckLatencyMs = Math.max(publication.maxAckLatencyMs, ackLatencyMs);
					if (--publication.remaining === 0) {
						publication.queue.active = undefined;
						this._mirrorPublications.delete(publication);
						for (const [key, queue] of this._outbound) {
							if (queue === publication.queue && queue.frames.length === 0) {
								this._outbound.delete(key);
								break;
							}
						}
						if (!publication.cancelled) {
							emitConnectionDiagnostic(this._onDiagnostic, {
								operationId: String(id), phase: 'relayPublish', timestamp: Date.now(), outcome: 'succeeded',
								durationMs: publication.watch.elapsed(),
								detail: `bytes=${publication.bytes}; frames=${publication.frameCount}; queueWaitMs=${publication.firstSentMs}; meanAckLatencyMs=${publication.ackLatencyMs / publication.frameCount}; maxAckLatencyMs=${publication.maxAckLatencyMs}; peakInFlight=${publication.peakInFlight}`,
								measurements: {
									bytes: publication.bytes, frameCount: publication.frameCount, chunked: publication.chunkGroup !== undefined,
									queueWaitMs: publication.firstSentMs!, ackLatencyMs: publication.ackLatencyMs,
									maxAckLatencyMs: publication.maxAckLatencyMs, peakInFlight: publication.peakInFlight,
								},
							});
						}
					}
				}
				if (group && group !== this._bootstrap.groups.control && group !== this._bootstrap.groups.ingest_ack) {
					const clientId = parseGroupName(group).scope === 'client' ? group.split('.')[5] : undefined;
					const lane = clientId ? this._lanes.get(clientId) : undefined;
					// A join resent after recovery may be acknowledged after its lane was closed or replaced and announced.
					if (lane && !lane.isClosed && !lane.isActive) {
						this._onConnection.fire(lane);
						lane.activate();
					}
				}
				if ((group === this._bootstrap.groups.control || group === this._bootstrap.groups.ingest_ack)
					&& group !== undefined) {
					this._bootstrapJoins.delete(group);
					if (this._bootstrapJoins.size === 0) {
						this._ready.complete();
					}
				}
				if (this._joins.size === 0) {
					this._ackDeadline = undefined;
				}
				this._scheduleAckTimeout();
				this._drain();
				this._mirror?.resumePublishing();
				return;
			}
			if (!this._connected) {
				throw new Error('WPS message before handshake');
			}
			if (fields.type === 'message' && fields.sequenceId !== undefined) {
				const id = fields.sequenceId;
				if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
					throw new Error('Invalid WPS sequence');
				}
				const duplicate = id <= this._sequence;
				this._sequence = Math.max(this._sequence, id);
				this._send({ type: 'sequenceAck', sequenceId: this._sequence });
				if (duplicate) {
					return;
				}
			}
			const envelope = typeof fields.data === 'object' && fields.data !== null ? fields.data as { readonly kind?: unknown } : undefined;
			if (fields.type === 'message' && fields.from === 'group' && fields.group === this._bootstrap.groups.control
				&& fields.dataType === 'json' && (envelope?.kind === 'spawn_request' || envelope?.kind === 'backfill_request')) {
				this._receiveControl(fields.data);
				return;
			}
			if (this._mirror && fields.type === 'message' && fields.from === 'group' && fields.group === this._bootstrap.groups.ingest_ack
				&& fields.dataType === 'json' && typeof fields.data === 'object' && fields.data !== null && hasKey(fields.data, { watermarks: true })) {
				this._mirror.ingestAck(fields.data);
				return;
			}
			if (fields.type === 'message' && fields.from === 'group' && typeof fields.group === 'string') {
				const group = parseGroupName(fields.group, { expected: { uid: this._owner, eid: this._environment } });
				if (group.scope === 'client' && group.lane === 'to-host') {
					if ((this._authenticationFactory || envelope?.kind === 'capabilities') && fields.fromUserId !== this._owner) {
						throw new Error('WPS publisher does not match the registered owner');
					}
					const lane = this._lanes.get(group.cid);
					if (lane) {
						lane.lastReceived = Date.now();
					}
				}
			}
			const result = parseInbound(frame, { reassembler: this._reassembler, groupValidation: { expected: { uid: this._owner, eid: this._environment } } });
			if (result.kind === 'capabilities' && result.group.scope === 'client' && result.group.lane === 'to-host') {
				if (fields.fromUserId !== this._owner) {
					throw new Error('WPS publisher does not match the registered owner');
				}
				this._lanes.get(result.group.cid)?.setReceiveCapabilities(result.accepts);
				return;
			}
			if (result.kind !== 'payload' && result.kind !== 'batch') {
				return;
			}
			if (result.group.scope === 'env' && result.group.lane === 'control') {
				if (result.kind === 'payload') {
					this._receiveControl(result.payload);
				}
			} else if (result.group.scope === 'env' && result.group.lane === 'ingest-ack' && result.kind === 'payload') {
				this._mirror?.ingestAck(result.payload);
			} else if (result.group.scope === 'client' && result.group.lane === 'to-host') {
				if (this._authenticationFactory && fields.fromUserId !== this._owner) {
					throw new Error('WPS publisher does not match the registered owner');
				}
				for (const payload of result.kind === 'batch' ? result.payloads : [result.payload]) {
					this._receiveForClient(result.group.cid, payload);
				}
			}
		} catch (error) {
			this._onError(error instanceof Error ? error : new Error(String(error)));
			if (!this._ready.isSettled) {
				this._closeInfo ??= { reason: 'protocolError', activeClients: this._lanes.size, attempts: 0 };
				this.dispose();
			}
		}
	}

	private _receiveControl(payload: unknown): void {
		if (typeof payload === 'object' && payload !== null && Object.getOwnPropertyDescriptor(payload, 'kind')?.value === 'backfill_request') {
			const backfill = this._verifier.verifyBackfill(payload);
			if (!this._mirror) {
				throw new Error('Mission Control session mirroring is unavailable');
			}
			this._mirror.backfill(backfill);
		} else {
			this._openLane(payload);
		}
	}

	private _receiveForClient(clientId: string, payload: unknown): void {
		let lane = this._lanes.get(clientId);
		if (lane?.isClosed) {
			lane = this._replaceLane(lane);
		}
		lane?.receive(payload);
	}

	private _openLane(payload: unknown): void {
		const spawn = this._verifier.verify(payload);
		const existing = this._lanes.get(spawn.client_id);
		if (existing) {
			if (existing.passive !== (spawn.passive === true)) {
				throw new Error('Mission Control cannot change the role of an existing client lane');
			}
			return;
		}
		if (this._lanes.size >= 32) {
			throw new Error('Mission Control client lane capacity reached');
		}
		this._createLane(spawn.client_id, spawn.passive === true);
		this._join(`user.${this._owner}.env.${this._environment}.client.${spawn.client_id}.to-host`);
	}

	private _replaceLane(previous: MissionControlLane): MissionControlLane {
		// Detach before disposal so a client-requested replacement does not publish a closed notice.
		this._lanes.deleteAndLeak(previous.clientId)?.dispose();
		const lane = this._createLane(previous.clientId, previous.passive);
		this._onConnection.fire(lane);
		lane.activate();
		return lane;
	}

	private _createLane(clientId: string, passive: boolean): MissionControlLane {
		const prefix = `user.${this._owner}.env.${this._environment}.client.${clientId}`;
		const lane: MissionControlLane = new MissionControlLane(clientId, passive, (group, payload, generation) => this._publish(group, payload, generation, lane), prefix, this._authenticationFactory?.(), (previous, message) => {
			if (this._closed || this._lanes.get(clientId) !== previous) {
				return;
			}
			this._replaceLane(previous).receive(message);
		}, ended => {
			if (!this._closed && this._lanes.get(clientId) === ended) {
				const ackId = ++this._ackId;
				const frame = JSON.stringify({ type: 'sendToGroup', group: `${prefix}.to-client`, ackId, dataType: 'json', noEcho: true, data: { kind: 'closed', generation: ended.generation } });
				try {
					this._enqueue(`client:${clientId}`, [{ ackId, frame, closure: true }]);
				} catch (error) {
					this._onError(error instanceof Error ? error : new Error(String(error)));
					this._closeInfo ??= { reason: 'queueFailure', activeClients: this._lanes.size, attempts: 0 };
					this.dispose();
					return;
				}
			}
		}, this._createAhpLogger);
		this._lanes.set(clientId, lane);
		return lane;
	}

	override dispose(): void {
		if (!this._closed) {
			this._closeInfo ??= { reason: 'hostClosed', activeClients: this._lanes.size, attempts: (this._recovering ?? this._confirming)?.attempts ?? 0 };
			this._recovering = this._confirming = undefined;
			this._closed = true;
			this._connected = false;
			emitConnectionDiagnostic(this._onDiagnostic, {
				operationId: '', phase: 'relayConnection', timestamp: Date.now(), outcome: 'info', connected: false,
			});
			if (!this._ready.isSettled) {
				this._ready.error(new Error('Mission Control WPS connection closed before joining control group'));
			}
			this._socket?.close();
			this._socket = undefined;
			this._outbound.clear();
			this._outboundFrames = 0;
			this._outboundBytes = 0;
			this._pendingBytes = 0;
			this._mirrorPublications.clear();
			this._queuedMirrorFrames = 0;
			this._queuedMirrorBytes = 0;
			this._pending.clear();
			this._onClose.fire();
		}
		super.dispose();
	}
}
