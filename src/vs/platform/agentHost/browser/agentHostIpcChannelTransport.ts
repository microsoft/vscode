/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// IPC channel transport for the agent host protocol. Wraps an `IChannel`
// (typically obtained via `IRemoteAgentConnection.getChannel('agentHost')`)
// to satisfy the same `IClientTransport` interface as `WebSocketClientTransport`,
// so the existing `RemoteAgentHostProtocolClient` can be reused unchanged.
//
// The server-side counterpart (`AgentHostChannel`) opens an AHP WebSocket
// upstream to the local agent host process and pipes raw JSON frames over
// the IPC channel.

import { timeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import type { AhpServerNotification, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IClientTransport } from '../common/state/sessionTransport.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../common/transportConstants.js';

const REDACTED_TOKEN = '<redacted>';

/** Total wall-clock budget for retrying the upstream `connect` while the agent host registers its IPC channel. */
const DEFAULT_CONNECT_RETRY_BUDGET_MS = 20_000;
/** Initial backoff between `connect` retries; doubles up to {@link DEFAULT_CONNECT_RETRY_MAX_DELAY_MS}. */
const DEFAULT_CONNECT_RETRY_INITIAL_DELAY_MS = 250;
/** Upper bound on the backoff between `connect` retries. */
const DEFAULT_CONNECT_RETRY_MAX_DELAY_MS = 2_000;

/** Connect-retry tunables for {@link AgentHostIpcChannelTransport}; overridable in tests. */
export interface IAgentHostIpcChannelTransportOptions {
	readonly connectRetryBudgetMs?: number;
	readonly connectRetryInitialDelayMs?: number;
	readonly connectRetryMaxDelayMs?: number;
	/** Delay primitive between retries; defaults to a real timer. */
	readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * The IPC `ChannelServer` rejects calls to a channel it hasn't registered yet
 * with an error named `'Unknown channel'` once its timeout elapses. For the
 * agent host that means the host process is still booting and hasn't registered
 * `agentHostProtocol` — a transient, retryable condition rather than a hard
 * failure.
 */
function isUnknownChannelError(error: unknown): boolean {
	return error instanceof Error && error.name === 'Unknown channel';
}

/**
 * Wraps an {@link IChannel} as an {@link IClientTransport} for the agent
 * host protocol. Frames are passed as JSON strings to avoid the IPC layer's
 * URI revival (URIs in AHP are string-typed on the wire).
 *
 * Wire shape:
 * - `listen('frame')` → emits each upstream JSON frame as a string.
 * - `listen('close')` → fires when the upstream connection closes.
 * - `call('connect')` → opens the upstream connection; resolves when ready.
 * - `call('send', frame)` → forwards a JSON frame upstream.
 */
export class AgentHostIpcChannelTransport extends Disposable implements IClientTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _isOpen = false;
	private _closeFired = false;
	private _malformedFrames = 0;

	private readonly _connectRetryBudgetMs: number;
	private readonly _connectRetryInitialDelayMs: number;
	private readonly _connectRetryMaxDelayMs: number;
	private readonly _sleep: (ms: number) => Promise<void>;

	/** Cancels an in-flight connect-retry backoff when the transport is disposed. */
	private readonly _connectCts = new CancellationTokenSource();

	constructor(
		private readonly _channel: IChannel,
		private readonly _ahpLogger?: AhpJsonlLogger,
		options?: IAgentHostIpcChannelTransportOptions,
	) {
		super();
		this._connectRetryBudgetMs = options?.connectRetryBudgetMs ?? DEFAULT_CONNECT_RETRY_BUDGET_MS;
		this._connectRetryInitialDelayMs = options?.connectRetryInitialDelayMs ?? DEFAULT_CONNECT_RETRY_INITIAL_DELAY_MS;
		this._connectRetryMaxDelayMs = options?.connectRetryMaxDelayMs ?? DEFAULT_CONNECT_RETRY_MAX_DELAY_MS;
		this._sleep = options?.sleep ?? (ms => timeout(ms, this._connectCts.token));
	}

	get isOpen(): boolean {
		return this._isOpen && !this._closeFired;
	}

	async connect(): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Transport is disposed');
		}
		// Subscribe before connecting so we don't miss any frames the upstream
		// host emits between open and our listener attaching. Event listens to a
		// not-yet-registered IPC channel are buffered by the ChannelServer and
		// flushed once it registers, so subscribing once — before any connect
		// retry — is correct even while the host is still booting.
		this._register(this._channel.listen<string>('frame')(text => this._handleFrame(text)));
		this._register(this._channel.listen<void>('close')(() => this._fireClose()));
		await this._connectWithRetry();
		this._isOpen = true;
	}

	/**
	 * Opens the upstream connection, retrying while the agent host is still
	 * registering its `agentHostProtocol` IPC channel. On a slow host boot the
	 * channel can be registered only after the IPC ChannelServer's unknown-channel
	 * timeout, which rejects `call('connect')` with a transient "Unknown channel"
	 * error even though the channel appears moments later. The local transport
	 * cannot reconnect once the protocol client gives up, so treating that
	 * transient timeout as fatal is what leaves the agent host missing from the
	 * picker until a window reload — retry with backoff up to a bounded budget
	 * instead, and surface any other error (or budget exhaustion) unchanged.
	 */
	private async _connectWithRetry(): Promise<void> {
		const deadline = Date.now() + this._connectRetryBudgetMs;
		let delay = this._connectRetryInitialDelayMs;
		for (; ;) {
			try {
				await this._channel.call('connect');
				return;
			} catch (error) {
				if (this._store.isDisposed || !isUnknownChannelError(error) || Date.now() >= deadline) {
					throw error;
				}
			}
			await this._sleep(delay);
			if (this._store.isDisposed) {
				throw new Error('Transport is disposed');
			}
			delay = Math.min(delay * 2, this._connectRetryMaxDelayMs);
		}
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcResponse): void {
		if (!this._isOpen || this._closeFired) {
			// Surface the failure via the close event; callers observe that.
			this._fireClose();
			return;
		}
		// Fire-and-forget. The channel call resolves asynchronously; failures
		// are surfaced via the close event from the server side.
		const text = JSON.stringify(message);
		this._logFrame(message, 'c2s', text);
		this._channel.call('send', text).catch(() => this._fireClose());
	}

	override dispose(): void {
		// Cancel any in-flight connect-retry backoff so teardown doesn't wait it out.
		this._connectCts.dispose(true);
		if (this._isOpen && !this._closeFired) {
			// Best-effort close — ignore any rejection since we're tearing down.
			this._channel.call('close').catch(() => { });
		}
		this._fireClose();
		super.dispose();
	}

	private _handleFrame(text: string): void {
		let message: ProtocolMessage;
		try {
			message = JSON.parse(text) as ProtocolMessage;
		} catch (err) {
			this._malformedFrames++;
			if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
				const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
				console.warn(
					`[AgentHostIpcChannelTransport] Malformed frame #${this._malformedFrames} (len=${text.length}): ${preview}`,
					err instanceof Error ? err.message : String(err)
				);
			}
			if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
				console.warn('[AgentHostIpcChannelTransport] Malformed frame threshold exceeded; closing transport.');
				this._fireClose();
			}
			return;
		}
		this._logFrame(message, 's2c', text);
		this._onMessage.fire(message);
	}

	private _logFrame(message: object, direction: 'c2s' | 's2c', text: string): void {
		this._ahpLogger?.log(redactAuthenticationToken(message), direction, getAhpLogByteLength(text));
	}

	private _fireClose(): void {
		if (this._closeFired) {
			return;
		}
		this._closeFired = true;
		this._isOpen = false;
		this._onClose.fire();
	}
}

function redactAuthenticationToken(message: object): object {
	const candidate = message as { readonly method?: unknown; readonly params?: unknown };
	if (candidate.method !== 'authenticate' || typeof candidate.params !== 'object' || candidate.params === null) {
		return message;
	}

	const params = candidate.params as Record<string, unknown>;
	if (typeof params.token !== 'string') {
		return message;
	}

	return { ...candidate, params: { ...params, token: REDACTED_TOKEN } };
}
