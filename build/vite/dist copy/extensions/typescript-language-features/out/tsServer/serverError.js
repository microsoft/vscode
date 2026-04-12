"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptServerError = void 0;
class TypeScriptServerError extends Error {
    serverId;
    version;
    response;
    serverMessage;
    serverStack;
    sanitizedStack;
    static create(serverId, version, response) {
        const parsedResult = TypeScriptServerError.parseErrorText(response);
        return new TypeScriptServerError(serverId, version, response, parsedResult?.message, parsedResult?.stack, parsedResult?.sanitizedStack);
    }
    constructor(serverId, version, response, serverMessage, serverStack, sanitizedStack) {
        super([
            `<${serverId}> TypeScript Server Error (${version.displayName})`,
            serverMessage,
            serverStack
        ].filter(Boolean).join('\n'));
        this.serverId = serverId;
        this.version = version;
        this.response = response;
        this.serverMessage = serverMessage;
        this.serverStack = serverStack;
        this.sanitizedStack = sanitizedStack;
    }
    get serverErrorText() { return this.response.message; }
    get serverCommand() { return this.response.command; }
    get telemetry() {
        // The "sanitizedstack" has been purged of error messages, paths, and file names (other than tsserver)
        // and, thus, can be classified as SystemMetaData, rather than CallstackOrException.
        /* __GDPR__FRAGMENT__
            "TypeScriptRequestErrorProperties" : {
                "command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "serverid" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                "sanitizedstack" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                "badclient" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
            }
        */
        return {
            command: this.serverCommand,
            serverid: this.serverId,
            sanitizedstack: this.sanitizedStack || '',
            badclient: /\bBADCLIENT\b/.test(this.stack || ''),
        };
    }
    /**
     * Given a `errorText` from a tsserver request indicating failure in handling a request,
     * prepares a payload for telemetry-logging.
     */
    static parseErrorText(response) {
        const errorText = response.message;
        if (errorText) {
            const errorPrefix = 'Error processing request. ';
            if (errorText.startsWith(errorPrefix)) {
                const prefixFreeErrorText = errorText.substr(errorPrefix.length);
                const newlineIndex = prefixFreeErrorText.indexOf('\n');
                if (newlineIndex >= 0) {
                    // Newline expected between message and stack.
                    const stack = prefixFreeErrorText.substring(newlineIndex + 1);
                    return {
                        message: prefixFreeErrorText.substring(0, newlineIndex),
                        stack,
                        sanitizedStack: TypeScriptServerError.sanitizeStack(stack)
                    };
                }
            }
        }
        return undefined;
    }
    /**
     * Drop everything but ".js" and line/column numbers (though retain "tsserver" if that's the filename).
     */
    static sanitizeStack(message) {
        if (!message) {
            return '';
        }
        const regex = /(\btsserver)?(\.(?:ts|tsx|js|jsx)(?::\d+(?::\d+)?)?)\)?$/igm;
        let serverStack = '';
        while (true) {
            const match = regex.exec(message);
            if (!match) {
                break;
            }
            // [1] is 'tsserver' or undefined
            // [2] is '.js:{line_number}:{column_number}'
            serverStack += `${match[1] || 'suppressed'}${match[2]}\n`;
        }
        return serverStack;
    }
}
exports.TypeScriptServerError = TypeScriptServerError;
//# sourceMappingURL=serverError.js.map