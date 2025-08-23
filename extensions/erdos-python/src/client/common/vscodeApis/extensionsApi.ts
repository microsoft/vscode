// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from '../platform/fs-paths';
import { PVSC_EXTENSION_ID } from '../constants';

export function getExtension<T = unknown>(extensionId: string): vscode.Extension<T> | undefined {
    return vscode.extensions.getExtension(extensionId);
}

export function isExtensionEnabled(extensionId: string): boolean {
    return vscode.extensions.getExtension(extensionId) !== undefined;
}

export function isExtensionDisabled(extensionId: string): boolean {
    // We need an enabled extension to find the extensions dir.
    const pythonExt = getExtension(PVSC_EXTENSION_ID);
    if (pythonExt) {
        let found = false;
        fs.readdirSync(path.dirname(pythonExt.extensionPath), { withFileTypes: false }).forEach((s) => {
            if (s.toString().startsWith(extensionId)) {
                found = true;
            }
        });
        return found;
    }
    return false;
}

export function isInsider(): boolean {
    return vscode.env.appName.includes('Insider');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getExtensions(): readonly vscode.Extension<any>[] {
    return vscode.extensions.all;
}
