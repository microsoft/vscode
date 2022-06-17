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
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { joinLines, workspacePath } from './util';


function getFileReferences(resource: vscode.Uri, workspace: MdWorkspaceContents) {
	const engine = createNewMarkdownEngine();
	const computer = new MdReferencesProvider(engine, workspace, new MdTableOfContentsProvider(engine, workspace));
	return computer.getAllReferencesToFile(resource, noopToken);
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

	test('Should find basic references', async () => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');

		const refs = await getFileReferences(otherUri, new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md)`,
				`[link 2](./other.md)`,
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md)`,
				`post`,
			)),
		]));

		assertReferencesEqual(refs!,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
		);
	});

	test('Should find references with and without file extensions', async () => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');

		const refs = await getFileReferences(otherUri, new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md)`,
				`[link 2](./other)`,
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md)`,
				`[link 4](./other)`,
				`post`,
			)),
		]));

		assertReferencesEqual(refs!,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
			{ uri: otherUri, line: 3 },
		);
	});

	test('Should find references with headers on links', async () => {
		const docUri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');

		const refs = await getFileReferences(otherUri, new InMemoryWorkspaceMarkdownDocuments([
			new InMemoryDocument(docUri, joinLines(
				`# header`,
				`[link 1](./other.md#sub-bla)`,
				`[link 2](./other#sub-bla)`,
			)),
			new InMemoryDocument(otherUri, joinLines(
				`# header`,
				`pre`,
				`[link 3](./other.md#sub-bla)`,
				`[link 4](./other#sub-bla)`,
				`post`,
			)),
		]));

		assertReferencesEqual(refs!,
			{ uri: docUri, line: 1 },
			{ uri: docUri, line: 2 },
			{ uri: otherUri, line: 2 },
			{ uri: otherUri, line: 3 },
		);
	});
});
