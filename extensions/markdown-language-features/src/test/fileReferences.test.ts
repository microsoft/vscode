/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdReference, MdReferencesProvider } from '../languageFeatures/references';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { noopToken } from '../util/cancellation';
import { DisposableStore } from '../util/dispose';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { IMdWorkspace } from '../workspace';
import { createNewMarkdownEngine } from './engine';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { nulLogger } from './nulLogging';
import { joinLines, withStore, workspacePath } from './util';


function getFileReferences(store: DisposableStore, resource: vscode.Uri, workspace: IMdWorkspace) {
	const engine = createNewMarkdownEngine();
	const tocProvider = store.add(new MdTableOfContentsProvider(engine, workspace, nulLogger));
	const computer = store.add(new MdReferencesProvider(engine, workspace, tocProvider, nulLogger));
	return computer.getReferencesToFileInWorkspace(resource, noopToken);
}

function assertReferencesEqual(actualRefs: readonly MdReference[], ...expectedRefs: { uri: vscode.Uri; line: number }[]) {
	assert.strictEqual(actualRefs.length, expectedRefs.length, `Reference counts should match`);

	for (let i = 0; i < actualRefs.length; ++i) {
		const actual = actualRefs[i].location;
		const expected = expectedRefs[i];
		assert.strictEqual(actual.uri.toString(), expected.uri.toString(), `Ref '${i}' has expected document`);
		assert.strictEqual(actual.range.start.line, expected.line, `Ref '${i}' has expected start line`);
		assert.strictEqual(actual.range.end.line, expected.line, `Ref '${i}' has expected end line`);
	}
}

suite('markdown: find file references', () => {

	test('Should find basic references', withStore(async (store) => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md)`,
				`[link 2](./other.md)`
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md)`,
				`post`
			)),
		]));

		const refs = await getFileReferences(store, otherUri, workspace);
		assertReferencesEqual(refs,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
		);
	}));

	test('Should find references with and without file extensions', withStore(async (store) => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md)`,
				`[link 2](./other)`
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md)`,
				`[link 4](./other)`,
				`post`
			)),
		]));

		const refs = await getFileReferences(store, otherUri, workspace);
		assertReferencesEqual(refs,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
			{ uri: otherUri, line: 3 },
		);
	}));

	test('Should find references with headers on links', withStore(async (store) => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const workspace = store.add(new InMemoryMdWorkspace([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md#sub-bla)`,
				`[link 2](./other#sub-bla)`
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md#sub-bla)`,
				`[link 4](./other#sub-bla)`,
				`post`
			)),
		]));

		const refs = await getFileReferences(store, otherUri, workspace);
		assertReferencesEqual(refs,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
			{ uri: otherUri, line: 3 },
		);
	}));
});
