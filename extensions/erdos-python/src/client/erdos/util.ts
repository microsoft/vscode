/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { traceVerbose } from '../logging';

export class PromiseHandles<T> {
    resolve!: (value: T | Promise<T>) => void;

    reject!: (error: unknown) => void;

    promise: Promise<T>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function whenTimeout<T>(ms: number, fn: () => T): Promise<T> {
    await delay(ms);
    return fn();
}

export async function hasFiles(includes: string[]): Promise<boolean> {
    const include = `{${includes.join(',')}}`;
    traceVerbose(`Searching for _files_ with pattern: ${include}`);

    const files = await vscode.workspace.findFiles(include, '**/node_modules/**', 1);
    traceVerbose(`Found _files_: ${files.map((file) => file.fsPath)}`);

    return files.length > 0;
}
