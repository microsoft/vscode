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
const vscode = __importStar(require("vscode"));
const cachedResponse_1 = require("../../tsServer/cachedResponse");
const typescriptService_1 = require("../../typescriptService");
suite('CachedResponse', () => {
    test('should cache simple response for same document', async () => {
        const doc = await createTextDocument();
        const response = new cachedResponse_1.CachedResponse();
        assertResult(await response.execute(doc, respondWith('test-0')), 'test-0');
        assertResult(await response.execute(doc, respondWith('test-1')), 'test-0');
    });
    test('should invalidate cache for new document', async () => {
        const doc1 = await createTextDocument();
        const doc2 = await createTextDocument();
        const response = new cachedResponse_1.CachedResponse();
        assertResult(await response.execute(doc1, respondWith('test-0')), 'test-0');
        assertResult(await response.execute(doc1, respondWith('test-1')), 'test-0');
        assertResult(await response.execute(doc2, respondWith('test-2')), 'test-2');
        assertResult(await response.execute(doc2, respondWith('test-3')), 'test-2');
        assertResult(await response.execute(doc1, respondWith('test-4')), 'test-4');
        assertResult(await response.execute(doc1, respondWith('test-5')), 'test-4');
    });
    test('should not cache cancelled responses', async () => {
        const doc = await createTextDocument();
        const response = new cachedResponse_1.CachedResponse();
        const cancelledResponder = createEventualResponder();
        const result1 = response.execute(doc, () => cancelledResponder.promise);
        const result2 = response.execute(doc, respondWith('test-0'));
        const result3 = response.execute(doc, respondWith('test-1'));
        cancelledResponder.resolve(new typescriptService_1.ServerResponse.Cancelled('cancelled'));
        assert.strictEqual((await result1).type, 'cancelled');
        assertResult(await result2, 'test-0');
        assertResult(await result3, 'test-0');
    });
    test('should not care if subsequent requests are cancelled if first request is resolved ok', async () => {
        const doc = await createTextDocument();
        const response = new cachedResponse_1.CachedResponse();
        const cancelledResponder = createEventualResponder();
        const result1 = response.execute(doc, respondWith('test-0'));
        const result2 = response.execute(doc, () => cancelledResponder.promise);
        const result3 = response.execute(doc, respondWith('test-1'));
        cancelledResponder.resolve(new typescriptService_1.ServerResponse.Cancelled('cancelled'));
        assertResult(await result1, 'test-0');
        assertResult(await result2, 'test-0');
        assertResult(await result3, 'test-0');
    });
    test('should not cache cancelled responses with document changes', async () => {
        const doc1 = await createTextDocument();
        const doc2 = await createTextDocument();
        const response = new cachedResponse_1.CachedResponse();
        const cancelledResponder = createEventualResponder();
        const cancelledResponder2 = createEventualResponder();
        const result1 = response.execute(doc1, () => cancelledResponder.promise);
        const result2 = response.execute(doc1, respondWith('test-0'));
        const result3 = response.execute(doc1, respondWith('test-1'));
        const result4 = response.execute(doc2, () => cancelledResponder2.promise);
        const result5 = response.execute(doc2, respondWith('test-2'));
        const result6 = response.execute(doc1, respondWith('test-3'));
        cancelledResponder.resolve(new typescriptService_1.ServerResponse.Cancelled('cancelled'));
        cancelledResponder2.resolve(new typescriptService_1.ServerResponse.Cancelled('cancelled'));
        assert.strictEqual((await result1).type, 'cancelled');
        assertResult(await result2, 'test-0');
        assertResult(await result3, 'test-0');
        assert.strictEqual((await result4).type, 'cancelled');
        assertResult(await result5, 'test-2');
        assertResult(await result6, 'test-3');
    });
});
function respondWith(command) {
    return async () => createResponse(command);
}
function createTextDocument() {
    return vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
}
function assertResult(result, command) {
    if (result.type === 'response') {
        assert.strictEqual(result.command, command);
    }
    else {
        assert.fail('Response failed');
    }
}
function createResponse(command) {
    return {
        type: 'response',
        body: {},
        command: command,
        request_seq: 1,
        success: true,
        seq: 1
    };
}
function createEventualResponder() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve: resolve };
}
//# sourceMappingURL=cachedResponse.test.js.map