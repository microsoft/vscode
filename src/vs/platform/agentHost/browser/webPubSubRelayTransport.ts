/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Adapted from github-ui `https://github.com/github/github-ui/blob/main/packages/ahp-relay/webpubsub/wps-transport.ts`
// (Microsoft, MIT) to VS Code's push-based {@link IClientTransport} contract.
//
// Connects to Azure Web PubSub using the reliable JSON subprotocol and
// translates between AHP JSON-RPC messages and WPS `sendToGroup` /
// group-message framing via the framing/chunking adapters. Token refresh is the
// caller's responsibility — when a token expires, dispose the old transport and
// create a new one with a fresh token.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IntervalTimer, RunOnceScheduler, disposableTimeout } from '../../../base/common/async.js';
import { hasKey, isObject } from '../../../base/common/types.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import { isJsonRpcResponse, type AhpServerNotification, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IClientTransport } from '../common/state/sessionTransport.js';
import { Reassembler } from '../common/webPubSub/chunking.js';
import { type InboundResult, RELIABLE_JSON_SUBPROTOCOL, buildPublish, parseInbound } from '../common/webPubSub/framing.js';
import type { ParseGroupNameOptions } from '../common/webPubSub/groups.js';

/** How often to sweep the reassembler for abandoned partial-chunk buffers. */
const REASSEMBLY_SWEEP_INTERVAL_MS = 15_000;

/** Upper bound on the WPS handshake and publish acknowledgement waits, not host execution. */
const WPS_TIMEOUT_MS = 30_000;

/**
 * Minimal structural subset of the browser `WebSocket` interface this transport
 * depends on, so a fake socket can be injected in tests via
 * {@link IWebPubSubRelayTransportOptions.webSocketFactory}.
 */
export interface IWebSocketLike {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number; reason: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
}

/** Opens an {@link IWebSocketLike} for `url` negotiating `subprotocol`. */
export type WebSocketFactory = (url: string, subprotocol: string) => IWebSocketLike;

/** Default factory: a real browser WebSocket (available in the Electron renderer). */
const defaultWebSocketFactory: WebSocketFactory = (url, subprotocol) =>
	new WebSocket(url, subprotocol) as unknown as IWebSocketLike;

const inboundDecoder = new TextDecoder('utf-8');

/**
 * Coerce an inbound WebSocket message payload to a string. WPS reliable JSON
 * frames are text, but `ArrayBuffer`/typed-array payloads are tolerated
 * defensively.
 */
function frameDataToString(data: unknown): string {
	if (typeof data === 'string') {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return inboundDecoder.decode(data);
	}
	if (ArrayBuffer.isView(data)) {
		return inboundDecoder.decode(data);
	}
	return String(data);
}

export interface IWebPubSubRelayTransportOptions {
	/** Mission Control's logical client ID, shared with the AHP initialize request. */
	readonly clientId: string;
	/** Full WebSocket URL (including the `access_token` and `clientId` query params). */
	readonly url: string;
	/** Group to publish outbound AHP messages to (the `to_host` lane). */
	readonly toHostGroup: string;
	/** Groups to join on connect (`broadcast` + `to_client`). */
	readonly joinGroups: readonly string[];
	/** Forwarded to {@link parseInbound} for uid/eid/cid pinning. */
	readonly groupValidation?: ParseGroupNameOptions;
	/** Opens the underlying WebSocket. Defaults to a real browser socket. */
	readonly webSocketFactory?: WebSocketFactory;
	/** Invoked for malformed frames or failed relay operations. */
	readonly onProtocolError?: (err: unknown) => void;
	/** Content-free receive counter, including control, malformed and chunk frames. */
	readonly onDidReceiveFrame?: () => void;
	/**
	 * Records every AHP frame to a JSONL transcript when
	 * `chat.agentHost.ahpJsonlLoggingEnabled` is on. Cloud sandbox hosts do not implement
	 * `vscode/collectAgentHostDebugLogs`, so this is the only way to see their frames.
	 */
	readonly ahpLogger?: AhpJsonlLogger;
}

/**
 * AHP client transport over the Web PubSub reliable JSON subprotocol.
 *
 * Lifecycle:
 * 1. {@link connect} opens the WebSocket, waits for the WPS `connected` system
 *    event, joins the requested groups, and resolves once every joinGroup ack
 *    has arrived (so the host can't publish before we're subscribed).
 * 2. Inbound messages are acknowledged and deduplicated before group-fanout
 *    reassembly and delivery via {@link onMessage}; outbound messages are
 *    chunked and published to the `to_host` lane by {@link send}.
 * 3. {@link dispose} (or a socket close/error) fires {@link onClose} once.
 */
export class WebPubSubRelayTransport extends Disposable implements IClientTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.WebPubSub;

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onDidReceiveData = this._register(new Emitter<void>());
	/** Fires for each host chunk of a message that is still being reassembled. */
	readonly onDidReceiveData = this._onDidReceiveData.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _reassembler = new Reassembler();
	private readonly _sweepTimer = this._register(new IntervalTimer());
	private readonly _publishAckTimer = this._register(new RunOnceScheduler(() => this._checkPublishAckTimeout(), WPS_TIMEOUT_MS));

	private _ws: IWebSocketLike | undefined;
	private _ackId = 0;
	private _lastReceivedSequenceId = 0;
	private readonly _pendingJoinAcks = new Map<number, string>();
	/** Publish acknowledgement deadlines in send order. */
	private readonly _pendingPublishAcks = new Map<number, number>();
	private _rejectConnect: ((err: Error) => void) | undefined;

	/** Guards against firing onClose / resolving connect more than once. */
	private _closed = false;
	private _connectResolved = false;
	private _generation: number | undefined;
	private _handshakeId: JsonRpcRequest['id'] | undefined;
	private readonly _requests = new Set<JsonRpcRequest['id']>();
	private readonly _closedBeforeHandshake = new Set<number>();
	private readonly _watch = StopWatch.create(false);
	private _publishAcknowledged = false;
	private _hostFrames = 0;
	private _hostMessages = 0;
	private _lastHostFrameMs: number | undefined;
	private _protocolErrors = 0;
	private _expiredAssemblies = 0;

	constructor(
		private readonly _options: IWebPubSubRelayTransportOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		if (this._options.ahpLogger) {
			this._register(this._options.ahpLogger);
		}
	}

	get isOpen(): boolean {
		return this._ws !== undefined && !this._closed && this._connectResolved;
	}

	/**
	 * Open a WPS WebSocket connection with the reliable JSON subprotocol and
	 * complete the join handshake. Resolves once connected, rejects on
	 * error/timeout/early-close.
	 */
	connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (this._store.isDisposed) {
				reject(new Error('Transport is disposed'));
				return;
			}

			const factory = this._options.webSocketFactory ?? defaultWebSocketFactory;
			const ws = factory(this._options.url, RELIABLE_JSON_SUBPROTOCOL);
			this._ws = ws;

			// Handshake-scoped disposables (timeout timer). Cleared once connected or failed.
			const handshakeStore = new DisposableStore();

			const settleReject = (err: Error) => {
				this._logService.warn(`${this._logContext()} handshake failed`);
				handshakeStore.dispose();
				this._closeSocket();
				reject(err);
			};

			const settleResolve = () => {
				handshakeStore.dispose();
				this._rejectConnect = undefined;
				this._connectResolved = true;
				this._logService.info(`${this._logContext()} relay ready; joinedGroups=${this._options.joinGroups.length}`);
				this._startObserving();
				resolve();
			};

			this._rejectConnect = settleReject;
			handshakeStore.add(disposableTimeout(() => {
				settleReject(new Error('WPS handshake timed out'));
			}, WPS_TIMEOUT_MS));

			ws.onopen = () => {
				// WPS reliable JSON sends a `connected` system message after open;
				// we wait for it (handled in onmessage) before joining groups.
			};

			ws.onmessage = event => {
				if (!this._closed) {
					this._options.onDidReceiveFrame?.();
				}
				let frame: Record<string, unknown>;
				try {
					frame = JSON.parse(frameDataToString(event.data)) as Record<string, unknown>;
				} catch (err) {
					this._reportProtocolError('invalid JSON', err);
					return;
				}
				this._handleHandshakeFrame(frame, settleResolve, settleReject);
			};

			ws.onerror = () => {
				settleReject(new Error('WebSocket error during WPS connect'));
			};

			ws.onclose = ev => {
				this._logService.warn(`${this._logContext()} socket closed during handshake; code=${ev.code}`);
				settleReject(new Error(`WebSocket closed before connection was established: ${ev.code} ${ev.reason}`));
			};
		});
	}

	/**
	 * Handle a frame received during the connect handshake: the WPS `connected`
	 * system event, joinGroup acks, or (defensively) early payload frames.
	 */
	private _handleHandshakeFrame(frame: Record<string, unknown>, onConnected: () => void, onFail: (err: Error) => void): void {
		if (this._closed) {
			return;
		}
		if (frame['type'] === 'system' && frame['event'] === 'connected') {
			for (const group of this._options.joinGroups) {
				const ackId = ++this._ackId;
				this._pendingJoinAcks.set(ackId, group);
				this._sendRaw({ type: 'joinGroup', group, ackId });
			}
			if (this._pendingJoinAcks.size === 0) {
				onConnected();
			}
			return;
		}

		if (frame['type'] === 'ack') {
			const ackId = typeof frame['ackId'] === 'number' ? frame['ackId'] : undefined;
			if (ackId === undefined || !this._pendingJoinAcks.has(ackId)) {
				this._handleInboundFrame(frame, onFail);
				return;
			}
			const group = this._pendingJoinAcks.get(ackId);
			this._pendingJoinAcks.delete(ackId);
			if (frame['success'] === false) {
				onFail(new Error(`WPS joinGroup failed for group '${group}'`));
				return;
			}
			if (this._pendingJoinAcks.size === 0) {
				onConnected();
			}
			return;
		}

		this._handleInboundFrame(frame, onFail);
	}

	/** Switch the socket handlers over to steady-state observation. */
	private _startObserving(): void {
		const ws = this._ws;
		if (!ws) {
			return;
		}
		this._sweepTimer.cancelAndSet(() => {
			const expired = this._reassembler.sweepExpired().length;
			if (expired > 0) {
				this._expiredAssemblies += expired;
				if (this._expiredAssemblies === expired) {
					this._logService.warn(`${this._logContext()} reassembly expired; count=${expired}`);
				}
			}
		}, REASSEMBLY_SWEEP_INTERVAL_MS);

		ws.onmessage = event => {
			if (!this._closed) {
				this._options.onDidReceiveFrame?.();
			}
			let frame: Record<string, unknown>;
			try {
				frame = JSON.parse(frameDataToString(event.data)) as Record<string, unknown>;
			} catch (err) {
				this._reportProtocolError('invalid JSON', err);
				return;
			}
			this._handleInboundFrame(frame, () => this._fireClose());
		};
		ws.onclose = event => {
			this._logService.info(`${this._logContext()} socket closed; code=${event.code}`);
			this._fireClose();
		};
		ws.onerror = () => {
			this._logService.warn(`${this._logContext()} socket error`);
			this._fireClose();
		};
	}

	/** Handle publish acknowledgements and reassemble incoming group frames. */
	private _handleInboundFrame(frame: Record<string, unknown>, onFail: (err: Error) => void): void {
		if (this._closed) {
			return;
		}
		if (frame?.['type'] === 'ack') {
			const ackId = frame['ackId'];
			if (typeof ackId !== 'number' || !this._pendingPublishAcks.delete(ackId)) {
				return;
			}
			this._schedulePublishAckTimeout();
			const error = frame['error'];
			const errorName = isObject(error) ? (error as { readonly name?: unknown }).name : undefined;
			// Duplicate means the relay already accepted this publish, not that the host executed it.
			if (frame['success'] === true || (frame['success'] === false && errorName === 'Duplicate')) {
				if (!this._publishAcknowledged) {
					this._publishAcknowledged = true;
					this._logService.info(`${this._logContext()} first publish acknowledged; ackId=${ackId}`);
				}
				return;
			}
			const failure = new Error('WPS publish failed');
			this._reportProtocolError('publish rejected', failure, true);
			onFail(failure);
			return;
		}
		if (frame?.['type'] === 'message' && frame['sequenceId'] !== undefined) {
			const sequenceId = frame['sequenceId'];
			if (typeof sequenceId !== 'number' || !Number.isSafeInteger(sequenceId) || sequenceId <= 0) {
				this._reportProtocolError('invalid sequence ID', new Error('Invalid WPS message sequenceId'));
				return;
			}
			const duplicate = sequenceId <= this._lastReceivedSequenceId;
			this._lastReceivedSequenceId = Math.max(this._lastReceivedSequenceId, sequenceId);
			try {
				// Receipt acknowledgements must not wait for reassembly or application processing.
				this._sendRaw({ type: 'sequenceAck', sequenceId: this._lastReceivedSequenceId });
			} catch (err) {
				const error = new Error('Failed to send WPS sequence acknowledgement', { cause: err });
				this._reportProtocolError('sequence acknowledgement failed', error, true);
				onFail(error);
				return;
			}
			if (duplicate) {
				return;
			}
		}
		let result: InboundResult;
		try {
			result = parseInbound(frame, { reassembler: this._reassembler, groupValidation: this._options.groupValidation });
		} catch (err) {
			this._reportProtocolError('invalid group message', err);
			return;
		}
		if (result.kind === 'payload' || result.kind === 'batch' || result.kind === 'pending') {
			this._lastHostFrameMs = this._watch.elapsed();
			if (++this._hostFrames === 1) {
				this._logService.info(`${this._logContext()} first host frame received`);
			}
		}
		if (result.kind === 'closed') {
			if (result.group.scope === 'client' && result.group.lane === 'to-client') {
				if (this._handshakeId !== undefined) {
					if (result.generation !== undefined) {
						this._closedBeforeHandshake.add(result.generation);
						if (this._closedBeforeHandshake.size > 128) {
							this._options.onProtocolError?.(new Error('Relay handshake closure window exceeded'));
							this._fireClose();
						}
					}
				} else if (result.generation === undefined || result.generation === this._generation) {
					this._fireClose();
				}
			}
		} else if (result.kind === 'payload' || result.kind === 'batch') {
			for (const value of result.kind === 'batch' ? result.payloads : [result.payload]) {
				if (this._closed) {
					break;
				}
				this._deliver(value as ProtocolMessage, result.generation);
			}
		} else if (result.kind === 'pending') {
			// Only host chunks count: relay acks and system frames arrive even when the host is dead.
			this._onDidReceiveData.fire();
		}
	}

	private _deliver(payload: ProtocolMessage, generation: number | undefined): void {
		if (!isObject(payload) || payload.jsonrpc !== '2.0') {
			this._options.onProtocolError?.(new Error('Invalid AHP relay message'));
			return;
		}
		const response = isJsonRpcResponse(payload);
		if (this._handshakeId !== undefined && !(response && payload.id === this._handshakeId)) {
			return;
		}
		if (response && payload.id !== null && payload.id === this._handshakeId) {
			if (generation !== undefined && this._closedBeforeHandshake.has(generation)) {
				this._fireClose();
				return;
			}
			this._generation = generation;
			this._handshakeId = undefined;
			this._closedBeforeHandshake.clear();
			this._requests.clear();
		} else if (generation !== undefined && this._generation !== undefined && generation !== this._generation) {
			if (response && payload.id !== null && this._requests.has(payload.id)) {
				this._fireClose();
			}
			return;
		}
		if (response && payload.id !== null) {
			this._requests.delete(payload.id);
		}
		this._hostMessages++;
		this._logProtocolMessage(payload, 's2c');
		this._onMessage.fire(payload);
	}

	/** Publish each chunk once; rejection or a missing acknowledgement after 30 seconds fails the transport. */
	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest): void {
		if (this._closed || !this._ws) {
			throw new Error('WebPubSubRelayTransport is closed');
		}
		if (hasKey(message, { method: true, params: true }) && message.method === 'authenticate'
			&& (!isObject(message.params) || typeof message.params['token'] !== 'string' || !message.params['token'].startsWith('copilot-sealed.v1.'))) {
			throw new Error('Refusing to send plaintext authentication over Web PubSub');
		}
		if (hasKey(message, { id: true, method: true }) && (typeof message.id === 'number' || typeof message.id === 'string')) {
			if (this._requests.size >= 1024) {
				this._fireClose();
				throw new Error('Web PubSub outstanding request limit exceeded');
			}
			this._requests.add(message.id);
			if (message.method === 'initialize' || message.method === 'reconnect') {
				this._handshakeId = message.id;
				this._closedBeforeHandshake.clear();
			}
		}
		// Logged before chunking, so the transcript carries whole AHP messages rather than the
		// relay frames they were split into.
		this._logProtocolMessage(message, 'c2s');
		const frames = buildPublish({
			group: this._options.toHostGroup,
			nextAckId: () => ++this._ackId,
			payload: message,
		});
		for (const frame of frames) {
			this._pendingPublishAcks.set(frame.ackId, Date.now() + WPS_TIMEOUT_MS);
			try {
				this._sendRaw(frame);
			} catch (err) {
				this._pendingPublishAcks.delete(frame.ackId);
				throw err;
			} finally {
				this._schedulePublishAckTimeout();
			}
		}
	}

	private _logProtocolMessage(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest, direction: 'c2s' | 's2c'): void {
		if (!this._options.ahpLogger) {
			return;
		}
		const logged = hasKey(message, { method: true, params: true }) && message.method === 'authenticate' && isObject(message.params)
			? { ...message, params: { ...message.params, token: '[REDACTED]' } }
			: message;
		this._options.ahpLogger.log(logged, direction, getAhpLogByteLength(JSON.stringify(message)));
	}

	private _schedulePublishAckTimeout(): void {
		const deadline = this._pendingPublishAcks.values().next().value;
		if (deadline === undefined) {
			this._publishAckTimer.cancel();
		} else if (!this._publishAckTimer.isScheduled()) {
			this._publishAckTimer.schedule(Math.max(0, deadline - Date.now()));
		}
	}

	private _checkPublishAckTimeout(): void {
		const deadline = this._pendingPublishAcks.values().next().value;
		if (this._closed || deadline === undefined) {
			return;
		}
		if (deadline > Date.now()) {
			this._schedulePublishAckTimeout();
			return;
		}
		const error = new Error('WPS publish acknowledgement timed out');
		this._reportProtocolError('publish acknowledgement timed out', error, true);
		if (this._rejectConnect) {
			this._rejectConnect(error);
		} else {
			this._fireClose();
		}
	}

	private _sendRaw(obj: unknown): void {
		this._ws?.send(JSON.stringify(obj));
	}

	private _logContext(): string {
		return `[WebPubSubRelayTransport] clientId=${this._options.clientId} durationMs=${this._watch.elapsed()}`;
	}

	private _reportProtocolError(kind: string, error: unknown, fatal = false): void {
		if (++this._protocolErrors === 1 || fatal) {
			this._logService.warn(`${this._logContext()} protocol error; kind=${kind}`);
		}
		this._options.onProtocolError?.(error);
	}

	/** Fire onClose exactly once and stop background work. */
	private _fireClose(): void {
		if (this._closed) {
			return;
		}
		this._closeSocket();
		this._onClose.fire();
	}

	/** Stop background work and close the socket without firing onClose. */
	private _closeSocket(): void {
		if (!this._closed) {
			this._logService.info(`${this._logContext()} closing; relayReady=${this._connectResolved} publishAcknowledged=${this._publishAcknowledged} pendingJoins=${this._pendingJoinAcks.size} pendingPublishes=${this._pendingPublishAcks.size} hostFrames=${this._hostFrames} hostMessages=${this._hostMessages} hostSilenceMs=${this._lastHostFrameMs === undefined ? 'none' : this._watch.elapsed() - this._lastHostFrameMs} protocolErrors=${this._protocolErrors} expiredAssemblies=${this._expiredAssemblies}`);
		}
		this._closed = true;
		this._sweepTimer.cancel();
		this._publishAckTimer.cancel();
		this._pendingJoinAcks.clear();
		this._pendingPublishAcks.clear();
		this._requests.clear();
		this._closedBeforeHandshake.clear();
		this._rejectConnect = undefined;
		try {
			this._ws?.close();
		} catch {
			// best-effort
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closeSocket();
		}
		super.dispose();
	}
}
