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
import { IntervalTimer, disposableTimeout } from '../../../base/common/async.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IClientTransport } from '../common/state/sessionTransport.js';
import { Reassembler } from '../common/webPubSub/chunking.js';
import { type InboundResult, RELIABLE_JSON_SUBPROTOCOL, buildPublish, parseInbound } from '../common/webPubSub/framing.js';
import type { ParseGroupNameOptions } from '../common/webPubSub/groups.js';

/** How often to sweep the reassembler for abandoned partial-chunk buffers. */
const REASSEMBLY_SWEEP_INTERVAL_MS = 15_000;

/** Upper bound on the WPS handshake (socket open → `connected` → all joinGroup acks). */
const WPS_HANDSHAKE_TIMEOUT_MS = 30_000;

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
	/** Invoked when an inbound frame can't be parsed or framed. */
	readonly onProtocolError?: (err: unknown) => void;
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
 * 2. Inbound group-fanout frames are reassembled and surfaced via
 *    {@link onMessage}; outbound messages are chunked and published to the
 *    `to_host` lane by {@link send}.
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

	private _ws: IWebSocketLike | undefined;
	private _ackId = 0;
	private readonly _pendingJoinAcks = new Map<number, string>();

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
				this._failConnect();
				reject(err);
			};

			const settleResolve = () => {
				handshakeStore.dispose();
				this._connectResolved = true;
				this._startObserving();
				resolve();
			};

			handshakeStore.add(disposableTimeout(() => {
				settleReject(new Error('WPS handshake timed out'));
			}, WPS_HANDSHAKE_TIMEOUT_MS));

			ws.onopen = () => {
				// WPS reliable JSON sends a `connected` system message after open;
				// we wait for it (handled in onmessage) before joining groups.
			};

			ws.onmessage = event => {
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

		// Any group-fanout frames that arrive before the handshake completes are
		// buffered by the reassembler and surfaced once observing starts.
		this._ingestGroupFrame(frame);
	}

	/** Switch the socket handlers over to steady-state observation. */
	private _startObserving(): void {
		const ws = this._ws;
		if (!ws) {
			return;
		}
		this._sweepTimer.cancelAndSet(() => this._reassembler.sweepExpired(), REASSEMBLY_SWEEP_INTERVAL_MS);

		ws.onmessage = event => {
			let frame: Record<string, unknown>;
			try {
				frame = JSON.parse(frameDataToString(event.data)) as Record<string, unknown>;
			} catch (err) {
				this._options.onProtocolError?.(err);
				return;
			}
			this._ingestGroupFrame(frame);
		};
		ws.onclose = () => this._fireClose();
		ws.onerror = () => this._fireClose();
	}

	/** Reassemble and surface a group-fanout frame as a {@link ProtocolMessage}. */
	private _ingestGroupFrame(frame: Record<string, unknown>): void {
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

	/**
	 * TODO: publish acks are requested but not tracked — a `success: false` ack is dropped by
	 * {@link _ingestGroupFrame}, so the message never reaches the host, no JSON-RPC reply can
	 * arrive, and the request stays pending forever while the transport still looks open. The
	 * symptom is a session that stops responding mid-turn with no error. Fixing it means tracking
	 * publish ack ids here and failing the transport on a rejected ack — kept as-is for now to stay
	 * in sync with github-ui `ahp-relay/webpubsub/wps-transport.ts`, which behaves the same way.
	 */
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
			this._sendRaw(frame);
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
		this._closed = true;
		this._sweepTimer.cancel();
		this._onClose.fire();
	}

	/** Tear down a failed/incomplete connect without firing onClose to observers. */
	private _failConnect(): void {
		this._closed = true;
		this._sweepTimer.cancel();
		try {
			this._ws?.close();
		} catch {
			// best-effort
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._sweepTimer.cancel();
			try {
				this._ws?.close();
			} catch {
				// best-effort
			}
		}
		super.dispose();
	}
}
