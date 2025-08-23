// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Uri } from 'vscode';

export type Arguments = unknown[];

function valueToLogString(value: unknown, kind: string): string {
    if (value === undefined) {
        return 'undefined';
    }
    if (value === null) {
        return 'null';
    }
    try {
        if (value && (value as Uri).fsPath) {
            return `<Uri:${(value as Uri).fsPath}>`;
        }
        return JSON.stringify(value);
    } catch {
        return `<${kind} cannot be serialized for logging>`;
    }
}

// Convert the given array of values (func call arguments) into a string
// suitable to be used in a log message.
export function argsToLogString(args: Arguments): string {
    if (!args) {
        return '';
    }
    try {
        const argStrings = args.map((item, index) => {
            const valueString = valueToLogString(item, 'argument');
            return `Arg ${index + 1}: ${valueString}`;
        });
        return argStrings.join(', ');
    } catch {
        return '';
    }
}

// Convert the given return value into a string
// suitable to be used in a log message.
export function returnValueToLogString(returnValue: unknown): string {
    const valueString = valueToLogString(returnValue, 'Return value');
    return `Return Value: ${valueString}`;
}

export function getTimeForLogging(): string {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;
}
