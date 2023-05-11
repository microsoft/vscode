/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { assertNoRpc, createRandomFile, usingDisposables } from '../utils';

const textPlain = 'text/plain';

suite('vscode API - Copy Paste', () => {

	teardown(assertNoRpc);

	test('Copy should be able to overwrite text/plain', usingDisposables(async (disposables) => {
		const file = await createRandomFile('$abcde@');
		const doc = await vscode.workspace.openTextDocument(file);

		const editor = await vscode.window.showTextDocument(doc);
		editor.selections = [new vscode.Selection(0, 1, 0, 6)];

		disposables.push(vscode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements vscode.DocumentPasteEditProvider {
			async prepareDocumentPaste?(_document: vscode.TextDocument, _ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const str = await existing.asString();
					const reversed = reverseString(str);
					dataTransfer.set(textPlain, new vscode.DataTransferItem(reversed));
				}
			}
		}, {
			copyMimeTypes: [textPlain],
		}));

		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(disposables, doc);
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, '$edcba@');
	}));

	test('Copy with empty selection should copy entire line', usingDisposables(async (disposables) => {
		const file = await createRandomFile('abc');
		const doc = await vscode.workspace.openTextDocument(file);
		await vscode.window.showTextDocument(doc);

		disposables.push(vscode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements vscode.DocumentPasteEditProvider {
			async prepareDocumentPaste?(_document: vscode.TextDocument, _ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const str = await existing.asString();
					// Don't include the trailing new line when reversing
					const eol = str.match(/\r?\n$/);
					const reversed = reverseString(str.slice(0, -eol!.length));
					dataTransfer.set(textPlain, new vscode.DataTransferItem(reversed + eol));
				}
			}
		}, {
			copyMimeTypes: [textPlain],
		}));

		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(disposables, doc);
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, 'cba\nabc');
	}));

	test('Copy with multiple selections should get all selections', usingDisposables(async (disposables) => {
		const file = await createRandomFile('111\n222\n333');
		const doc = await vscode.workspace.openTextDocument(file);
		const editor = await vscode.window.showTextDocument(doc);

		editor.selections = [
			new vscode.Selection(0, 0, 0, 3),
			new vscode.Selection(2, 0, 2, 3),
		];

		disposables.push(vscode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements vscode.DocumentPasteEditProvider {
			async prepareDocumentPaste?(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const selections = ranges.map(range => document.getText(range));
					dataTransfer.set(textPlain, new vscode.DataTransferItem(`(${ranges.length})${selections.join(' ')}`));
				}
			}
		}, {
			copyMimeTypes: [textPlain],
		}));

		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		editor.selections = [new vscode.Selection(0, 0, 0, 0)];
		const newDocContent = getNextDocumentText(disposables, doc);
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

		assert.strictEqual(await newDocContent, '(2)111 333111\n222\n333');
	}));
});

function reverseString(str: string) {
	return str.split("").reverse().join("");
}

function getNextDocumentText(disposables: vscode.Disposable[], doc: vscode.TextDocument): Promise<string> {
	return new Promise<string>(resolve => {
		disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === doc) {
				resolve(doc.getText());
			}
		}));
	});
}

