"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueue = exports.RequestQueueingType = void 0;
var RequestQueueingType;
(function (RequestQueueingType) {
    /**
     * Normal request that is executed in order.
     */
    RequestQueueingType[RequestQueueingType["Normal"] = 1] = "Normal";
    /**
     * Request that normal requests jump in front of in the queue.
     */
    RequestQueueingType[RequestQueueingType["LowPriority"] = 2] = "LowPriority";
    /**
     * A fence that blocks request reordering.
     *
     * Fences are not reordered. Unlike a normal request, a fence will never jump in front of a low priority request
     * in the request queue.
     */
    RequestQueueingType[RequestQueueingType["Fence"] = 3] = "Fence";
})(RequestQueueingType || (exports.RequestQueueingType = RequestQueueingType = {}));
class RequestQueue {
    queue = [];
    sequenceNumber = 0;
    get length() {
        return this.queue.length;
    }
    enqueue(item) {
        if (item.queueingType === RequestQueueingType.Normal) {
            let index = this.queue.length - 1;
            while (index >= 0) {
                if (this.queue[index].queueingType !== RequestQueueingType.LowPriority) {
                    break;
                }
                --index;
            }
            this.queue.splice(index + 1, 0, item);
        }
        else {
            // Only normal priority requests can be reordered. All other requests just go to the end.
            this.queue.push(item);
        }
    }
    dequeue() {
        return this.queue.shift();
    }
    getQueuedCommands(skipLast = false) {
        const result = [];
        const end = skipLast ? this.queue.length - 1 : this.queue.length;
        if (end <= 0) {
            return result;
        }
        for (let i = 0; i < end; i++) {
            const item = this.queue[i];
            result.push(item.request.command);
            if (result.length >= 5) {
                break;
            }
        }
        return result;
    }
    tryDeletePendingRequest(seq) {
        for (let i = 0; i < this.queue.length; i++) {
            if (this.queue[i].request.seq === seq) {
                this.queue.splice(i, 1);
                return true;
            }
        }
        return false;
    }
    createRequest(command, args) {
        return {
            seq: this.sequenceNumber++,
            type: 'request',
            command: command,
            arguments: args
        };
    }
}
exports.RequestQueue = RequestQueue;
//# sourceMappingURL=requestQueue.js.map