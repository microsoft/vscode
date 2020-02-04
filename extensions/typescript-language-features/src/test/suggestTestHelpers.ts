/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as vscode from 'vscode';
import { wait } from './testUtils';

export async function acceptFirstSuggestion(uri: vscode.Uri, _disposables: vscode.Disposable[], options?: { useLineRange?: boolean }) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	const didSuggest = onDidSuggest(_disposables, options);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await didSuggest;
	// TODO: depends on reverting fix for https://github.com/Microsoft/vscode/issues/64257
	// Make sure we have time to resolve the suggestion because `acceptSelectedSuggestion` doesn't
	await wait(40);
	await vscode.commands.executeCommand('acceptSelectedSuggestion');
	return await didChangeDocument;
}

export async function typeCommitCharacter(uri: vscode.Uri, character: string, _disposables: vscode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	const didSuggest = onDidSuggest(_disposables);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await didSuggest;
	await vscode.commands.executeCommand('type', { text: character });
	return await didChangeDocument;
}

export function onChangedDocument(documentUri: vscode.Uri, disposables: vscode.Disposable[]) {
	return new Promise<vscode.TextDocument>(resolve => vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.toString() === documentUri.toString()) {
			resolve(e.document);
		}
	}, undefined, disposables));
}


function onDidSuggest(disposables: vscode.Disposable[], options?: { useLineRange?: boolean }) {
	return new Promise(resolve =>
		disposables.push(vscode.languages.registerCompletionItemProvider('typescript', new class implements vscode.CompletionItemProvider {
			provideCompletionItems(doc: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
				// Return a fake item that will come first
				const range = options && options.useLineRange
					? new vscode.Range(new vscode.Position(position.line, 0), position)
					: doc.getWordRangeAtPosition(position.translate({ characterDelta: -1 }));
				return [{
					label: '🦄',
					insertText: doc.getText(range),
					filterText: doc.getText(range),
					preselect: true,
					sortText: 'a',
					range: range
				}];
			}
			async resolveCompletionItem(item: vscode.CompletionItem) {
				await vscode.commands.executeCommand('selectNextSuggestion');
				resolve();
				return item;
			}
		})));
}
