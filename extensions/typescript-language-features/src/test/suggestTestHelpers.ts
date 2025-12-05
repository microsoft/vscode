/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as vscode from 'vscode';
import { onChangedDocument, retryUntilDocumentChanges } from './testUtils';

export async function acceptFirstSuggestion(uri: vscode.Uri, _disposables: vscode.Disposable[]) {
	return retryUntilDocumentChanges(uri, { retries: 10, timeout: 0 }, _disposables, async () => {
		await vscode.commands.executeCommand('editor.action.triggerSuggest');
		const editor = vscode.window.activeTextEditor!;
		// wait until completion items are ready
		await vscode.commands.executeCommand<vscode.CompletionList>(
			'vscode.executeCompletionItemProvider', uri, editor.selection.active
		);
		await vscode.commands.executeCommand('acceptSelectedSuggestion');
	});
}

export async function typeCommitCharacter(uri: vscode.Uri, character: string, _disposables: vscode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	const editor = vscode.window.activeTextEditor!;
	// invoke suggestion UI
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	// wait for all providers to finish
	await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider', uri, editor.selection.active
	);
	// now type the commit character via command (triggers commit)
	await vscode.commands.executeCommand('type', { text: character });
	return await didChangeDocument;
}
