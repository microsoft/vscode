/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { MdReferencesProvider } from '../languageFeatures/references';
import { githubSlugifier } from '../slugify';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { joinLines, noopToken, workspaceFile } from './util';


function getReferences(doc: InMemoryDocument, pos: vscode.Position, workspaceContents: MdWorkspaceContents) {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const provider = new MdReferencesProvider(linkProvider, workspaceContents, engine, githubSlugifier);
	return provider.provideReferences(doc, pos, { includeDeclaration: true }, noopToken);
}

suite('markdown: find all references', () => {
	test('Should not return references when not on header or link', async () => {
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

	test('Should find references from header within same file', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
			`[not link](#noabc)`,
			`[link 2](#abc)`,
		));
		const refs = await getReferences(doc, new vscode.Position(0, 3), new InMemoryWorkspaceMarkdownDocuments([doc]));

		assert.deepStrictEqual(refs!.length, 3);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![2];
			assert.deepStrictEqual(ref.range.start.line, 4);
		}
	});

	test('Should find references using normalized slug', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# a B c`,
			`[simple](#a-b-c)`,
			`[start underscore](#_a-b-c)`,
			`[different case](#a-B-C)`,
		));

		{
			// Trigger header
			const refs = await getReferences(doc, new vscode.Position(0, 0), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs!.length, 4);
		}
		{
			// Trigger on line 1
			const refs = await getReferences(doc, new vscode.Position(1, 12), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs!.length, 4);
		}
		{
			// Trigger on line 2
			const refs = await getReferences(doc, new vscode.Position(2, 24), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs!.length, 4);
		}
		{
			// Trigger on line 3
			const refs = await getReferences(doc, new vscode.Position(3, 20), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs!.length, 4);
		}
	});

	test('Should find references from header across files', async () => {
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

		assert.deepStrictEqual(refs!.length, 4);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![2];
			assert.deepStrictEqual(ref.uri.toString(), other1Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![3];
			assert.deepStrictEqual(ref.uri.toString(), other2Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
	});

	test('Should find references from header to link definitions ', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# abc`,
			``,
			`[bla]: #abc`
		));
		const refs = await getReferences(doc, new vscode.Position(0, 3), new InMemoryWorkspaceMarkdownDocuments([doc]));

		assert.deepStrictEqual(refs!.length, 2);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
	});

	test('Should find references from link within same file', async () => {
		const doc = new InMemoryDocument(workspaceFile('doc.md'), joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
			`[not link](#noabc)`,
			`[link 2](#abc)`,
		));
		const refs = await getReferences(doc, new vscode.Position(2, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));

		assert.deepStrictEqual(refs!.length, 3);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![2];
			assert.deepStrictEqual(ref.range.start.line, 4);
		}
	});

	test('Should find references from link across files', async () => {
		const docUri = workspaceFile('doc.md');
		const other1Uri = workspaceFile('sub', 'other.md');
		const other2Uri = workspaceFile('other2.md');

		const doc = new InMemoryDocument(docUri, joinLines(
			`# abc`,
			``,
			`[link 1](#abc)`,
		));
		const refs = await getReferences(doc, new vscode.Position(2, 10), new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(other1Uri, joinLines(
				`[not link](#abc)`,
				`[not link](/doc.md#abz)`,
				`[with ext](/doc.md#abc)`,
				`[without ext](/doc#abc)`,
			)),
			new InMemoryDocument(other2Uri, joinLines(
				`[not link](#abc)`,
				`[not link](./doc.md#abz)`,
				`[link](./doc.md#abc)`,
			))
		]));

		assert.deepStrictEqual(refs!.length, 5);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1]; // Within file
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![2]; // Other with ext
			assert.deepStrictEqual(ref.uri.toString(), other1Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
		{
			const ref = refs![3]; // Other without ext
			assert.deepStrictEqual(ref.uri.toString(), other1Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 3);
		}
		{
			const ref = refs![4]; // Other2
			assert.deepStrictEqual(ref.uri.toString(), other2Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
	});

	test('Should find references from link across files when triggered on link without file extension', async () => {
		const docUri = workspaceFile('doc.md');
		const other1Uri = workspaceFile('sub', 'other.md');

		const doc = new InMemoryDocument(docUri, joinLines(
			`[with ext](./sub/other#header)`,
			`[without ext](./sub/other.md#header)`,
		));
		const refs = await getReferences(doc, new vscode.Position(0, 15), new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(other1Uri, joinLines(
				`pre`,
				`# header`,
				`post`,
			)),
		]));

		assert.deepStrictEqual(refs!.length, 3);

		{
			const ref = refs![0]; // Header definition
			assert.deepStrictEqual(ref.uri.toString(), other1Uri.toString());
			assert.deepStrictEqual(ref.range.start.line, 1);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![2];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 1);
		}
	});

	test('Should include header references when triggered on file link', async () => {
		const docUri = workspaceFile('doc.md');
		const otherUri = workspaceFile('sub', 'other.md');

		const doc = new InMemoryDocument(docUri, joinLines(
			`[with ext](./sub/other)`,
			`[with ext](./sub/other#header)`,
			`[without ext](./sub/other.md#no-such-header)`,
		));
		const refs = await getReferences(doc, new vscode.Position(0, 15), new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(otherUri, joinLines(
				`pre`,
				`# header`, // Definition should not be included since we triggered on a file link
				`post`,
			)),
		]));

		assert.deepStrictEqual(refs!.length, 3);

		{
			const ref = refs![0];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 0);
		}
		{
			const ref = refs![1];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 1);
		}
		{
			const ref = refs![2];
			assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
			assert.deepStrictEqual(ref.range.start.line, 2);
		}
	});

	suite('Reference links', () => {
		test('Should find reference links within file', async () => {
			const docUri = workspaceFile('doc.md');
			const doc = new InMemoryDocument(docUri, joinLines(
				`[link 1][abc]`,
				``,
				`[abc]: https://example.com`,
			));

			const refs = await getReferences(doc, new vscode.Position(0, 12), new InMemoryWorkspaceMarkdownDocuments([doc]));
			assert.deepStrictEqual(refs!.length, 2);

			{
				const ref = refs![0];
				assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
				assert.deepStrictEqual(ref.range.start.line, 0);
			}
			{
				const ref = refs![1];
				assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
				assert.deepStrictEqual(ref.range.start.line, 2);
			}
		});

		test('Should not find reference links across files', async () => {
			const docUri = workspaceFile('doc.md');
			const doc = new InMemoryDocument(docUri, joinLines(
				`[link 1][abc]`,
				``,
				`[abc]: https://example.com`,
			));

			const refs = await getReferences(doc, new vscode.Position(0, 12), new InMemoryWorkspaceMarkdownDocuments([
				doc,
				new InMemoryDocument(workspaceFile('other.md'), joinLines(
					`[link 1][abc]`,
					``,
					`[abc]: https://example.com?bad`,
				))
			]));
			assert.deepStrictEqual(refs!.length, 2);

			{
				const ref = refs![0];
				assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
				assert.deepStrictEqual(ref.range.start.line, 0);
			}
			{
				const ref = refs![1];
				assert.deepStrictEqual(ref.uri.toString(), docUri.toString());
				assert.deepStrictEqual(ref.range.start.line, 2);
			}
		});
	});
});
