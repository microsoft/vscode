// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { commands, Disposable } from 'vscode';

/**
 * Wrapper for vscode.commands.executeCommand to make it easier to mock in tests
 */
export function executeCommand<T>(command: string, ...rest: any[]): Thenable<T> {
    return commands.executeCommand<T>(command, ...rest);
}

/**
 * Wrapper for vscode.commands.registerCommand to make it easier to mock in tests
 */
export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    return commands.registerCommand(command, callback, thisArg);
}
