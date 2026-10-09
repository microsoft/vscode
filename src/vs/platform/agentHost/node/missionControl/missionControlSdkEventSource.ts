/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Limiter, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgent, IAgentChatSessionEvent } from '../../common/agent.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { parseChatUri } from '../../common/state/sessionState.js';
import { createAgentChatContext } from '../agentChatContext.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { MissionControlSessionMirror } from './missionControlSessionMirror.js';

const reservationSize = 1024;
const maxQueuedEvents = 256;
const maxQueueBytes = 2 * 1024 * 1024;
const maxSourceBytes = 32 * 1024 * 1024;
const maxHistoryEvents = 10_000;

interface SourceSession {
	readonly session: string;
	readonly chat: string;
	readonly provider: IAgent;
	readonly queue: { readonly event: IAgentChatSessionEvent; readonly bytes: number }[];
	readonly seen: Set<string>;
	bytes: number;
	limit: number | undefined;
	historyPending: boolean;
	draining: Promise<void> | undefined;
	dropped: number;
	title: string | undefined;
	failed: boolean;
	dirty: boolean;
	journalCursor: string | undefined;
	admittedCursor: string | undefined;
	pendingCursor: string | undefined;
}

/** Owns optional native metadata replication; provider work and durable writes never gate local AHP dispatch. */
export class MissionControlSdkEventSource extends Disposable {
	private readonly _sessions = new Map<string, SourceSession>();
	private readonly _cancellation = this._register(new CancellationTokenSource());
	private readonly _work = this._register(new Limiter<void>(4));
	private _bytes = 0;
	private readonly _retry = this._register(new RunOnceScheduler(() => {
		for (const source of this._sessions.values()) {
			if (source.failed) {
				source.failed = false;
				this._drain(source);
			}
		}
	}, 5000));

	constructor(
		private readonly _environmentId: string,
		private readonly _mirror: MissionControlSessionMirror,
		private readonly _isEnabled: () => boolean,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService private readonly _sessionData: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._mirror.setSdkAcknowledgementHandler((session, journalEventId) => {
			const source = this._sessions.get(session);
			if (source && !this._store.isDisposed) {
				source.pendingCursor = journalEventId;
				source.dirty = true;
				this._drain(source);
			}
		}));
		this._register(toDisposable(() => {
			this._cancellation.cancel();
			this._sessions.clear();
			this._bytes = 0;
		}));
		const attach = (provider: IAgent) => {
			if (provider.onDidChatSessionEvent) {
				this._register(provider.onDidChatSessionEvent(event => this._accept(provider, event)));
			}
		};
		this._register(this._providers.onDidRegisterProvider(attach));
		for (const provider of this._providers.getProviders()) {
			attach(provider);
		}
		for (const session of this._stateManager.getSessionUris()) {
			this.observeSession(session);
		}
	}

	observeSession(session: string): void {
		if (!this._isEnabled() || this._store.isDisposed || this._stateManager.isIdleProvisionalSession(session)) {
			return;
		}
		const summary = this._stateManager.getSessionSummary(session);
		const chat = summary?.defaultChat;
		const provider = this._providers.getProviderForSession(session);
		if (!summary || !chat || !provider?.onDidChatSessionEvent) {
			return;
		}
		let source = this._sessions.get(session);
		if (!source) {
			this._mirror.registerSession(session);
			source = {
				session, chat, provider, queue: [], seen: new Set(), bytes: 0, limit: undefined,
				historyPending: true, draining: undefined, dropped: 0, title: undefined, failed: false, dirty: false,
				journalCursor: undefined, admittedCursor: undefined, pendingCursor: undefined,
			};
			this._sessions.set(session, source);
		}
		source.dirty = true;
		this._drain(source);
	}

	private _accept(provider: IAgent, event: IAgentChatSessionEvent): void {
		const session = parseChatUri(event.chat.toString())?.session;
		if (!session) {
			return;
		}
		if (!this._isEnabled()) {
			const source = this._sessions.get(session);
			if (source) {
				source.historyPending = true;
				source.title = undefined;
			}
			return;
		}
		this.observeSession(session);
		const source = this._sessions.get(session);
		if (!source || source.provider !== provider || source.chat !== event.chat.toString()) {
			return;
		}
		try {
			const json = JSON.stringify(event.data);
			const bytes = Buffer.byteLength(json);
			if (source.queue.length >= maxQueuedEvents || source.bytes + bytes > maxQueueBytes || this._bytes + bytes > maxSourceBytes) {
				source.dropped++;
				this._drain(source);
				return;
			}
			source.queue.push({ event: { ...event, data: JSON.parse(json) }, bytes });
			source.bytes += bytes;
			this._bytes += bytes;
			this._drain(source);
		} catch {
			this._logService.error('[MissionControlSdkEventSource] Native metadata could not be serialized', { session });
			source.dropped++;
		}
	}

	private _drain(source: SourceSession): void {
		if (source.draining || source.failed) {
			return;
		}
		const operation = this._work.queue(() => this._run(source)).catch(error => {
			if (!this._cancellation.token.isCancellationRequested) {
				source.failed = true;
				this._logService.error('[MissionControlSdkEventSource] Metadata replication paused; native session remains available', { session: source.session }, error);
				if (!this._retry.isScheduled()) {
					this._retry.schedule();
				}
			}
		}).finally(() => {
			source.draining = undefined;
			if (this._isEnabled() && !this._store.isDisposed && (source.dirty || source.queue.length || source.dropped)) {
				this._drain(source);
			}
		});
		source.draining = operation;
	}

	private async _reserve(source: SourceSession): Promise<void> {
		if (source.limit !== undefined && (this._mirror.getSdkNextSequence(source.session) ?? source.limit) + 2 < source.limit) {
			return;
		}
		if (!this._isEnabled() || this._store.isDisposed) {
			return;
		}
		const database = this._sessionData.openDatabase(URI.parse(source.session));
		try {
			const key = `missionControl.sdkSequence.${this._environmentId}`;
			const stored = await database.object.getMetadata(key);
			if (source.limit === undefined) {
				source.journalCursor = await database.object.getMetadata(`missionControl.sdkJournalCursor.${this._environmentId}`);
			}
			const first = source.limit ?? (stored === undefined ? 0 : Number(stored));
			const limit = first + reservationSize;
			if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(limit)) {
				throw new Error('Invalid persisted Mission Control SDK sequence');
			}
			if (!this._isEnabled() || this._store.isDisposed) {
				return;
			}
			await database.object.setMetadata(key, String(limit));
			if (this._store.isDisposed || !this._isEnabled()) {
				return;
			}
			this._mirror.reserveSdkSequences(source.session, first, limit);
			source.limit = limit;
		} finally {
			database.dispose();
		}
	}

	private async _publish(source: SourceSession, event: IAgentChatSessionEvent, replay = false): Promise<boolean> {
		if (source.seen.has(event.id)) {
			return true;
		}
		await this._reserve(source);
		const payload = { type: event.type, data: event.data };
		if (replay && this._isEnabled() && !this._store.isDisposed) {
			await this._mirror.waitForSdkCapacity(source.session, payload, event.timestamp, this._cancellation.token);
			await this._reserve(source);
		}
		if (!this._isEnabled() || this._store.isDisposed) {
			return false;
		}
		if (source.seen.size >= maxQueuedEvents * 2) {
			source.seen.delete(source.seen.values().next().value!);
		}
		source.seen.add(event.id);
		this._mirror.enqueueSdk(source.session, payload, event.timestamp, event.persisted ? event.id : undefined);
		if (event.persisted) {
			source.admittedCursor = event.id;
		}
		return true;
	}

	private async _persistCursor(source: SourceSession): Promise<void> {
		const cursor = source.pendingCursor;
		if (!cursor) {
			return;
		}
		const database = this._sessionData.openDatabase(URI.parse(source.session));
		try {
			await database.object.setMetadata(`missionControl.sdkJournalCursor.${this._environmentId}`, cursor);
			source.journalCursor = cursor;
			if (source.pendingCursor === cursor) {
				source.pendingCursor = undefined;
			}
		} finally {
			database.dispose();
		}
	}

	private async _replayHistory(source: SourceSession): Promise<void> {
		if (!source.provider.readChatSessionEvents) {
			return;
		}
		const chat = URI.parse(source.chat);
		const context = createAgentChatContext(this._stateManager, source.session, source.chat);
		const cursor = source.admittedCursor ?? source.journalCursor;
		const overlap = new Set<string>();
		const iterator = source.provider.readChatSessionEvents(chat, context, this._cancellation.token, cursor, id => {
			if (cursor === undefined && source.queue.some(item => item.event.id === id)) {
				overlap.add(id);
			}
		})[Symbol.asyncIterator]();
		let foundCursor = cursor === undefined;
		let count = 0;
		try {
			while (this._isEnabled() && !this._store.isDisposed) {
				let next: IteratorResult<IAgentChatSessionEvent>;
				try {
					next = await iterator.next();
				} catch (error) {
					if (!this._cancellation.token.isCancellationRequested) {
						this._logService.error('[MissionControlSdkEventSource] Historical metadata reconciliation is incomplete; continuing live replication', { session: source.session }, error);
					}
					return;
				}
				if (next.done) {
					if (cursor === undefined) {
						for (let index = source.queue.length - 1; index >= 0; index--) {
							const item = source.queue[index];
							if (overlap.has(item.event.id)) {
								source.queue.splice(index, 1);
								source.bytes -= item.bytes;
								this._bytes -= item.bytes;
							}
						}
					}
					if (!foundCursor) {
						this._logService.warn('[MissionControlSdkEventSource] Native metadata journal no longer contains its replay cursor; waiting for fresh runtime events', { session: source.session });
					}
					return;
				}
				const event = next.value;
				if (event.chat.toString() !== source.chat) {
					throw new Error('Native metadata history belongs to another chat');
				}
				if (!foundCursor) {
					if (event.id === cursor) {
						foundCursor = true;
						source.seen.add(event.id);
					}
					continue;
				}
				if (++count % maxHistoryEvents === 0) {
					await timeout(0, this._cancellation.token);
				}
				if (!await this._publish(source, event, true)) {
					source.historyPending = true;
					return;
				}
			}
			source.historyPending = true;
		} catch (error) {
			source.historyPending = true;
			throw error;
		} finally {
			await iterator.return?.();
		}
	}

	private async _run(source: SourceSession): Promise<void> {
		source.dirty = false;
		if (!this._isEnabled() || this._store.isDisposed) {
			return;
		}
		await this._reserve(source);
		if (!this._isEnabled() || this._store.isDisposed) {
			return;
		}
		await this._persistCursor(source);
		if (source.historyPending) {
			source.historyPending = false;
			await this._replayHistory(source);
		}
		while (source.queue.length && this._isEnabled() && !this._store.isDisposed) {
			const item = source.queue.shift()!;
			source.bytes -= item.bytes;
			this._bytes -= item.bytes;
			try {
				if (!await this._publish(source, item.event)) {
					source.queue.unshift(item);
					source.bytes += item.bytes;
					this._bytes += item.bytes;
					break;
				}
			} catch (error) {
				source.queue.unshift(item);
				source.bytes += item.bytes;
				this._bytes += item.bytes;
				throw error;
			}
		}
		if (!this._isEnabled() || this._store.isDisposed) {
			return;
		}
		if (source.dropped) {
			await this._reserve(source);
			if (!this._isEnabled() || this._store.isDisposed) {
				return;
			}
			this._mirror.reportSdkSourceLag(source.session, source.dropped);
			source.dropped = 0;
		}
		const title = this._stateManager.getSessionSummary(source.session)?.title;
		if (title && title !== source.title && source.provider.synchronizeChatSessionTitle) {
			try {
				if (await source.provider.synchronizeChatSessionTitle(URI.parse(source.chat), title)) {
					source.title = title;
				}
			} catch (error) {
				this._logService.error('[MissionControlSdkEventSource] Native title synchronization failed; continuing metadata replication', { session: source.session }, error);
			}
		}
	}

	async whenIdle(): Promise<void> {
		while ([...this._sessions.values()].some(source => source.draining)) {
			await Promise.all([...this._sessions.values()].map(source => source.draining));
		}
	}
}
