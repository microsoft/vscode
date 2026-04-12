"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
require("mocha");
const requestQueue_1 = require("../../tsServer/requestQueue");
suite('RequestQueue', () => {
    test('should be empty on creation', async () => {
        const queue = new requestQueue_1.RequestQueue();
        assert.strictEqual(queue.length, 0);
        assert.strictEqual(queue.dequeue(), undefined);
    });
    suite('RequestQueue.createRequest', () => {
        test('should create items with increasing sequence numbers', async () => {
            const queue = new requestQueue_1.RequestQueue();
            for (let i = 0; i < 100; ++i) {
                const command = `command-${i}`;
                const request = queue.createRequest(command, i);
                assert.strictEqual(request.seq, i);
                assert.strictEqual(request.command, command);
                assert.strictEqual(request.arguments, i);
            }
        });
    });
    test('should queue normal requests in first in first out order', async () => {
        const queue = new requestQueue_1.RequestQueue();
        assert.strictEqual(queue.length, 0);
        const request1 = queue.createRequest('a', 1);
        queue.enqueue({ request: request1, expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Normal });
        assert.strictEqual(queue.length, 1);
        const request2 = queue.createRequest('b', 2);
        queue.enqueue({ request: request2, expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Normal });
        assert.strictEqual(queue.length, 2);
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 1);
            assert.strictEqual(item.request.command, 'a');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 0);
            assert.strictEqual(item.request.command, 'b');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(item, undefined);
            assert.strictEqual(queue.length, 0);
        }
    });
    test('should put normal requests in front of low priority requests', async () => {
        const queue = new requestQueue_1.RequestQueue();
        assert.strictEqual(queue.length, 0);
        queue.enqueue({ request: queue.createRequest('low-1', 1), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.LowPriority });
        queue.enqueue({ request: queue.createRequest('low-2', 1), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.LowPriority });
        queue.enqueue({ request: queue.createRequest('normal-1', 2), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Normal });
        queue.enqueue({ request: queue.createRequest('normal-2', 2), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Normal });
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 3);
            assert.strictEqual(item.request.command, 'normal-1');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 2);
            assert.strictEqual(item.request.command, 'normal-2');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 1);
            assert.strictEqual(item.request.command, 'low-1');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 0);
            assert.strictEqual(item.request.command, 'low-2');
        }
    });
    test('should not push fence requests front of low priority requests', async () => {
        const queue = new requestQueue_1.RequestQueue();
        assert.strictEqual(queue.length, 0);
        queue.enqueue({ request: queue.createRequest('low-1', 0), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.LowPriority });
        queue.enqueue({ request: queue.createRequest('fence', 0), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Fence });
        queue.enqueue({ request: queue.createRequest('low-2', 0), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.LowPriority });
        queue.enqueue({ request: queue.createRequest('normal', 0), expectsResponse: true, isAsync: false, queueingType: requestQueue_1.RequestQueueingType.Normal });
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 3);
            assert.strictEqual(item.request.command, 'low-1');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 2);
            assert.strictEqual(item.request.command, 'fence');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 1);
            assert.strictEqual(item.request.command, 'normal');
        }
        {
            const item = queue.dequeue();
            assert.strictEqual(queue.length, 0);
            assert.strictEqual(item.request.command, 'low-2');
        }
    });
});
//# sourceMappingURL=requestQueue.test.js.map