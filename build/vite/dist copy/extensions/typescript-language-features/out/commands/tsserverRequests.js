"use strict";
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
exports.TSServerRequestCommand = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const cancellation_1 = require("../utils/cancellation");
function isCancellationToken(value) {
    return value && typeof value.isCancellationRequested === 'boolean' && typeof value.onCancellationRequested === 'function';
}
class TSServerRequestCommand {
    lazyClientHost;
    id = 'typescript.tsserverRequest';
    constructor(lazyClientHost) {
        this.lazyClientHost = lazyClientHost;
    }
    async execute(command, args, config, token) {
        if (!isCancellationToken(token)) {
            token = cancellation_1.nulToken;
        }
        if (args && typeof args === 'object' && !Array.isArray(args)) {
            const requestArgs = args;
            const hasFile = requestArgs.file instanceof vscode.Uri;
            const hasTraceId = typeof requestArgs.$traceId === 'string';
            if (hasFile || hasTraceId) {
                const newArgs = { file: undefined, ...args };
                if (hasFile) {
                    const client = this.lazyClientHost.value.serviceClient;
                    newArgs.file = client.toOpenTsFilePath(requestArgs.file);
                }
                if (hasTraceId) {
                    const telemetryReporter = this.lazyClientHost.value.serviceClient.telemetryReporter;
                    telemetryReporter.logTraceEvent('TSServerRequestCommand.execute', requestArgs.$traceId, JSON.stringify({ command }));
                }
                args = newArgs;
            }
        }
        // The list can be found in the TypeScript compiler as `const enum CommandTypes`,
        // to avoid extensions making calls which could affect the internal tsserver state
        // these are only read-y sorts of commands
        const allowList = [
            // Seeing the JS/DTS output for a file
            'emit-output',
            // Grabbing a file's diagnostics
            'semanticDiagnosticsSync',
            'syntacticDiagnosticsSync',
            'suggestionDiagnosticsSync',
            // Introspecting code at a position
            'quickinfo',
            'quickinfo-full',
            'completionInfo'
        ];
        if (allowList.includes(command) || command.startsWith('_')) {
            return this.lazyClientHost.value.serviceClient.execute(command, args, token, config);
        }
        return undefined;
    }
}
exports.TSServerRequestCommand = TSServerRequestCommand;
//# sourceMappingURL=tsserverRequests.js.map