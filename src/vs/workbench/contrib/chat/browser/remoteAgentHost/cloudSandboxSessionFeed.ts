/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler, disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { ICloudSandboxApiService, CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { computeReconnectDelay } from '../../../../../platform/agentHost/common/reconnectPolicy.js';
import { parse, SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { RequestError } from '../../../../../platform/github/common/types.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICloudSandboxTelemetryService, type CloudSandboxSessionFeedOutcome, type CloudSandboxSessionFeedReason, type ICloudSandboxSessionFeedTelemetryData } from './cloudSandboxTelemetry.js';

const LOG_PREFIX = '[CloudSandboxSessionFeed]';
/** Shared ceiling so that neither a flapping socket nor a failing service is retried more than a few times an hour. */
const maxBackoffMs = 30 * 60_000;
/** Dropped sockets reconnect within seconds, but every further drop before a healthy minute doubles the delay. */
const reconnectPolicy = { initialDelayMs: 1_000, maxDelayMs: maxBackoffMs, jitter: true };
/** Failed negotiations and handshakes start far slower: the service is the likely cause, and discovery polling covers the gap. */
const retryPolicy = { initialDelayMs: 60_000, maxDelayMs: maxBackoffMs, jitter: true };
const healthyConnectionMs = 60_000;

type SessionFeedSocket = Pick<WebSocket, 'onmessage' | 'onerror' | 'onclose' | 'close'>;

export type CloudSandboxSessionFeedRefresh =
	| { readonly reason: 'change'; readonly taskIds: readonly string[] }
	| { readonly reason: 'renewal' | 'reconnect' };

/** Account-scoped task invalidations, independent of the AHP relay. Renewals and connection gaps request inventory catch-up. */
export class CloudSandboxSessionFeed extends Disposable {
	private readonly _active = this._register(new MutableDisposable<DisposableStore>());
	private readonly _pending = this._register(new MutableDisposable<DisposableStore>());
	private readonly _reconnect = this._register(new RunOnceScheduler(() => void this._connect(true), reconnectPolicy.initialDelayMs));
	private readonly _refresh = this._register(new RunOnceScheduler(() => {
		const reason = this._refreshReason;
		const taskIds = this.takePendingTaskIds();
		this._refreshReason = undefined;
		if (reason) {
			this._onInvalidate({ reason });
		}
		// Incremental catch-up must not discard explicit hints for removed or inaccessible tasks.
		if (taskIds.length) {
			this._onInvalidate({ reason: 'change', taskIds });
		}
	}, 500));
	private readonly _updates = new LRUCache<string, number>(1000);
	private readonly _taskIds = new Set<string>();
	private _refreshReason: 'renewal' | 'reconnect' | undefined;
	private _start: Promise<void> | undefined;
	private _connecting: Promise<void> | undefined;
	/** Dropped sockets and failed attempts since the last healthy connection; drives both backoff policies. */
	private _consecutiveFailures = 0;
	private _connectionWatch: Pick<StopWatch, 'elapsed'> | undefined;
	private _messageWatch: Pick<StopWatch, 'elapsed'> | undefined;
	private _gapWatch: Pick<StopWatch, 'elapsed'> | undefined;

	get connected(): boolean { return !!this._active.value; }

	constructor(
		private readonly _onInvalidate: (refresh: CloudSandboxSessionFeedRefresh) => void,
		private readonly _webSocketFactory: (url: string, protocol: string) => SessionFeedSocket = (url, protocol) => new WebSocket(url, protocol),
		private readonly _stopWatchFactory: () => Pick<StopWatch, 'elapsed'> = () => StopWatch.create(),
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
		@ICloudSandboxTelemetryService private readonly _telemetryService: ICloudSandboxTelemetryService,
	) {
		super();
	}

	/** Wait for the first connection attempt before the initial authoritative list read. */
	start(): Promise<void> {
		return this._start ??= this._connect(false);
	}

	/** Drains buffered task hints before stopping the subscription. */
	takePendingTaskIds(): readonly string[] {
		this._refresh.cancel();
		const taskIds = [...this._taskIds];
		this._taskIds.clear();
		return taskIds;
	}

	private _invalidate(reason: CloudSandboxSessionFeedRefresh['reason'], taskId?: string): void {
		if (reason === 'reconnect' || (reason === 'renewal' && this._refreshReason !== 'reconnect')) {
			this._refreshReason = reason;
		}
		if (taskId) {
			this._taskIds.add(taskId);
		}
		if (!this._refresh.isScheduled()) {
			this._refresh.schedule();
		}
	}

	private _connect(refresh: boolean): Promise<void> {
		return this._connecting ??= this._doConnect(refresh).finally(() => this._connecting = undefined);
	}

	private async _doConnect(refresh: boolean): Promise<void> {
		const previousConnection = this._active.value;
		const store = this._pending.value = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		let negotiated = false;
		let failureReason: CloudSandboxSessionFeedReason = 'negotiationError';
		try {
			const connectionTime = this._stopWatchFactory();
			const connection = await this._apiService.connectSessionFeed(cancellation.token);
			if (this._store.isDisposed) {
				return;
			}
			if (!connection) {
				const diagnostics = this._connectionDiagnostics();
				this._active.clear();
				this._reconnect.cancel();
				this._report('unavailable', 'unavailable', undefined, undefined, diagnostics);
				return;
			}
			negotiated = true;
			failureReason = 'socketSetup';
			const socket = this._webSocketFactory(connection.url, connection.subprotocol);
			const ready = new DeferredPromise<void>();
			let closed = false;
			store.add(toDisposable(() => {
				socket.onmessage = socket.onerror = socket.onclose = null;
				socket.close();
			}));
			const handshakeTimeout = store.add(disposableTimeout(() => {
				failureReason = 'handshakeTimeout';
				void ready.error(new Error('Session feed connection timed out'));
			}, 10_000));
			let lastMessage: Pick<StopWatch, 'elapsed'> | undefined;
			socket.onmessage = event => {
				lastMessage = this._stopWatchFactory();
				if (this._active.value === store) {
					this._messageWatch = lastMessage;
				}
				try {
					if (typeof event.data !== 'string' || event.data.length > 1024 * 1024) {
						throw new Error('Invalid session feed message');
					}
					const envelope = parse.jsonObject(JSON.parse(event.data));
					if (envelope.type === 'system' && envelope.event === 'connected') {
						void ready.complete();
					} else if (envelope.type === 'system' && envelope.event === 'disconnected') {
						disconnected('serverDisconnect');
					} else if (envelope.type === 'message' && (envelope.from === 'server' || envelope.group === connection.group)) {
						// WPS server-published messages omit the group even when sent to a group.
						const data = parse.jsonObject(envelope.data);
						if (data.type !== 'task.changed') {
							return;
						}
						const change = parse.object<{ schema_version: 1; task: { id: string; updated_at: string } }>({
							schema_version: parse.exact(1),
							task: parse.object({ id: parse.nonEmptyString, updated_at: parse.dateTime }),
						})(data);
						const updatedAt = Date.parse(change.task.updated_at);
						if (updatedAt > (this._updates.get(change.task.id) ?? -Infinity)) {
							this._updates.set(change.task.id, updatedAt);
							this._invalidate('change', change.task.id);
						}
					}
				} catch {
					disconnected('invalidMessage');
				}
			};
			const disconnected = (reason: CloudSandboxSessionFeedReason) => {
				if (closed) {
					return;
				}
				closed = true;
				failureReason = reason;
				if (!ready.isSettled) {
					void ready.error(new Error('Session feed socket failed'));
				} else if (this._active.value === store) {
					const diagnostics = this._connectionDiagnostics();
					this._active.clear();
					this._connectionWatch = this._messageWatch = undefined;
					this._gapWatch ??= this._stopWatchFactory();
					if (reason !== 'invalidMessage') {
						const delay = computeReconnectDelay(reconnectPolicy, ++this._consecutiveFailures);
						this._logService.debug(`${LOG_PREFIX} Disconnected; reconnecting in ${delay}ms with discovery polling retained.`);
						this._reconnect.schedule(delay);
						this._report('disconnected', reason, delay, undefined, diagnostics);
					} else {
						this._logService.debug(`${LOG_PREFIX} Invalid or unsupported feed message; using discovery polling until the next account or feature lifetime.`);
						this._reconnect.cancel();
						this._report('invalidMessage', reason, undefined, undefined, diagnostics);
					}
				}
			};
			socket.onclose = event => disconnected(event.code === 1000 ? 'normalClose' : event.code === 1001 ? 'goingAway'
				: event.code === 1006 ? 'abnormalClose' : event.code === 1008 ? 'policyClose' : 'otherClose');
			socket.onerror = () => disconnected('socketError');
			await raceCancellationError(ready.p, cancellation.token);
			handshakeTimeout.dispose();
			if (this._store.isDisposed) {
				return;
			}
			if (closed) {
				throw new Error('Session feed disconnected during setup');
			}
			const continuous = previousConnection !== undefined && this._active.value === previousConnection;
			const diagnostics = this._connectionDiagnostics();
			const gapDurationMs = this._gapWatch?.elapsed();
			this._gapWatch = undefined;
			store.add(disposableTimeout(() => this._consecutiveFailures = 0, healthyConnectionMs));
			this._active.value = this._pending.clearAndLeak();
			this._connectionWatch = this._stopWatchFactory();
			this._messageWatch = lastMessage;
			const reconnectDelay = connection.reconnect_in !== undefined
				? connection.reconnect_in - connectionTime.elapsed()
				: Date.parse(connection.reconnect_after) - Date.now();
			this._reconnect.schedule(Math.max(1_000, reconnectDelay));
			this._logService.debug(`${LOG_PREFIX} Connected to task status feed.`);
			this._report(continuous ? 'renewed' : 'connected', continuous ? 'renewal' : refresh ? 'recovery' : 'initial',
				undefined, undefined, { ...diagnostics, gapDurationMs });
			if (refresh) {
				this._invalidate(continuous ? 'renewal' : 'reconnect');
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				const diagnostics = this._connectionDiagnostics();
				this._active.clear();
				this._connectionWatch = this._messageWatch = undefined;
				this._gapWatch ??= this._stopWatchFactory();
				const statusCode = error instanceof CloudSandboxRequestError ? error.statusCode : undefined;
				const retryAfterMs = error instanceof CloudSandboxRequestError && error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : 0;
				const delay = Math.max(computeReconnectDelay(retryPolicy, ++this._consecutiveFailures), retryAfterMs);
				// Socket errors may contain the token-bearing URL.
				this._logService.debug(`${LOG_PREFIX} Connection failed${statusCode !== undefined ? ` (HTTP ${statusCode})` : ''}; retrying in ${delay}ms with discovery polling retained.`);
				this._reconnect.schedule(delay);
				if (!negotiated) {
					if (error instanceof CloudSandboxAuthenticationRequiredError || error instanceof RequestError && (error.kind === 'authentication' || error.kind === 'authorization')) {
						failureReason = 'authenticationUnavailable';
					} else if (error instanceof SchemaError) {
						failureReason = 'invalidMetadata';
					} else if (error instanceof RequestError) {
						failureReason = error.kind === 'network' ? 'networkFailure' : error.kind === 'timeout' ? 'negotiationTimeout'
							: error.kind === 'schema' || error.kind === 'malformedResponse' || error.kind === 'validation' ? 'invalidMetadata' : failureReason;
					}
				}
				this._report(negotiated ? 'socketFailed' : 'negotiationFailed',
					statusCode !== undefined ? 'negotiationRejected' : failureReason, delay, statusCode, diagnostics);
			}
		} finally {
			this._pending.clear();
		}
	}

	private _connectionDiagnostics(): Pick<ICloudSandboxSessionFeedTelemetryData, 'connectionDurationMs' | 'lastMessageAgeMs'> {
		return { connectionDurationMs: this._connectionWatch?.elapsed(), lastMessageAgeMs: this._messageWatch?.elapsed() };
	}

	private _report(outcome: CloudSandboxSessionFeedOutcome, reason: CloudSandboxSessionFeedReason, retryDelayMs?: number, statusCode?: number, diagnostics?: Partial<ICloudSandboxSessionFeedTelemetryData>): void {
		this._telemetryService.reportSessionFeed({ ...diagnostics, outcome, reason, consecutiveFailures: this._consecutiveFailures, retryDelayMs, statusCode });
	}
}
