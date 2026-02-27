/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugLogProvider, IChatDebugResolvedEventContent, IChatDebugService } from './chatDebugService.js';
import { LocalChatSessionUri } from './model/chatUri.js';

export class ChatDebugServiceImpl extends Disposable implements IChatDebugService {
	declare readonly _serviceBrand: undefined;

	private static readonly MAX_EVENTS = 10_000;

	// Circular buffer: fixed-size array with head/size tracking for O(1) append.
	private readonly _buffer: (IChatDebugEvent | undefined)[] = new Array(ChatDebugServiceImpl.MAX_EVENTS);
	private _head = 0;  // index of the oldest element
	private _size = 0;  // number of elements currently stored

	private readonly _onDidAddEvent = this._register(new Emitter<IChatDebugEvent>());
	readonly onDidAddEvent: Event<IChatDebugEvent> = this._onDidAddEvent.event;

	private readonly _providers = new Set<IChatDebugLogProvider>();
	private readonly _invocationCts = new ResourceMap<CancellationTokenSource>();

	/** Events that were returned by providers (not internally logged). */
	private readonly _providerEvents = new WeakSet<IChatDebugEvent>();

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
		const idx = (this._head + this._size) % ChatDebugServiceImpl.MAX_EVENTS;
		this._buffer[idx] = event;
		if (this._size < ChatDebugServiceImpl.MAX_EVENTS) {
			this._size++;
		} else {
			this._head = (this._head + 1) % ChatDebugServiceImpl.MAX_EVENTS;
		}
		this._onDidAddEvent.fire(event);
	}

	addProviderEvent(event: IChatDebugEvent): void {
		this._providerEvents.add(event);
		this.addEvent(event);
	}

	getEvents(sessionResource?: URI): readonly IChatDebugEvent[] {
		const result: IChatDebugEvent[] = [];
		const key = sessionResource?.toString();
		for (let i = 0; i < this._size; i++) {
			const event = this._buffer[(this._head + i) % ChatDebugServiceImpl.MAX_EVENTS];
			if (!event) {
				continue;
			}
			if (!key || event.sessionResource.toString() === key) {
				result.push(event);
			}
		}
		result.sort((a, b) => a.created.getTime() - b.created.getTime());
		return result;
	}

	getSessionResources(): readonly URI[] {
		const seen = new ResourceMap<boolean>();
		const result: URI[] = [];
		for (let i = 0; i < this._size; i++) {
			const event = this._buffer[(this._head + i) % ChatDebugServiceImpl.MAX_EVENTS];
			if (!event) {
				continue;
			}
			if (!seen.has(event.sessionResource)) {
				seen.set(event.sessionResource, true);
				result.push(event.sessionResource);
			}
		}
		return result;
	}

	clear(): void {
		this._buffer.fill(undefined);
		this._head = 0;
		this._size = 0;
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

	async invokeProviders(sessionResource: URI): Promise<void> {
		if (!LocalChatSessionUri.isLocalSession(sessionResource)) {
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
				for (const event of events) {
					this.addProviderEvent({
						...event,
						sessionResource: event.sessionResource ?? sessionResource,
					});
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
	}

	private _clearProviderEvents(sessionResource: URI): void {
		const key = sessionResource.toString();
		// Compact the ring buffer in-place, removing matching provider events.
		let write = 0;
		for (let i = 0; i < this._size; i++) {
			const idx = (this._head + i) % ChatDebugServiceImpl.MAX_EVENTS;
			const event = this._buffer[idx];
			if (event && this._providerEvents.has(event) && event.sessionResource.toString() === key) {
				continue; // skip — this event is removed
			}
			if (write !== i) {
				const writeIdx = (this._head + write) % ChatDebugServiceImpl.MAX_EVENTS;
				this._buffer[writeIdx] = event;
			}
			write++;
		}
		// Clear trailing slots and update size
		for (let i = write; i < this._size; i++) {
			this._buffer[(this._head + i) % ChatDebugServiceImpl.MAX_EVENTS] = undefined;
		}
		this._size = write;
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

	override dispose(): void {
		for (const cts of this._invocationCts.values()) {
			cts.cancel();
			cts.dispose();
		}
		this._invocationCts.clear();
		super.dispose();
	}
}
