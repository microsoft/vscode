/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler, disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { ICloudSandboxApiService, CloudSandboxRequestError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { parse } from '../../../../../platform/github/common/client/schema.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

const LOG_PREFIX = '[CloudSandboxSessionFeed]';

type SessionFeedSocket = Pick<WebSocket, 'onmessage' | 'onerror' | 'onclose' | 'close'>;

/** Account-scoped task invalidations, independent of the AHP relay and sandbox compute lifecycle. */
export class CloudSandboxSessionFeed extends Disposable {
	private readonly _active = this._register(new MutableDisposable<DisposableStore>());
	private readonly _pending = this._register(new MutableDisposable<DisposableStore>());
	private readonly _reconnect = this._register(new RunOnceScheduler(() => void this._connect(true), 1_000));
	private readonly _refresh = this._register(new RunOnceScheduler(() => {
		const incremental = this._incremental;
		const taskIds = incremental ? [...this._taskIds] : undefined;
		this._taskIds.clear();
		this._incremental = true;
		this._onInvalidate(incremental, taskIds);
	}, 500));
	private readonly _updates = new LRUCache<string, number>(1000);
	private readonly _taskIds = new Set<string>();
	private _incremental = true;
	private _start: Promise<void> | undefined;
	private _connecting: Promise<void> | undefined;

	get connected(): boolean { return !!this._active.value; }

	constructor(
		private readonly _onInvalidate: (incremental: boolean, taskIds?: readonly string[]) => void,
		private readonly _webSocketFactory: (url: string, protocol: string) => SessionFeedSocket = (url, protocol) => new WebSocket(url, protocol),
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/** Wait for the first connection attempt before the initial authoritative list read. */
	start(): Promise<void> {
		return this._start ??= this._connect(false);
	}

	private _invalidate(incremental: boolean, taskId?: string): void {
		this._incremental &&= incremental;
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
		const store = this._pending.value = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		try {
			const connection = await this._apiService.connectSessionFeed(cancellation.token);
			if (this._store.isDisposed) {
				return;
			}
			if (!connection) {
				this._active.clear();
				this._reconnect.cancel();
				return;
			}
			const socket = this._webSocketFactory(connection.url, connection.subprotocol);
			const ready = new DeferredPromise<void>();
			let closed = false;
			store.add(toDisposable(() => {
				socket.onmessage = socket.onerror = socket.onclose = null;
				socket.close();
			}));
			const handshakeTimeout = store.add(disposableTimeout(() => ready.error(new Error('Session feed connection timed out')), 10_000));
			socket.onmessage = event => {
				try {
					if (typeof event.data !== 'string' || event.data.length > 1024 * 1024) {
						throw new Error('Invalid session feed message');
					}
					const envelope = parse.jsonObject(JSON.parse(event.data));
					if (envelope.type === 'system' && envelope.event === 'connected') {
						void ready.complete();
					} else if (envelope.type === 'system' && envelope.event === 'disconnected') {
						disconnected(true);
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
							this._invalidate(true, change.task.id);
						}
					}
				} catch {
					disconnected(false);
				}
			};
			const disconnected = (reconnect: boolean) => {
				closed = true;
				if (!ready.isSettled) {
					void ready.error(new Error('Session feed socket failed'));
				} else if (this._active.value === store) {
					this._active.clear();
					if (reconnect) {
						this._logService.debug(`${LOG_PREFIX} Disconnected; attempting one reconnect with discovery polling retained.`);
						this._reconnect.schedule();
					} else {
						this._logService.debug(`${LOG_PREFIX} Invalid or unsupported feed message; using discovery polling until the next account or feature lifetime.`);
						this._reconnect.cancel();
					}
				}
			};
			socket.onclose = socket.onerror = () => disconnected(true);
			await raceCancellationError(ready.p, cancellation.token);
			handshakeTimeout.dispose();
			if (this._store.isDisposed) {
				return;
			}
			if (closed) {
				throw new Error('Session feed disconnected during setup');
			}
			this._active.value = this._pending.clearAndLeak();
			this._reconnect.schedule(Math.max(1_000, Date.parse(connection.reconnect_after) - Date.now()));
			this._logService.debug(`${LOG_PREFIX} Connected to task status feed.`);
			if (refresh) {
				this._invalidate(false);
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				this._active.clear();
				// Socket errors may contain the token-bearing URL.
				this._logService.debug(`${LOG_PREFIX} Connection failed${error instanceof CloudSandboxRequestError ? ` (HTTP ${error.statusCode})` : ''}; using discovery polling until the next account or feature lifetime.`);
				this._reconnect.cancel();
			}
		} finally {
			this._pending.clear();
		}
	}
}
