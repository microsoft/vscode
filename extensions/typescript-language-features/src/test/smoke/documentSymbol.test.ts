/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../../utils/dispose';
import { createRandomFile, deleteFile, wait } from '../testUtils';

suite('TypeScript Document Symbols', () => {
	setup(async () => {
		await vscode.extensions.getExtension('vscode.typescript-language-features')!.activate();
	});

	test('should refresh symbols when a document is reopened after an external edit', async () => {
		const file = await createRandomFile('export const original = 1;', 'ts');
		const disposables: vscode.Disposable[] = [];
		try {
			// Avoid openTextDocument's temporary model reference when testing close.
			await vscode.commands.executeCommand('vscode.open', file);
			const document = vscode.window.activeTextEditor?.document;
			assert.ok(document);

			// TypeScript providers are registered lazily after activation.
			let originalSymbols: vscode.DocumentSymbol[] | undefined;
			for (let attempt = 0; attempt < 100; ++attempt) {
				originalSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', file);
				if (originalSymbols?.length) {
					break;
				}
				await wait(100);
			}
			assert.deepStrictEqual(originalSymbols?.map(symbol => symbol.name), ['original']);

			const closed = new Promise<void>(resolve => {
				vscode.workspace.onDidCloseTextDocument(closedDocument => {
					if (closedDocument === document) {
						resolve();
					}
				}, undefined, disposables);
			});
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await closed;

			await vscode.workspace.fs.writeFile(file, Buffer.from('export const updated = 2;'));
			const reopened = await vscode.workspace.openTextDocument(file);
			await vscode.window.showTextDocument(reopened);
			assert.deepStrictEqual(
				{ version: reopened.version, text: reopened.getText() },
				{ version: document.version, text: 'export const updated = 2;' });
			const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', file);
			assert.deepStrictEqual(symbols?.map(symbol => symbol.name), ['updated']);
		} finally {
			disposeAll(disposables);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await deleteFile(file);
		}
	});
});
