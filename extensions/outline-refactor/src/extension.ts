/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerMoveSymbolCommand } from './commands/moveSymbolCommand';

export function activate(context: vscode.ExtensionContext): void {
	registerMoveSymbolCommand(context);
}

export function deactivate(): void {
	// Nothing to clean up yet.
}
