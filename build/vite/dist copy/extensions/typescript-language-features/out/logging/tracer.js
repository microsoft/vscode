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
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../utils/dispose");
class Tracer extends dispose_1.Disposable {
    logger;
    constructor(logger) {
        super();
        this.logger = logger;
    }
    traceRequest(serverId, request, responseExpected, queueLength) {
        if (this.logger.logLevel === vscode.LogLevel.Trace) {
            this.trace(serverId, `Sending request: ${request.command} (${request.seq}). Response expected: ${responseExpected ? 'yes' : 'no'}. Current queue length: ${queueLength}`, request.arguments);
        }
    }
    traceResponse(serverId, response, meta) {
        if (this.logger.logLevel === vscode.LogLevel.Trace) {
            this.trace(serverId, `Response received: ${response.command} (${response.request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms. Success: ${response.success} ${!response.success ? '. Message: ' + response.message : ''}`, response.body);
        }
    }
    traceRequestCompleted(serverId, command, request_seq, meta) {
        if (this.logger.logLevel === vscode.LogLevel.Trace) {
            this.trace(serverId, `Async response received: ${command} (${request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms.`);
        }
    }
    traceEvent(serverId, event) {
        if (this.logger.logLevel === vscode.LogLevel.Trace) {
            this.trace(serverId, `Event received: ${event.event} (${event.seq}).`, event.body);
        }
    }
    trace(serverId, message, data) {
        this.logger.trace(`<${serverId}> ${message}`, ...(data ? [JSON.stringify(data, null, 4)] : []));
    }
}
exports.default = Tracer;
//# sourceMappingURL=tracer.js.map