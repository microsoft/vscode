/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
/**
 * Abstract implementation of the low level API for a debug adapter.
 * Missing is how this API communicates with the debug adapter.
 */
export class AbstractDebugAdapter {
    constructor() {
        this.pendingRequests = new Map();
        this.queue = [];
        this._onError = new Emitter();
        this._onExit = new Emitter();
        this.sequence = 1;
    }
    get onError() {
        return this._onError.event;
    }
    get onExit() {
        return this._onExit.event;
    }
    onMessage(callback) {
        if (this.messageCallback) {
            this._onError.fire(new Error(`attempt to set more than one 'Message' callback`));
        }
        this.messageCallback = callback;
    }
    onEvent(callback) {
        if (this.eventCallback) {
            this._onError.fire(new Error(`attempt to set more than one 'Event' callback`));
        }
        this.eventCallback = callback;
    }
    onRequest(callback) {
        if (this.requestCallback) {
            this._onError.fire(new Error(`attempt to set more than one 'Request' callback`));
        }
        this.requestCallback = callback;
    }
    sendResponse(response) {
        if (response.seq > 0) {
            this._onError.fire(new Error(`attempt to send more than one response for command ${response.command}`));
        }
        else {
            this.internalSend('response', response);
        }
    }
    sendRequest(command, args, clb, timeout) {
        const request = {
            command: command
        };
        if (args && Object.keys(args).length > 0) {
            request.arguments = args;
        }
        this.internalSend('request', request);
        if (typeof timeout === 'number') {
            const timer = setTimeout(() => {
                clearTimeout(timer);
                const clb = this.pendingRequests.get(request.seq);
                if (clb) {
                    this.pendingRequests.delete(request.seq);
                    const err = {
                        type: 'response',
                        seq: 0,
                        request_seq: request.seq,
                        success: false,
                        command,
                        message: localize('timeout', "Timeout after {0} ms for '{1}'", timeout, command)
                    };
                    clb(err);
                }
            }, timeout);
        }
        if (clb) {
            // store callback for this request
            this.pendingRequests.set(request.seq, clb);
        }
        return request.seq;
    }
    acceptMessage(message) {
        if (this.messageCallback) {
            this.messageCallback(message);
        }
        else {
            this.queue.push(message);
            if (this.queue.length === 1) {
                // first item = need to start processing loop
                this.processQueue();
            }
        }
    }
    /**
     * Returns whether we should insert a timeout between processing messageA
     * and messageB. Artificially queueing protocol messages guarantees that any
     * microtasks for previous message finish before next message is processed.
     * This is essential ordering when using promises anywhere along the call path.
     *
     * For example, take the following, where `chooseAndSendGreeting` returns
     * a person name and then emits a greeting event:
     *
     * ```
     * let person: string;
     * adapter.onGreeting(() => console.log('hello', person));
     * person = await adapter.chooseAndSendGreeting();
     * ```
     *
     * Because the event is dispatched synchronously, it may fire before person
     * is assigned if they're processed in the same task. Inserting a task
     * boundary avoids this issue.
     */
    needsTaskBoundaryBetween(messageA, messageB) {
        return messageA.type !== 'event' || messageB.type !== 'event';
    }
    /**
     * Reads and dispatches items from the queue until it is empty.
     */
    async processQueue() {
        let message;
        while (this.queue.length) {
            if (!message || this.needsTaskBoundaryBetween(this.queue[0], message)) {
                await timeout(0);
            }
            message = this.queue.shift();
            if (!message) {
                return; // may have been disposed of
            }
            switch (message.type) {
                case 'event':
                    this.eventCallback?.(message);
                    break;
                case 'request':
                    this.requestCallback?.(message);
                    break;
                case 'response': {
                    const response = message;
                    const clb = this.pendingRequests.get(response.request_seq);
                    if (clb) {
                        this.pendingRequests.delete(response.request_seq);
                        clb(response);
                    }
                    break;
                }
            }
        }
    }
    internalSend(typ, message) {
        message.type = typ;
        message.seq = this.sequence++;
        this.sendMessage(message);
    }
    async cancelPendingRequests() {
        if (this.pendingRequests.size === 0) {
            return Promise.resolve();
        }
        const pending = new Map();
        this.pendingRequests.forEach((value, key) => pending.set(key, value));
        await timeout(500);
        pending.forEach((callback, request_seq) => {
            const err = {
                type: 'response',
                seq: 0,
                request_seq,
                success: false,
                command: 'canceled',
                message: 'canceled'
            };
            callback(err);
            this.pendingRequests.delete(request_seq);
        });
    }
    getPendingRequestIds() {
        return Array.from(this.pendingRequests.keys());
    }
    dispose() {
        this._onError.dispose();
        this._onExit.dispose();
        this.queue = [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3REZWJ1Z0FkYXB0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vYWJzdHJhY3REZWJ1Z0FkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUM7OztHQUdHO0FBQ0gsTUFBTSxPQUFnQixvQkFBb0I7SUFVekM7UUFSUSxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUErQyxDQUFDO1FBSXpFLFVBQUssR0FBb0MsRUFBRSxDQUFDO1FBQ2pDLGFBQVEsR0FBRyxJQUFJLE9BQU8sRUFBUyxDQUFDO1FBQ2hDLFlBQU8sR0FBRyxJQUFJLE9BQU8sRUFBaUIsQ0FBQztRQUd6RCxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBUUQsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztJQUM1QixDQUFDO0lBRUQsSUFBSSxNQUFNO1FBQ1QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUMzQixDQUFDO0lBRUQsU0FBUyxDQUFDLFFBQTBEO1FBQ25FLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUMsQ0FBQztRQUNsRixDQUFDO1FBQ0QsSUFBSSxDQUFDLGVBQWUsR0FBRyxRQUFRLENBQUM7SUFDakMsQ0FBQztJQUVELE9BQU8sQ0FBQyxR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