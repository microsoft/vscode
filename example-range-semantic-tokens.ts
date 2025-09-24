/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Example demonstration of the new onDidChangeSemanticTokens support for DocumentRangeSemanticTokensProvider
 * This file shows how extensions can now implement event-driven semantic token refreshing for range providers.
 */

import * as vscode from 'vscode';

class ExampleRangeSemanticTokensProvider implements vscode.DocumentRangeSemanticTokensProvider {
	private _onDidChangeSemanticTokens = new vscode.EventEmitter<void>();
	readonly onDidChangeSemanticTokens: vscode.Event<void> = this._onDidChangeSemanticTokens.event;

	private legend = new vscode.SemanticTokensLegend(
		['class', 'function', 'variable'], 
		['declaration', 'readonly']
	);

	constructor() {
		// Example: Listen to configuration changes and refresh semantic tokens
		vscode.workspace.onDidChangeConfiguration(() => {
			this._onDidChangeSemanticTokens.fire();
		});
	}

	provideDocumentRangeSemanticTokens(
		document: vscode.TextDocument, 
		range: vscode.Range, 
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.SemanticTokens> {
		// Implement semantic token logic here
		const builder = new vscode.SemanticTokensBuilder(this.legend);
		// Add tokens based on the specific range...
		return builder.build();
	}

	// Method to manually trigger refresh when needed
	public refresh(): void {
		this._onDidChangeSemanticTokens.fire();
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new ExampleRangeSemanticTokensProvider();
	
	// The provider now supports onDidChangeSemanticTokens event!
	const registration = vscode.languages.registerDocumentRangeSemanticTokensProvider(
		{ language: 'typescript' }, 
		provider, 
		provider.legend
	);

	context.subscriptions.push(registration);

	// Example command to manually refresh semantic tokens
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.refreshSemanticTokens', () => {
			provider.refresh();
		})
	);
}