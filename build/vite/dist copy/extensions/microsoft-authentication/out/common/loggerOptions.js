"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsalLoggerOptions = void 0;
const msal_node_1 = require("@azure/msal-node");
const vscode_1 = require("vscode");
class MsalLoggerOptions {
    _output;
    _telemtryReporter;
    piiLoggingEnabled = false;
    constructor(_output, _telemtryReporter) {
        this._output = _output;
        this._telemtryReporter = _telemtryReporter;
    }
    get logLevel() {
        return this._toMsalLogLevel(vscode_1.env.logLevel);
    }
    loggerCallback(level, message, _containsPii) {
        // Log to output channel one level lower than the MSAL log level
        switch (level) {
            case msal_node_1.LogLevel.Error:
                this._output.error(message);
                this._telemtryReporter.sendTelemetryErrorEvent(message);
                return;
            case msal_node_1.LogLevel.Warning:
                this._output.warn(message);
                return;
            case msal_node_1.LogLevel.Info:
                this._output.debug(message);
                return;
            case msal_node_1.LogLevel.Verbose:
                this._output.trace(message);
                return;
            case msal_node_1.LogLevel.Trace:
                // Do not log trace messages
                return;
            default:
                this._output.debug(message);
                return;
        }
    }
    _toMsalLogLevel(logLevel) {
        switch (logLevel) {
            case vscode_1.LogLevel.Trace:
                return msal_node_1.LogLevel.Trace;
            case vscode_1.LogLevel.Debug:
                return msal_node_1.LogLevel.Verbose;
            case vscode_1.LogLevel.Info:
                return msal_node_1.LogLevel.Info;
            case vscode_1.LogLevel.Warning:
                return msal_node_1.LogLevel.Warning;
            case vscode_1.LogLevel.Error:
                return msal_node_1.LogLevel.Error;
            default:
                return msal_node_1.LogLevel.Info;
        }
    }
}
exports.MsalLoggerOptions = MsalLoggerOptions;
//# sourceMappingURL=loggerOptions.js.map