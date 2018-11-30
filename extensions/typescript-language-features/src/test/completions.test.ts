/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';

const testDocumentUri = vscode.Uri.parse('untitled:test.ts');

suite('TypeScript Completions', () => {
	const _disposables: vscode.Disposable[] = []

	teardown(() => {
		disposeAll(_disposables);
		return vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should not prioritize bracket accessor completions. #63100', async () => {
		await wait(100);

		// 'a' should be first entry in completion list
		await createTestEditor(joinLines(
			'const x = { "z-z": 1, a: 1 };',
			'x.'
		));

		const didChangeDocument = onChangedDocument(testDocumentUri, _disposables);
		const didSuggest = onDidSuggest(_disposables);

		await vscode.commands.executeCommand('editor.action.triggerSuggest');
		await didSuggest;
		await vscode.commands.executeCommand('acceptSelectedSuggestion');

		const document = await didChangeDocument;
		assert.strictEqual(
			document.getText(),
			joinLines(
				'const x = { "a": 1, "z-z": 2 };',
				'x.a'
			));
	});
});

const joinLines = (...args: string[]) => args.join('\n');

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function onChangedDocument(documentUri: vscode.Uri, disposables: vscode.Disposable[]) {
	return new Promise<vscode.TextDocument>(resolve => vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.toString() === documentUri.toString()) {
			resolve(e.document);
		}
	}, undefined, disposables));
}

async function createTestEditor(contents: string) {
	const document = await vscode.workspace.openTextDocument(testDocumentUri);
	await vscode.window.showTextDocument(document);
	const activeEditor = vscode.window.activeTextEditor;
	if (!activeEditor) {
		throw new Error('no active editor');
	}

	await activeEditor.insertSnippet(new vscode.SnippetString(contents));
}

function onDidSuggest(disposables: vscode.Disposable[]) {
	return new Promise(resolve =>
		disposables.push(vscode.languages.registerCompletionItemProvider('typescript', new class implements vscode.CompletionItemProvider {
			provideCompletionItems(doc: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
				// Return a fake item that will come first
				const range = new vscode.Range(new vscode.Position(position.line, 0), position);
				return [{
					label: doc.getText(range),
					sortText: '\0',
					range: range
				}];
			}
			async resolveCompletionItem(item: vscode.CompletionItem) {
				await vscode.commands.executeCommand('selectNextSuggestion')
				resolve();
				return item;
			}
		})));
}