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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
require("mocha");
const stream = __importStar(require("stream"));
const logger_1 = require("../../logging/logger");
const tracer_1 = __importDefault(require("../../logging/tracer"));
const cancellation_electron_1 = require("../../tsServer/cancellation.electron");
const server_1 = require("../../tsServer/server");
const typescriptService_1 = require("../../typescriptService");
const cancellation_1 = require("../../utils/cancellation");
const NoopTelemetryReporter = new class {
    logTelemetry() { }
    logTraceEvent() { }
    dispose() { }
};
class FakeServerProcess {
    _out;
    writeListeners = new Set();
    stdout;
    constructor() {
        this._out = new stream.PassThrough();
        this.stdout = this._out;
    }
    write(data) {
        const listeners = Array.from(this.writeListeners);
        this.writeListeners.clear();
        setImmediate(() => {
            for (const listener of listeners) {
                listener(Buffer.from(JSON.stringify(data), 'utf8'));
            }
            const body = Buffer.from(JSON.stringify({ 'seq': data.seq, 'type': 'response', 'command': data.command, 'request_seq': data.seq, 'success': true }), 'utf8');
            this._out.write(Buffer.from(`Content-Length: ${body.length}\r\n\r\n${body}`, 'utf8'));
        });
    }
    onData(_handler) { }
    onError(_handler) { }
    onExit(_handler) { }
    kill() { }
    onWrite() {
        return new Promise((resolve) => {
            this.writeListeners.add((data) => {
                resolve(JSON.parse(data.toString()));
            });
        });
    }
}
suite.skip('Server', () => {
    const tracer = new tracer_1.default(new logger_1.Logger());
    test('should send requests with increasing sequence numbers', async () => {
        const process = new FakeServerProcess();
        const server = new server_1.SingleTsServer('semantic', typescriptService_1.ServerType.Semantic, process, undefined, new cancellation_electron_1.NodeRequestCanceller('semantic', tracer), undefined, NoopTelemetryReporter, tracer);
        const onWrite1 = process.onWrite();
        server.executeImpl('geterr', {}, { isAsync: false, token: cancellation_1.nulToken, expectsResult: true });
        assert.strictEqual((await onWrite1).seq, 0);
        const onWrite2 = process.onWrite();
        server.executeImpl('geterr', {}, { isAsync: false, token: cancellation_1.nulToken, expectsResult: true });
        assert.strictEqual((await onWrite2).seq, 1);
    });
});
//# sourceMappingURL=server.test.js.map