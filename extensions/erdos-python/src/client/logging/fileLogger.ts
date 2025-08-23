// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { WriteStream } from 'fs-extra';
import * as util from 'util';
import { Disposable } from 'vscode-jsonrpc';
import { Arguments, ILogging } from './types';
import { getTimeForLogging } from './util';

function formatMessage(level?: string, ...data: Arguments): string {
    return level
        ? `[${level.toUpperCase()} ${getTimeForLogging()}]: ${util.format(...data)}\r\n`
        : `${util.format(...data)}\r\n`;
}

export class FileLogger implements ILogging, Disposable {
    constructor(private readonly stream: WriteStream) {}

    public traceLog(...data: Arguments): void {
        this.stream.write(formatMessage(undefined, ...data));
    }

    public traceError(...data: Arguments): void {
        this.stream.write(formatMessage('error', ...data));
    }

    public traceWarn(...data: Arguments): void {
        this.stream.write(formatMessage('warn', ...data));
    }

    public traceInfo(...data: Arguments): void {
        this.stream.write(formatMessage('info', ...data));
    }

    public traceVerbose(...data: Arguments): void {
        this.stream.write(formatMessage('debug', ...data));
    }

    public dispose(): void {
        try {
            this.stream.close();
        } catch (ex) {
            /** do nothing */
        }
    }
}
