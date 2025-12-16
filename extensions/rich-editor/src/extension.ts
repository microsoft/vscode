/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './providers/markdownProvider';
import { TypstEditorProvider } from './providers/typstProvider';

export function activate(context: vscode.ExtensionContext): void {
	// Register Markdown rich editor
	context.subscriptions.push(
		MarkdownEditorProvider.register(context)
	);

	// Register Typst rich editor
	context.subscriptions.push(
		TypstEditorProvider.register(context)
	);

	// Register commands to open rich editor
	context.subscriptions.push(
		vscode.commands.registerCommand('richEditor.openMarkdown', async (uri?: vscode.Uri) => {
			const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (targetUri) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					targetUri,
					MarkdownEditorProvider.viewType
				);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('richEditor.openTypst', async (uri?: vscode.Uri) => {
			const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (targetUri) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					targetUri,
					TypstEditorProvider.viewType
				);
			}
		})
	);
}

export function deactivate(): void {
	// Cleanup if needed
}

