/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdDocumentSymbolProvider } from '../languageFeatures/documentSymbolProvider';
import { MdWorkspaceSymbolProvider } from '../languageFeatures/workspaceSymbolProvider';
import { SkinnyTextDocument } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';


const symbolProvider = new MdDocumentSymbolProvider(createNewMarkdownEngine());

suite('markdown.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', async () => {
		const provider = new MdWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceMarkdownDocuments([]));

		assert.deepStrictEqual(await provider.provideWorkspaceSymbols(''), []);
	});

	test('Should return symbols from workspace with one markdown file', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const provider = new MdWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1\nabc\n## header2`)
		]));

		const symbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# header1');
		assert.strictEqual(symbols[1].name, '## header2');
	});

	test('Should return all content  basic workspace', async () => {
		const fileNameCount = 10;
		const files: SkinnyTextDocument[] = [];
		for (let i = 0; i < fileNameCount; ++i) {
			const testFileName = vscode.Uri.file(`test${i}.md`);
			files.push(new InMemoryDocument(testFileName, `# common\nabc\n## header${i}`));
		}

		const provider = new MdWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceMarkdownDocuments(files));

		const symbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(symbols.length, fileNameCount * 2);
	});

	test('Should update results when markdown file changes symbols', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`, 1 /* version */)
		]);

		const provider = new MdWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);

		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// Update file
		workspaceFileProvider.updateDocument(new InMemoryDocument(testFileName, `# new header\nabc\n## header2`, 2 /* version */));
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 2);
		assert.strictEqual(newSymbols[0].name, '# new header');
		assert.strictEqual(newSymbols[1].name, '## header2');
	});

	test('Should remove results when file is deleted', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		const provider = new MdWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);
		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// delete file
		workspaceFileProvider.deleteDocument(testFileName);
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 0);
	});

	test('Should update results when markdown file is created', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		const provider = new MdWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);
		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// Creat file
		workspaceFileProvider.createDocument(new InMemoryDocument(vscode.Uri.file('test2.md'), `# new header\nabc\n## header2`));
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 3);
	});
});
