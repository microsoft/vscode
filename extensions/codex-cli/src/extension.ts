/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { getBundledCodexPath } from './paths';

export function activate(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('codex.runTask', () => {
		try {
			const codexPath = getBundledCodexPath(context);
			if (!fs.existsSync(codexPath)) {
				vscode.window.showErrorMessage(`Bundled Codex CLI not found at ${codexPath}`);
				return;
			}

			console.log(`[Codex CLI] Bundled binary: ${codexPath}`);
			vscode.window.showInformationMessage(`Codex CLI path: ${codexPath}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Codex CLI path error: ${message}`);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate(): void {
	// No-op for now
}
