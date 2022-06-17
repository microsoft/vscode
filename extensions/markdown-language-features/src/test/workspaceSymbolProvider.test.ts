/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdDocumentSymbolProvider } from '../languageFeatures/documentSymbolProvider';
import { MdWorkspaceSymbolProvider } from '../languageFeatures/workspaceSymbolProvider';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { workspacePath } from './util';

function getWorkspaceSymbols(workspace: MdWorkspaceContents, query = ''): Promise<vscode.SymbolInformation[]> {
	const engine = createNewMarkdownEngine();
	const symbolProvider = new MdDocumentSymbolProvider(new MdTableOfContentsProvider(engine, workspace));
	return new MdWorkspaceSymbolProvider(symbolProvider, workspace).provideWorkspaceSymbols(query);
}

suite('markdown.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', async () => {
		const workspace = new InMemoryWorkspaceMarkdownDocuments([]);
		assert.deepStrictEqual(await getWorkspaceSymbols(workspace, ''), []);
	});

	test('Should return symbols from workspace with one markdown file', async () => {
		const workspace = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(workspacePath('test.md'), `# header1\nabc\n## header2`)
		]);

		const symbols = await getWorkspaceSymbols(workspace, '');
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# header1');
		assert.strictEqual(symbols[1].name, '## header2');
	});

	test('Should return all content  basic workspace', async () => {
		const fileNameCount = 10;
		const files: SkinnyTextDocument[] = [];
		for (let i = 0; i < fileNameCount; ++i) {
			const testFileName = workspacePath(`test${i}.md`);
			files.push(new InMemoryDocument(testFileName, `# common\nabc\n## header${i}`));
		}

		const workspace = new InMemoryWorkspaceMarkdownDocuments(files);

		const symbols = await getWorkspaceSymbols(workspace, '');
		assert.strictEqual(symbols.length, fileNameCount * 2);
	});

	test('Should update results when markdown file changes symbols', async () => {
		const testFileName = workspacePath('test.md');
		const workspace = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`, 1 /* version */)
		]);

		assert.strictEqual((await getWorkspaceSymbols(workspace, '')).length, 1);

		// Update file
		workspace.updateDocument(new InMemoryDocument(testFileName, `# new header\nabc\n## header2`, 2 /* version */));
		const newSymbols = await getWorkspaceSymbols(workspace, '');
		assert.strictEqual(newSymbols.length, 2);
		assert.strictEqual(newSymbols[0].name, '# new header');
		assert.strictEqual(newSymbols[1].name, '## header2');
	});

	test('Should remove results when file is deleted', async () => {
		const testFileName = workspacePath('test.md');

		const workspace = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		assert.strictEqual((await getWorkspaceSymbols(workspace, '')).length, 1);

		// delete file
		workspace.deleteDocument(testFileName);
		const newSymbols = await getWorkspaceSymbols(workspace, '');
		assert.strictEqual(newSymbols.length, 0);
	});

	test('Should update results when markdown file is created', async () => {
		const testFileName = workspacePath('test.md');

		const workspace = new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		assert.strictEqual((await getWorkspaceSymbols(workspace, '')).length, 1);

		// Create file
		workspace.createDocument(new InMemoryDocument(workspacePath('test2.md'), `# new header\nabc\n## header2`));
		const newSymbols = await getWorkspaceSymbols(workspace, '');
		assert.strictEqual(newSymbols.length, 3);
	});
});
