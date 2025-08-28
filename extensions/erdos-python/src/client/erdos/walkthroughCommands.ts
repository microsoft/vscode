/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function activateWalkthroughCommands(disposables: vscode.Disposable[]) {
    disposables.push(
        vscode.commands.registerCommand('python.walkthrough.autoreload', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'python.enableAutoReload');
        }),
        vscode.commands.registerCommand('python.walkthrough.bundledIpykernel', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'python.useBundledIpykernel');
        }),
        vscode.commands.registerCommand('python.walkthrough.interpreterInclude', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'python.interpreters.include');
        }),
        vscode.commands.registerCommand('python.walkthrough.interpreterExclude', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'python.interpreters.exclude');
        }),
    );
}
