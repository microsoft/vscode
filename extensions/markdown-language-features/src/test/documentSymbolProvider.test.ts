/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { MdDocumentSymbolProvider } from '../languageFeatures/documentSymbols';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { DisposableStore } from '../util/dispose';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { createNewMarkdownEngine } from './engine';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { nulLogger } from './nulLogging';
import { joinLines, withStore, workspacePath } from './util';


function getSymbolsForFile(store: DisposableStore, fileContents: string) {
	const doc = new InMemoryDocument(workspacePath('test.md'), fileContents);
	const workspace = store.add(new InMemoryMdWorkspace([doc]));
	const engine = createNewMarkdownEngine();
	const tocProvider = store.add(new MdTableOfContentsProvider(engine, workspace, nulLogger));
	const provider = new MdDocumentSymbolProvider(tocProvider, nulLogger);
	return provider.provideDocumentSymbols(doc);
}

suite('Markdown: DocumentSymbolProvider', () => {
	test('Should not return anything for empty document', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, '');
		assert.strictEqual(symbols.length, 0);
	}));

	test('Should not return anything for document with no headers', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`a`,
			`a`,
		));
		assert.strictEqual(symbols.length, 0);
	}));

	test('Should not return anything for document with # but no real headers', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`a#a`,
			`a#`,
		));
		assert.strictEqual(symbols.length, 0);
	}));

	test('Should return single symbol for single header', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, '# h');
		assert.strictEqual(symbols.length, 1);
		assert.strictEqual(symbols[0].name, '# h');
	}));

	test('Should not care about symbol level for single header', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, '### h');
		assert.strictEqual(symbols.length, 1);
		assert.strictEqual(symbols[0].name, '### h');
	}));

	test('Should put symbols of same level in flat list', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`## h`,
			`## h2`,
		));
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '## h');
		assert.strictEqual(symbols[1].name, '## h2');
	}));

	test('Should nest symbol of level - 1 under parent', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`# h`,
			`## h2`,
			`## h3`,
		));
		assert.strictEqual(symbols.length, 1);
		assert.strictEqual(symbols[0].name, '# h');
		assert.strictEqual(symbols[0].children.length, 2);
		assert.strictEqual(symbols[0].children[0].name, '## h2');
		assert.strictEqual(symbols[0].children[1].name, '## h3');
	}));

	test('Should nest symbol of level - n under parent', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`# h`,
			`#### h2`,
		));
		assert.strictEqual(symbols.length, 1);
		assert.strictEqual(symbols[0].name, '# h');
		assert.strictEqual(symbols[0].children.length, 1);
		assert.strictEqual(symbols[0].children[0].name, '#### h2');
	}));

	test('Should flatten children where lower level occurs first', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`# h`,
			`### h2`,
			`## h3`,
		));
		assert.strictEqual(symbols.length, 1);
		assert.strictEqual(symbols[0].name, '# h');
		assert.strictEqual(symbols[0].children.length, 2);
		assert.strictEqual(symbols[0].children[0].name, '### h2');
		assert.strictEqual(symbols[0].children[1].name, '## h3');
	}));

	test('Should handle line separator in file. Issue #63749', withStore(async (store) => {
		const symbols = await getSymbolsForFile(store, joinLines(
			`# A`,
			`- foo`,
			``,
			`# B`,
			`- bar`,
		));
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# A');
		assert.strictEqual(symbols[1].name, '# B');
	}));
});

