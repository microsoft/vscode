/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import MDDocumentSymbolProvider from '../features/documentSymbolProvider';
import MarkdownWorkspaceSymbolProvider, { WorkspaceMarkdownDocumentProvider } from '../features/workspaceSymbolProvider';
import { createNewMarkdownEngine } from './engine';
import { InMemoryDocument } from './inMemoryDocument';


suite('markdown.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', async () => {
		const provider = new MarkdownWorkspaceSymbolProvider(new MDDocumentSymbolProvider(createNewMarkdownEngine()), new class implements WorkspaceMarkdownDocumentProvider {
			async getAllMarkdownDocuments() {
				return [];
			}
		});

		assert.deepEqual(await provider.provideWorkspaceSymbols(''), []);
	});

	test('Should return single documents content for basic workspace', async () => {
		const testFileName = vscode.Uri.parse('test.md');

		const provider = new MarkdownWorkspaceSymbolProvider(new MDDocumentSymbolProvider(createNewMarkdownEngine()), new class implements WorkspaceMarkdownDocumentProvider {
			async getAllMarkdownDocuments() {
				return [new InMemoryDocument(testFileName, `# header1\nabc\n## header2`)];
			}
		});

		const symbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# header1');
		assert.strictEqual(symbols[1].name, '## header2');
	});
});
