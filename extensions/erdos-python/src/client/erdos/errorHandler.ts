/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
    CloseAction,
    CloseHandlerResult,
    ErrorAction,
    ErrorHandler,
    ErrorHandlerResult,
    Message,
} from 'vscode-languageclient/node';

import { traceWarn } from '../logging';

export class PythonErrorHandler implements ErrorHandler {
    constructor(private readonly _version: string, private readonly _port: number) {}

    public error(error: Error, _message: Message, count: number): ErrorHandlerResult {
        traceWarn(
            `Python (${this._version}) language client error occurred (port ${this._port}). '${error.name}' with message: ${error.message}. This is error number ${count}.`,
        );
        return { action: ErrorAction.Shutdown, handled: true };
    }

    public closed(): CloseHandlerResult {
        traceWarn(`Python (${this._version}) language client was closed unexpectedly (port ${this._port}).`);
        return { action: CloseAction.DoNotRestart, handled: true };
    }
}
