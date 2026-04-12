/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { extUri } from '../../../../base/common/resources.js';
import { ChatDebugLogLevel } from './chatDebugService.js';
import { LocalChatSessionUri } from './model/chatUri.js';
/**
 * Per-session circular buffer for debug events.
 * Stores up to `capacity` events using a ring buffer.
 */
class SessionEventBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this._head = 0;
        this._size = 0;
        this._buffer = new Array(capacity);
    }
    get size() {
        return this._size;
    }
    push(event) {
        const idx = (this._head + this._size) % this.capacity;
        this._buffer[idx] = event;
        if (this._size < this.capacity) {
            this._size++;
        }
        else {
            this._head = (this._head + 1) % this.capacity;
        }
    }
    /** Return events in insertion order. */
    toArray() {
        const result = [];
        for (let i = 0; i < this._size; i++) {
            const event = this._buffer[(this._head + i) % this.capacity];
            if (event) {
                result.push(event);
            }
        }
        return result;
    }
    /** Remove events matching the predicate and compact in-place. */
    removeWhere(predicate) {
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
    clear() {
        this._buffer.fill(undefined);
        this._head = 0;
        this._size = 0;
    }
}
export class ChatDebugServiceImpl extends Disposable {
    constructor() {
        super(...arguments);
        /** Per-session event buffers. Ordered from oldest to newest session (LRU). */
        this._sessionBuffers = new ResourceMap();
        /** Ordered list of session URIs for LRU eviction. */
        this._sessionOrder = [];
        this._onDidAddEvent = this._register(new Emitter());
        this.onDidAddEvent = this._onDidAddEvent.event;
        this._onDidClearProviderEvents = this._register(new Emitter());
        this.onDidClearProviderEvents = this._onDidClearProviderEvents.event;
        this._onDidAttachDebugData = this._register(new Emitter());
        this.onDidAttachDebugData = this._onDidAttachDebugData.event;
        this._debugDataAttachedSessions = new ResourceMap();
        this._providers = new Set();
        this._invocationCts = new ResourceMap();
        /** Events that were returned by providers (not internally logged). */
        this._providerEvents = new WeakSet();
        /** Session URIs created via import. */
        this._importedSessions = new ResourceMap();
        /** Human-readable titles for imported sessions. */
        this._importedSessionTitles = new ResourceMap();
    }
    static { this.MAX_EVENTS_PER_SESSION = 10_000; }
    static { this.MAX_SESSIONS = 5; }
    /** Schemes eligible for debug logging and provider invocation. */
    static { this._debugEligibleSchemes = new Set([
        LocalChatSessionUri.scheme, // vscode-chat-session (local sessions)
        'copilotcli', // Copilot CLI background sessions
        'claude-code', // Claude Code CLI sessions
    ]); }
    _isDebugEligibleSession(sessionResource) {
        return ChatDebugServiceImpl._debugEligibleSchemes.has(sessionResource.scheme)
            || this._importedSessions.has(sessionResource);
    }
    log(sessionResource, name, details, level = ChatDebugLogLevel.Info, options) {
        if (!this._isDebugEligibleSession(sessionResource)) {
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
    addEvent(event) {
        let buffer = this._sessionBuffers.get(event.sessionResource);
        if (!buffer) {
            // Evict least-recently-used session if we are at the session cap.
            if (this._sessionOrder.length >= ChatDebugServiceImpl.MAX_SESSIONS) {
                const evicted = this._sessionOrder.shift();
                this._evictSession(evicted);
            }
            buffer = new SessionEventBuffer(ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION);
            this._sessionBuffers.set(event.sessionResource, buffer);
            this._sessionOrder.push(event.sessionResource);
        }
        else {
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
    addProviderEvent(event) {
        this._providerEvents.add(event);
        this.addEvent(event);
    }
    getEvents(sessionResource) {
        let result;
        if (sessionResource) {
            const buffer = this._sessionBuffers.get(sessionResource);
            result = buffer ? buffer.toArray() : [];
        }
        else {
            result = [];
            for (const buffer of this._sessionBuffers.values()) {
                result.push(...buffer.toArray());
            }
        }
        result.sort((a, b) => a.created.getTime() - b.created.getTime());
        return result;
    }
    getSessionResources() {
        return [...this._sessionOrder];
    }
    clear() {
        this._sessionBuffers.clear();
        this._sessionOrder.length = 0;
        this._debugDataAttachedSessions.clear();
        this._importedSessions.clear();
        this._importedSessionTitles.clear();
    }
    /** Remove all ancillary state for an evicted session. */
    _evictSession(sessionResource) {
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
    registerProvider(provider) {
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
    hasInvokedProviders(sessionResource) {
        return this._invocationCts.has(sessionResource);
    }
    async invokeProviders(sessionResource) {
        if (!this._isDebugEligibleSession(sessionResource)) {
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
            const promises = [...this._providers].map(provider => this._invokeProvider(provider, sessionResource, cts.token));
            await Promise.allSettled(promises);
        }
        catch (err) {
            onUnexpectedError(err);
        }
        // Note: do NOT dispose the CTS here - the token is used by the
        // extension-side progress pipeline which stays alive for streaming.
        // It will be cancelled+disposed when re-invoking the same session
        // or when the service is disposed.
    }
    async _invokeProvider(provider, sessionResource, token) {
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
        }
        catch (err) {
            onUnexpectedError(err);
        }
    }
    endSession(sessionResource) {
        const cts = this._invocationCts.get(sessionResource);
        if (cts) {
            cts.cancel();
            cts.dispose();
            this._invocationCts.delete(sessionResource);
        }
        this._debugDataAttachedSessions.delete(sessionResource);
    }
    _clearProviderEvents(sessionResource) {
        const buffer = this._sessionBuffers.get(sessionResource);
        if (buffer) {
            buffer.removeWhere(event => this._providerEvents.has(event));
        }
        this._onDidClearProviderEvents.fire(sessionResource);
    }
    markDebugDataAttached(sessionResource) {
        if (!this._debugDataAttachedSessions.has(sessionResource)) {
            this._debugDataAttachedSessions.set(sessionResource, true);
            this._onDidAttachDebugData.fire(sessionResource);
        }
    }
    hasAttachedDebugData(sessionResource) {
        return this._debugDataAttachedSessions.has(sessionResource);
    }
    async resolveEvent(eventId) {
        for (const provider of this._providers) {
            if (provider.resolveChatDebugLogEvent) {
                try {
                    const resolved = await provider.resolveChatDebugLogEvent(eventId, CancellationToken.None);
                    if (resolved !== undefined) {
                        return resolved;
                    }
                }
                catch (err) {
                    onUnexpectedError(err);
                }
            }
        }
        return undefined;
    }
    isCoreEvent(event) {
        return !this._providerEvents.has(event);
    }
    setImportedSessionTitle(sessionResource, title) {
        this._importedSessionTitles.set(sessionResource, title);
    }
    getImportedSessionTitle(sessionResource) {
        return this._importedSessionTitles.get(sessionResource);
    }
    async exportLog(sessionResource) {
        for (const provider of this._providers) {
            if (provider.provideChatDebugLogExport) {
                try {
                    const data = await provider.provideChatDebugLogExport(sessionResource, CancellationToken.None);
                    if (data !== undefined) {
                        return data;
                    }
                }
                catch (err) {
                    onUnexpectedError(err);
                }
            }
        }
        return undefined;
    }
    async importLog(data) {
        for (const provider of this._providers) {
            if (provider.resolveChatDebugLogImport) {
                try {
                    const sessionUri = await provider.resolveChatDebugLogImport(data, CancellationToken.None);
                    if (sessionUri !== undefined) {
                        this._importedSessions.set(sessionUri, true);
                        return sessionUri;
                    }
                }
                catch (err) {
                    onUnexpectedError(err);
                }
            }
        }
        return undefined;
    }
    dispose() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnU2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUU5RCxPQUFPLEVBQUUsaUJBQWlCLEVBQTZGLE1BQU0sdUJBQXVCLENBQUM7QUFDckosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekQ7OztHQUdHO0FBQ0gsTUFBTSxrQkFBa0I7SUFLdkIsWUFBcUIsUUFBZ0I7UUFBaEIsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUg3QixVQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ1YsVUFBSyxHQUFHLENBQUMsQ0FBQztRQUdqQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxJQUFJLElBQUk7UUFDUCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDbkIsQ0FBQztJQUVELElBQUksQ0FBQyxLQUFzQjtRQUMx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