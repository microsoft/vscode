/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedMap, Touch } from '../../../../../base/common/map.js';
import { IReplayedTaskHistory } from '../../../../../platform/agentHost/common/taskEventReplay.js';

interface ICachedHistory {
	readonly taskId: string;
	readonly history: IReplayedTaskHistory;
	readonly estimatedBytes: number;
}

interface IPendingHistory extends IDisposable {
	readonly store: DisposableStore;
	readonly source: CancellationTokenSource;
	readonly cached: Promise<{ readonly key: string; readonly value: ICachedHistory } | undefined>;
	readonly promise: Promise<IReplayedTaskHistory | undefined>;
	waiters: number;
	cacheable: boolean;
	completed: boolean;
	accepted: boolean;
	commit?: () => void;
}

/** Shares reads within an authentication lifetime. The owner must clear synchronously when authentication changes. */
export class CloudSandboxHistoryCache extends Disposable {
	private readonly entries = new LinkedMap<string, ICachedHistory>();
	private readonly pending = this._register(new DisposableMap<string, IPendingHistory>());
	private estimatedBytes = 0;

	constructor(
		private readonly maxEntries = 20,
		private readonly maxBytes = 64 * 1024 * 1024,
	) {
		super();
	}

	async load(
		taskId: string,
		token: CancellationToken,
		initialize: (token: CancellationToken) => Promise<{ readonly account: string; readonly fetch: (token: CancellationToken) => Promise<IReplayedTaskHistory | undefined> }>,
		onCachedHistory?: (history: IReplayedTaskHistory) => void,
		canCacheHistory?: (history: IReplayedTaskHistory | undefined) => boolean,
	): Promise<IReplayedTaskHistory | undefined> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		let operation = this.pending.get(taskId);
		if (!operation) {
			const store = new DisposableStore();
			const source = store.add(new CancellationTokenSource());
			const initialized = (async () => {
				// Register ownership before authentication can synchronously invalidate this operation.
				await Promise.resolve();
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				const context = await raceCancellationError(initialize(source.token), source.token);
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				return context;
			})();
			operation = {
				store, source, waiters: 0, cacheable: true, completed: false, accepted: false,
				cached: (async () => {
					const context = await initialized;
					const key = JSON.stringify([context.account, taskId]);
					const value = this.entries.get(key, Touch.AsNew);
					return value ? { key, value } : undefined;
				})(),
				promise: (async () => {
					const context = await initialized;
					if (source.token.isCancellationRequested) {
						throw new CancellationError();
					}
					const history = await raceCancellationError(context.fetch(source.token), source.token);
					const current = this.pending.get(taskId);
					if (source.token.isCancellationRequested || current?.source !== source) {
						throw new CancellationError();
					}
					const key = JSON.stringify([context.account, taskId]);
					current.commit = () => this.cache(key, taskId, history);
					return history;
				})(),
				dispose: () => { source.cancel(); store.dispose(); },
			};
			this.pending.set(taskId, operation);
			const request = operation;
			// Retain ownership through delivery so account changes can cancel resolved but unread results.
			const finish = () => {
				request.completed = true;
			};
			void operation.promise.then(finish, finish);
		}

		const request = operation;
		request.waiters++;
		let released = false;
		const release = () => {
			if (released) {
				return;
			}
			released = true;
			request.waiters--;
			if (request.waiters === 0 && this.pending.get(taskId) === request) {
				if (request.completed) {
					this.pending.deleteAndLeak(taskId);
					try {
						// Every remaining reader must validate its conversation before the shared snapshot replaces the cache.
						if (request.cacheable && request.accepted) {
							request.commit?.();
						}
					} finally {
						request.store.dispose();
					}
				} else {
					this.pending.deleteAndDispose(taskId);
				}
			}
		};
		const cancellation = request.store.add(token.onCancellationRequested(release));
		try {
			const cached = await raceCancellationError(request.cached, token);
			if (token.isCancellationRequested || request.source.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (cached && request.cacheable && this.entries.get(cached.key) === cached.value && onCachedHistory) {
				onCachedHistory(structuredClone(cached.value.history));
			}
			const history = await raceCancellationError(request.promise, token);
			if (token.isCancellationRequested || request.source.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const result = history && structuredClone(history);
			try {
				if (canCacheHistory && !canCacheHistory(result)) {
					request.cacheable = false;
				} else {
					request.accepted = true;
				}
			} catch (error) {
				request.cacheable = false;
				throw error;
			}
			return result;
		} finally {
			request.store.delete(cancellation);
			release();
		}
	}

	/** Live changes invalidate stored data and prevent an older in-flight read from repopulating it. */
	invalidate(taskId: string, cancelPending = false, preserveCached = false): void {
		for (const [key, entry] of [...this.entries]) {
			if (entry.taskId === taskId && !preserveCached) {
				this.entries.delete(key);
				this.estimatedBytes -= entry.estimatedBytes;
			}
		}
		const operation = this.pending.get(taskId);
		if (operation) {
			operation.cacheable = false;
			if (cancelPending) {
				this.pending.deleteAndDispose(taskId);
			}
		}
	}

	clear(): void {
		this.entries.clear();
		this.estimatedBytes = 0;
		this.pending.clearAndDisposeAll();
	}

	private cache(key: string, taskId: string, history: IReplayedTaskHistory | undefined): void {
		if (!history || !history.sessions.length || history.truncated) {
			return;
		}
		const old = this.entries.remove(key);
		this.estimatedBytes -= old?.estimatedBytes ?? 0;
		// Account for the normalized data's UTF-16 JSON size, not the discarded raw event stream.
		const estimatedBytes = JSON.stringify({
			...history,
			sessions: history.sessions.map(session => ({ ...session, chats: [...session.chats] })),
		}).length * 2;
		if (estimatedBytes > this.maxBytes || this.maxEntries <= 0) {
			return;
		}
		this.entries.set(key, { taskId, history: structuredClone(history), estimatedBytes }, Touch.AsNew);
		this.estimatedBytes += estimatedBytes;
		while (this.entries.size > this.maxEntries || this.estimatedBytes > this.maxBytes) {
			this.estimatedBytes -= this.entries.shift()!.estimatedBytes;
		}
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}
