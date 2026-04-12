"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatError = formatError;
exports.runSafe = runSafe;
const vscode_languageserver_1 = require("vscode-languageserver");
function formatError(message, err) {
    if (err instanceof Error) {
        const error = err;
        return `${message}: ${error.message}\n${error.stack}`;
    }
    else if (typeof err === 'string') {
        return `${message}: ${err}`;
    }
    else if (err) {
        return `${message}: ${err.toString()}`;
    }
    return message;
}
function runSafe(runtime, func, errorVal, errorMessage, token) {
    return new Promise((resolve) => {
        runtime.timer.setImmediate(() => {
            if (token.isCancellationRequested) {
                resolve(cancelValue());
                return;
            }
            return func().then(result => {
                if (token.isCancellationRequested) {
                    resolve(cancelValue());
                    return;
                }
                else {
                    resolve(result);
                }
            }, e => {
                console.error(formatError(errorMessage, e));
                resolve(errorVal);
            });
        });
    });
}
function cancelValue() {
    return new vscode_languageserver_1.ResponseError(vscode_languageserver_1.LSPErrorCodes.RequestCancelled, 'Request cancelled');
}
//# sourceMappingURL=runner.js.map