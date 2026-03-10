/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
	console.log('[phonon-module-ops] activated');
	// Data providers will be registered here via phonon.* API in future phases
}

export function deactivate(): void {
	// No cleanup needed
}
