/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdDocumentSymbolProvider } from '../languageFeatures/documentSymbols';
import { MdWorkspaceSymbolProvider } from '../languageFeatures/workspaceSymbols';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { ITextDocument } from '../types/textDocument';
import { DisposableStore } from '../util/dispose';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { IMdWorkspace } from '../workspace';
import { createNewMarkdownEngine } from './engine';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { nulLogger } from './nulLogging';
import { withStore, workspacePath } from './util';

function getWorkspaceSymbols(store: DisposableStore, workspace: IMdWorkspace, query = ''): Promise<vscode.SymbolInformation[]> {
	const engine = createNewMarkdownEngine();
	const tocProvider = store.add(new MdTableOfContentsProvider(engine, workspace, nulLogger));
	const symbolProvider = new MdDocumentSymbolProvider(tocProvider, nulLogger);
	const workspaceSymbolProvider = store.add(new MdWorkspaceSymbolProvider(symbolProvider, workspace));
	return workspaceSymbolProvider.provideWorkspaceSymbols(query);
}

suite('markdown.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', withStore(async (store) => {
		const workspace = store.add(new InMemoryMdWorkspace([]));
		assert.deepStrictEqual(await getWorkspaceSymbols(store, workspace, ''), []);
	}));

	test('Should return symbols from workspace with one markdown file', withStore(async (store) => {
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('test.md'), `# header1\nabc\n## header2`)
		]));

		const symbols = await getWorkspaceSymbols(store, workspace, '');
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# header1');
		assert.strictEqual(symbols[1].name, '## header2');
	}));

	test('Should return all content  basic workspace', withStore(async (store) => {
		const fileNameCount = 10;
		const files: ITextDocument[] = [];
		for (let i = 0; i < fileNameCount; ++i) {
			const testFileName = workspacePath(`test${i}.md`);
			files.push(new InMemoryDocument(testFileName, `# common\nabc\n## header${i}`));
		}

		const workspace = store.add(new InMemoryMdWorkspace(files));

		const symbols = await getWorkspaceSymbols(store, workspace, '');
		assert.strictEqual(symbols.length, fileNameCount * 2);
	}));

	test('Should update results when markdown file changes symbols', withStore(async (store) => {
		const testFileName = workspacePath('test.md');
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(testFileName, `# header1`, 1 /* version */)
		]));

		assert.strictEqual((await getWorkspaceSymbols(store, workspace, '')).length, 1);

		// Update file
		workspace.updateDocument(new InMemoryDocument(testFileName, `# new header\nabc\n## header2`, 2 /* version */));
		const newSymbols = await getWorkspaceSymbols(store, workspace, '');
		assert.strictEqual(newSymbols.length, 2);
		assert.strictEqual(newSymbols[0].name, '# new header');
		assert.strictEqual(newSymbols[1].name, '## header2');
	}));

	test('Should remove results when file is deleted', withStore(async (store) => {
		const testFileName = workspacePath('test.md');

		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(testFileName, `# header1`)
		]));

		assert.strictEqual((await getWorkspaceSymbols(store, workspace, '')).length, 1);

		// delete file
		workspace.deleteDocument(testFileName);
		const newSymbols = await getWorkspaceSymbols(store, workspace, '');
		assert.strictEqual(newSymbols.length, 0);
	}));

	test('Should update results when markdown file is created', withStore(async (store) => {
		const testFileName = workspacePath('test.md');

		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(testFileName, `# header1`)
		]));

		assert.strictEqual((await getWorkspaceSymbols(store, workspace, '')).length, 1);

		// Create file
		workspace.createDocument(new InMemoryDocument(workspacePath('test2.md'), `# new header\nabc\n## header2`));
		const newSymbols = await getWorkspaceSymbols(store, workspace, '');
		assert.strictEqual(newSymbols.length, 3);
	}));
});
