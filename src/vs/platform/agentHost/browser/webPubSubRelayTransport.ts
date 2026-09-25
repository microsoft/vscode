/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Adapted from github-ui `https://github.com/github/github-ui/blob/main/packages/ahp-relay/webpubsub/wps-transport.ts`
// (Microsoft, MIT) to JustRide's push-based {@link IClientTransport} contract.
//
// Connects to Azure Web PubSub using the reliable JSON subprotocol and
// translates between AHP JSON-RPC messages and WPS `sendToGroup` /
// group-message framing via the framing/chunking adapters. Token refresh is the
// caller's responsibility — when a token expires, dispose the old transport and
// create a new one with a fresh token.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IntervalTimer, RunOnceScheduler, disposableTimeout } from '../../../base/common/async.js';
import { isObject } from '../../../base/common/types.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
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

	constructor(private readonly _options: IWebPubSubRelayTransportOptions) {
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
				handshakeStore.dispose();
				this._closeSocket();
				reject(err);
			};

			const settleResolve = () => {
				handshakeStore.dispose();
				this._rejectConnect = undefined;
				this._connectResolved = true;
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
					this._options.onProtocolError?.(err);
					return;
				}
				this._handleHandshakeFrame(frame, settleResolve, settleReject);
			};

			ws.onerror = () => {
				settleReject(new Error('WebSocket error during WPS connect'));
			};

			ws.onclose = ev => {
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
		this._sweepTimer.cancelAndSet(() => this._reassembler.sweepExpired(), REASSEMBLY_SWEEP_INTERVAL_MS);

		ws.onmessage = event => {
			if (!this._closed) {
				this._options.onDidReceiveFrame?.();
			}
			let frame: Record<string, unknown>;
			try {
				frame = JSON.parse(frameDataToString(event.data)) as Record<string, unknown>;
			} catch (err) {
				this._options.onProtocolError?.(err);
				return;
			}
			this._handleInboundFrame(frame, () => this._fireClose());
		};
		ws.onclose = () => this._fireClose();
		ws.onerror = () => this._fireClose();
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
				return;
			}
			const failure = new Error('WPS publish failed');
			this._options.onProtocolError?.(failure);
			onFail(failure);
			return;
		}
		if (frame?.['type'] === 'message' && frame['sequenceId'] !== undefined) {
			const sequenceId = frame['sequenceId'];
			if (typeof sequenceId !== 'number' || !Number.isSafeInteger(sequenceId) || sequenceId <= 0) {
				this._options.onProtocolError?.(new Error('Invalid WPS message sequenceId'));
				return;
			}
			const duplicate = sequenceId <= this._lastReceivedSequenceId;
			this._lastReceivedSequenceId = Math.max(this._lastReceivedSequenceId, sequenceId);
			try {
				// Receipt acknowledgements must not wait for reassembly or application processing.
				this._sendRaw({ type: 'sequenceAck', sequenceId: this._lastReceivedSequenceId });
			} catch (err) {
				const error = new Error('Failed to send WPS sequence acknowledgement', { cause: err });
				this._options.onProtocolError?.(error);
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
			this._options.onProtocolError?.(err);
			return;
		}
		if (result.kind === 'payload') {
			const payload = result.payload as ProtocolMessage;
			this._options.ahpLogger?.log(payload, 's2c', getAhpLogByteLength(JSON.stringify(payload)));
			this._onMessage.fire(payload);
		}
	}

	/** Publish each chunk once; rejection or a missing acknowledgement after 30 seconds fails the transport. */
	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest): void {
		if (this._closed || !this._ws) {
			throw new Error('WebPubSubRelayTransport is closed');
		}
		// Logged before chunking, so the transcript carries whole AHP messages rather than the
		// relay frames they were split into.
		this._options.ahpLogger?.log(message, 'c2s', getAhpLogByteLength(JSON.stringify(message)));
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
		this._options.onProtocolError?.(error);
		if (this._rejectConnect) {
			this._rejectConnect(error);
		} else {
			this._fireClose();
		}
	}

	private _sendRaw(obj: unknown): void {
		this._ws?.send(JSON.stringify(obj));
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
		this._closed = true;
		this._sweepTimer.cancel();
		this._publishAckTimer.cancel();
		this._pendingJoinAcks.clear();
		this._pendingPublishAcks.clear();
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
