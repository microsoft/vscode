/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugLogProvider, IChatDebugResolvedEventContent, IChatDebugService } from './chatDebugService.js';

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
	private readonly _invocationCts = new Map<string, CancellationTokenSource>();

	activeSessionId: string | undefined;

	log(sessionId: string, name: string, details?: string, level: ChatDebugLogLevel = ChatDebugLogLevel.Info, options?: { id?: string; category?: string; parentEventId?: string }): void {
		this.addEvent({
			kind: 'generic',
			id: options?.id,
			sessionId,
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

	getEvents(sessionId?: string): readonly IChatDebugEvent[] {
		const result: IChatDebugEvent[] = [];
		for (let i = 0; i < this._size; i++) {
			const event = this._buffer[(this._head + i) % ChatDebugServiceImpl.MAX_EVENTS];
			if (!event) {
				continue;
			}
			if (!sessionId || event.sessionId === sessionId) {
				result.push(event);
			}
		}
		return result;
	}

	getSessionIds(): readonly string[] {
		const ids = new Set<string>();
		for (let i = 0; i < this._size; i++) {
			const event = this._buffer[(this._head + i) % ChatDebugServiceImpl.MAX_EVENTS];
			if (!event) {
				continue;
			}
			if (event.sessionId) {
				ids.add(event.sessionId);
			}
		}
		return [...ids];
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
		for (const [sessionId, cts] of this._invocationCts) {
			if (!cts.token.isCancellationRequested) {
				this._invokeProvider(provider, sessionId, cts.token);
			}
		}

		return toDisposable(() => {
			this._providers.delete(provider);
		});
	}

	async invokeProviders(sessionId: string): Promise<void> {
		// Cancel only the previous invocation for THIS session, not others.
		// Each session has its own pipeline so events from multiple sessions
		// can be streamed concurrently.
		const existingCts = this._invocationCts.get(sessionId);
		if (existingCts) {
			existingCts.cancel();
			existingCts.dispose();
		}

		const cts = new CancellationTokenSource();
		this._invocationCts.set(sessionId, cts);

		try {
			const promises = [...this._providers].map(provider =>
				this._invokeProvider(provider, sessionId, cts.token)
			);
			await Promise.allSettled(promises);
		} catch {
			// best effort
		}
		// Note: do NOT dispose the CTS here - the token is used by the
		// extension-side progress pipeline which stays alive for streaming.
		// It will be cancelled+disposed when re-invoking the same session
		// or when the service is disposed.
	}

	private async _invokeProvider(provider: IChatDebugLogProvider, sessionId: string, token: CancellationToken): Promise<void> {
		try {
			const events = await provider.provideChatDebugLog(sessionId, token);
			if (events) {
				for (const event of events) {
					this.addEvent({
						...event,
						sessionId: event.sessionId ?? sessionId,
					});
				}
			}
		} catch {
			// best effort
		}
	}

	endSession(sessionId: string): void {
		const cts = this._invocationCts.get(sessionId);
		if (cts) {
			cts.cancel();
			cts.dispose();
			this._invocationCts.delete(sessionId);
		}
	}

	async resolveEvent(eventId: string): Promise<IChatDebugResolvedEventContent | undefined> {
		for (const provider of this._providers) {
			if (provider.resolveChatDebugLogEvent) {
				const resolved = await provider.resolveChatDebugLogEvent(eventId, CancellationToken.None);
				if (resolved !== undefined) {
					return resolved;
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
