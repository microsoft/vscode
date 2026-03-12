/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugLogProvider, IChatDebugResolvedEventContent, IChatDebugService } from './chatDebugService.js';
import { LocalChatSessionUri } from './model/chatUri.js';

/**
 * Per-session circular buffer for debug events.
 * Stores up to `capacity` events using a ring buffer.
 */
class SessionEventBuffer {
	private readonly _buffer: (IChatDebugEvent | undefined)[];
	private _head = 0;
	private _size = 0;

	constructor(readonly capacity: number) {
		this._buffer = new Array(capacity);
	}

	get size(): number {
		return this._size;
	}

	push(event: IChatDebugEvent): void {
		const idx = (this._head + this._size) % this.capacity;
		this._buffer[idx] = event;
		if (this._size < this.capacity) {
			this._size++;
		} else {
			this._head = (this._head + 1) % this.capacity;
		}
	}

	/** Return events in insertion order. */
	toArray(): IChatDebugEvent[] {
		const result: IChatDebugEvent[] = [];
		for (let i = 0; i < this._size; i++) {
			const event = this._buffer[(this._head + i) % this.capacity];
			if (event) {
				result.push(event);
			}
		}
		return result;
	}

	/** Remove events matching the predicate and compact in-place. */
	removeWhere(predicate: (event: IChatDebugEvent) => boolean): void {
		let write = 0;
		for (let i = 0; i < this._size; i++) {
			const idx = (this._head + i) % this.capacity;
			const event = this._buffer[idx];
			if (event && predicate(event)) {
				continue;
			}
			if (write !== i) {
				const writeIdx = (this._head + write) % this.capacity;
				this._buffer[writeIdx] = event;
			}
			write++;
		}
		for (let i = write; i < this._size; i++) {
			this._buffer[(this._head + i) % this.capacity] = undefined;
		}
		this._size = write;
	}

	clear(): void {
		this._buffer.fill(undefined);
		this._head = 0;
		this._size = 0;
	}
}

export class ChatDebugServiceImpl extends Disposable implements IChatDebugService {
	declare readonly _serviceBrand: undefined;

	static readonly MAX_EVENTS_PER_SESSION = 10_000;
	static readonly MAX_SESSIONS = 5;

	/** Per-session event buffers. Ordered from oldest to newest session (LRU). */
	private readonly _sessionBuffers = new ResourceMap<SessionEventBuffer>();
	/** Ordered list of session URIs for LRU eviction. */
	private readonly _sessionOrder: URI[] = [];

	private readonly _onDidAddEvent = this._register(new Emitter<IChatDebugEvent>());
	readonly onDidAddEvent: Event<IChatDebugEvent> = this._onDidAddEvent.event;

	private readonly _onDidClearProviderEvents = this._register(new Emitter<URI>());
	readonly onDidClearProviderEvents: Event<URI> = this._onDidClearProviderEvents.event;

	private readonly _onDidAttachDebugData = this._register(new Emitter<URI>());
	readonly onDidAttachDebugData: Event<URI> = this._onDidAttachDebugData.event;

	private readonly _debugDataAttachedSessions = new ResourceMap<boolean>();

	private readonly _providers = new Set<IChatDebugLogProvider>();
	private readonly _invocationCts = new ResourceMap<CancellationTokenSource>();

	/** Events that were returned by providers (not internally logged). */
	private readonly _providerEvents = new WeakSet<IChatDebugEvent>();

	/** Session URIs created via import, allowed through the invokeProviders guard. */
	private readonly _importedSessions = new ResourceMap<boolean>();

	/** Human-readable titles for imported sessions. */
	private readonly _importedSessionTitles = new ResourceMap<string>();

	activeSessionResource: URI | undefined;

	log(sessionResource: URI, name: string, details?: string, level: ChatDebugLogLevel = ChatDebugLogLevel.Info, options?: { id?: string; category?: string; parentEventId?: string }): void {
		if (!LocalChatSessionUri.isLocalSession(sessionResource)) {
			return;
		}
		this.addEvent({
			kind: 'generic',
			id: options?.id,
			sessionResource,
			created: new Date(),
			name,
			details,
			level,
			category: options?.category,
			parentEventId: options?.parentEventId,
		});
	}

	addEvent(event: IChatDebugEvent): void {
		let buffer = this._sessionBuffers.get(event.sessionResource);
		if (!buffer) {
			// Evict least-recently-used session if we are at the session cap.
			if (this._sessionOrder.length >= ChatDebugServiceImpl.MAX_SESSIONS) {
				const evicted = this._sessionOrder.shift()!;
				this._evictSession(evicted);
			}
			buffer = new SessionEventBuffer(ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION);
			this._sessionBuffers.set(event.sessionResource, buffer);
			this._sessionOrder.push(event.sessionResource);
		} else {
			// Move to end of LRU order so actively-used sessions are not evicted.
			const idx = this._sessionOrder.findIndex(u => extUri.isEqual(u, event.sessionResource));
			if (idx !== -1 && idx !== this._sessionOrder.length - 1) {
				this._sessionOrder.splice(idx, 1);
				this._sessionOrder.push(event.sessionResource);
			}
		}
		buffer.push(event);
		this._onDidAddEvent.fire(event);
	}

	addProviderEvent(event: IChatDebugEvent): void {
		this._providerEvents.add(event);
		this.addEvent(event);
	}

	getEvents(sessionResource?: URI): readonly IChatDebugEvent[] {
		let result: IChatDebugEvent[];
		if (sessionResource) {
			const buffer = this._sessionBuffers.get(sessionResource);
			result = buffer ? buffer.toArray() : [];
		} else {
			result = [];
			for (const buffer of this._sessionBuffers.values()) {
				result.push(...buffer.toArray());
			}
		}
		result.sort((a, b) => a.created.getTime() - b.created.getTime());
		return result;
	}

	getSessionResources(): readonly URI[] {
		return [...this._sessionOrder];
	}

	clear(): void {
		this._sessionBuffers.clear();
		this._sessionOrder.length = 0;
		this._debugDataAttachedSessions.clear();
		this._importedSessions.clear();
		this._importedSessionTitles.clear();
	}

	/** Remove all ancillary state for an evicted session. */
	private _evictSession(sessionResource: URI): void {
		this._sessionBuffers.delete(sessionResource);
		this._importedSessions.delete(sessionResource);
		this._importedSessionTitles.delete(sessionResource);
		this._debugDataAttachedSessions.delete(sessionResource);
		const cts = this._invocationCts.get(sessionResource);
		if (cts) {
			cts.cancel();
			cts.dispose();
			this._invocationCts.delete(sessionResource);
		}
	}

	registerProvider(provider: IChatDebugLogProvider): IDisposable {
		this._providers.add(provider);

		// Invoke the new provider for all sessions that already have active
		// pipelines. This handles the case where invokeProviders() was called
		// before this provider was registered (e.g. extension activated late).
		for (const [sessionResource, cts] of this._invocationCts) {
			if (!cts.token.isCancellationRequested) {
				this._invokeProvider(provider, sessionResource, cts.token).catch(onUnexpectedError);
			}
		}

		return toDisposable(() => {
			this._providers.delete(provider);
		});
	}

	hasInvokedProviders(sessionResource: URI): boolean {
		return this._invocationCts.has(sessionResource);
	}

	async invokeProviders(sessionResource: URI): Promise<void> {

		if (!LocalChatSessionUri.isLocalSession(sessionResource) && !this._importedSessions.has(sessionResource)) {
			return;
		}
		// Cancel only the previous invocation for THIS session, not others.
		// Each session has its own pipeline so events from multiple sessions
		// can be streamed concurrently.
		const existingCts = this._invocationCts.get(sessionResource);
		if (existingCts) {
			existingCts.cancel();
			existingCts.dispose();
		}

		// Clear only provider-sourced events for this session to avoid
		// duplicates when re-invoking (e.g. navigating back to a session).
		// Internally-logged events (e.g. prompt discovery) are preserved.
		this._clearProviderEvents(sessionResource);

		const cts = new CancellationTokenSource();
		this._invocationCts.set(sessionResource, cts);

		try {
			const promises = [...this._providers].map(provider =>
				this._invokeProvider(provider, sessionResource, cts.token)
			);
			await Promise.allSettled(promises);
		} catch (err) {
			onUnexpectedError(err);
		}
		// Note: do NOT dispose the CTS here - the token is used by the
		// extension-side progress pipeline which stays alive for streaming.
		// It will be cancelled+disposed when re-invoking the same session
		// or when the service is disposed.
	}

	private async _invokeProvider(provider: IChatDebugLogProvider, sessionResource: URI, token: CancellationToken): Promise<void> {
		try {
			const events = await provider.provideChatDebugLog(sessionResource, token);
			if (events) {
				// Yield to the event loop periodically so the UI stays
				// responsive when a provider returns a large batch of events
				// (e.g. importing a multi-MB log file).
				const BATCH_SIZE = 500;
				for (let i = 0; i < events.length; i++) {
					if (token.isCancellationRequested) {
						break;
					}
					this.addProviderEvent({
						...events[i],
						sessionResource: events[i].sessionResource ?? sessionResource,
					});
					if (i > 0 && i % BATCH_SIZE === 0) {
						await timeout(0);
					}
				}
			}
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	endSession(sessionResource: URI): void {
		const cts = this._invocationCts.get(sessionResource);
		if (cts) {
			cts.cancel();
			cts.dispose();
			this._invocationCts.delete(sessionResource);
		}
		this._debugDataAttachedSessions.delete(sessionResource);
	}

	private _clearProviderEvents(sessionResource: URI): void {
		const buffer = this._sessionBuffers.get(sessionResource);
		if (buffer) {
			buffer.removeWhere(event => this._providerEvents.has(event));
		}
		this._onDidClearProviderEvents.fire(sessionResource);
	}

	markDebugDataAttached(sessionResource: URI): void {
		if (!this._debugDataAttachedSessions.has(sessionResource)) {
			this._debugDataAttachedSessions.set(sessionResource, true);
			this._onDidAttachDebugData.fire(sessionResource);
		}
	}

	hasAttachedDebugData(sessionResource: URI): boolean {
		return this._debugDataAttachedSessions.has(sessionResource);
	}

	async resolveEvent(eventId: string): Promise<IChatDebugResolvedEventContent | undefined> {
		for (const provider of this._providers) {
			if (provider.resolveChatDebugLogEvent) {
				try {
					const resolved = await provider.resolveChatDebugLogEvent(eventId, CancellationToken.None);
					if (resolved !== undefined) {
						return resolved;
					}
				} catch (err) {
					onUnexpectedError(err);
				}
			}
		}
		return undefined;
	}

	isCoreEvent(event: IChatDebugEvent): boolean {
		return !this._providerEvents.has(event);
	}

	setImportedSessionTitle(sessionResource: URI, title: string): void {
		this._importedSessionTitles.set(sessionResource, title);
	}

	getImportedSessionTitle(sessionResource: URI): string | undefined {
		return this._importedSessionTitles.get(sessionResource);
	}

	async exportLog(sessionResource: URI): Promise<Uint8Array | undefined> {
		for (const provider of this._providers) {
			if (provider.provideChatDebugLogExport) {
				try {
					const data = await provider.provideChatDebugLogExport(sessionResource, CancellationToken.None);
					if (data !== undefined) {
						return data;
					}
				} catch (err) {
					onUnexpectedError(err);
				}
			}
		}
		return undefined;
	}

	async importLog(data: Uint8Array): Promise<URI | undefined> {
		for (const provider of this._providers) {
			if (provider.resolveChatDebugLogImport) {
				try {
					const sessionUri = await provider.resolveChatDebugLogImport(data, CancellationToken.None);
					if (sessionUri !== undefined) {
						this._importedSessions.set(sessionUri, true);
						return sessionUri;
					}
				} catch (err) {
					onUnexpectedError(err);
				}
			}
		}
		return undefined;
	}

	override dispose(): void {
		for (const cts of this._invocationCts.values()) {
			cts.cancel();
			cts.dispose();
		}
		this._invocationCts.clear();
		this.clear();
		this._providers.clear();
		super.dispose();
	}
}
