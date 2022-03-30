/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { MdReferencesProvider } from '../languageFeatures/references';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryDocument } from './inMemoryDocument';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { joinLines, noopToken, workspaceFile } from './util';


function getReferences(doc: InMemoryDocument, pos: vscode.Position, workspaceContents: MdWorkspaceContents) {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const provider = new MdReferencesProvider(linkProvider, workspaceContents, engine);
	return provider.provideReferences(doc, pos, { includeDeclaration: true }, noopToken);
}

suite.only('markdown header references', () => {
	test('Should not return references when not on header', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
			`text`,
		));

		{
			const refs = await getReferences(doc, new vscode.Position(1, 0), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs, undefined);
		}
		{
			const refs = await getReferences(doc, new vscode.Position(3, 2), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs, undefined);
		}
	});

	test('Should find simple references within same file', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
			`[not link](#noabc)`,
			`[link 2](#abc)`,
		));
		const refs = await getReferences(doc, new vscode.Position(0, 3), new InMemoryWorkspaceMarkdownDocuments([doc]));

		assert.deepStrictEqual(refs!.length, 2);

		{
			const ref1 = refs![0];
			assert.deepStrictEqual(ref1.range.start.line, 2);
		}
		{
			const ref2 = refs![1];
			assert.deepStrictEqual(ref2.range.start.line, 4);
		}
	});

	test('Should find simple references across files', async () => {
		const docUri = workspaceFile('doc.md');
		const other1Uri = workspaceFile('sub', 'other.md');
		const other2Uri = workspaceFile('other2.md');

		const doc = new InMemoryDocument(docUri, joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
		));
		const refs = await getReferences(doc, new vscode.Position(0, 3), new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(other1Uri, joinLines(
				`[not link](#abc)`,
				`[not link](/doc.md#abz)`,
				`[link](/doc.md#abc)`,
			)),
			new InMemoryDocument(other2Uri, joinLines(
				`[not link](#abc)`,
				`[not link](./doc.md#abz)`,
				`[link](./doc.md#abc)`,
			))
		]));

		assert.deepStrictEqual(refs!.length, 3);

		{
			const ref1 = refs![0];
			assert.deepStrictEqual(ref1.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref1.range.start.line, 2);
		}
		{
			const ref2 = refs![1];
			assert.deepStrictEqual(ref2.uri.toString(), other1Uri.toString());
			assert.deepStrictEqual(ref2.range.start.line, 2);
		}
		{
			const ref3 = refs![2];
			assert.deepStrictEqual(ref3.uri.toString(), other2Uri.toString());
			assert.deepStrictEqual(ref3.range.start.line, 2);
		}
	});
});
