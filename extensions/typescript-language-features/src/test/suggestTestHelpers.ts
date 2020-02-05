/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as vscode from 'vscode';
import { wait } from './testUtils';

export async function acceptFirstSuggestion(uri: vscode.Uri, _disposables: vscode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await wait(1000); // Give time for suggestions to show
	await vscode.commands.executeCommand('acceptSelectedSuggestion');
	return didChangeDocument;
}

export async function typeCommitCharacter(uri: vscode.Uri, character: string, _disposables: vscode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await wait(1000); // Give time for suggestions to show
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
