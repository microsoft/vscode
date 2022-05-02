/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { MdReferencesProvider } from '../languageFeatures/references';
import { MdRenameProvider, MdWorkspaceEdit } from '../languageFeatures/rename';
import { githubSlugifier } from '../slugify';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { assertRangeEqual, joinLines, noopToken, workspacePath } from './util';


/**
 * Get prepare rename info.
 */
function prepareRename(doc: InMemoryDocument, pos: vscode.Position, workspaceContents: MdWorkspaceContents): Promise<undefined | { readonly range: vscode.Range; readonly placeholder: string }> {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const referencesProvider = new MdReferencesProvider(linkProvider, workspaceContents, engine, githubSlugifier);
	const renameProvider = new MdRenameProvider(referencesProvider, workspaceContents, githubSlugifier);
	return renameProvider.prepareRename(doc, pos, noopToken);
}

/**
 * Get all the edits for the rename.
 */
function getRenameEdits(doc: InMemoryDocument, pos: vscode.Position, newName: string, workspaceContents: MdWorkspaceContents): Promise<MdWorkspaceEdit | undefined> {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const referencesProvider = new MdReferencesProvider(linkProvider, workspaceContents, engine, githubSlugifier);
	const renameProvider = new MdRenameProvider(referencesProvider, workspaceContents, githubSlugifier);
	return renameProvider.provideRenameEditsImpl(doc, pos, newName, noopToken);
}

interface ExpectedTextEdit {
	readonly uri: vscode.Uri;
	readonly edits: readonly vscode.TextEdit[];
}

interface ExpectedFileRename {
	readonly originalUri: vscode.Uri;
	readonly newUri: vscode.Uri;
}

function assertEditsEqual(actualEdit: MdWorkspaceEdit, ...expectedEdits: ReadonlyArray<ExpectedTextEdit | ExpectedFileRename>) {
	// Check file renames
	const expectedFileRenames = expectedEdits.filter(expected => 'originalUri' in expected) as ExpectedFileRename[];
	const actualFileRenames = actualEdit.fileRenames ?? [];
	assert.strictEqual(actualFileRenames.length, expectedFileRenames.length, `File rename count should match`);
	for (let i = 0; i < actualFileRenames.length; ++i) {
		const expected = expectedFileRenames[i];
		const actual = actualFileRenames[i];
		assert.strictEqual(actual.from.toString(), expected.originalUri.toString(), `File rename '${i}' should have expected 'from' resource`);
		assert.strictEqual(actual.to.toString(), expected.newUri.toString(), `File rename '${i}' should have expected 'to' resource`);
	}

	// Check text edits
	const actualTextEdits = actualEdit.edit.entries();
	const expectedTextEdits = expectedEdits.filter(expected => 'edits' in expected) as ExpectedTextEdit[];
	assert.strictEqual(actualTextEdits.length, expectedTextEdits.length, `Reference counts should match`);
	for (let i = 0; i < actualTextEdits.length; ++i) {
		const expected = expectedTextEdits[i];
		const actual = actualTextEdits[i];

		if ('edits' in expected) {
			assert.strictEqual(actual[0].toString(), expected.uri.toString(), `Ref '${i}' has expected document`);

			const actualEditForDoc = actual[1];
			const expectedEditsForDoc = expected.edits;
			assert.strictEqual(actualEditForDoc.length, expectedEditsForDoc.length, `Edit counts for '${actual[0]}' should match`);

			for (let g = 0; g < actualEditForDoc.length; ++g) {
				assertRangeEqual(actualEditForDoc[g].range, expectedEditsForDoc[g].range, `Edit '${g}' of '${actual[0]}' has expected expected range. Expected range: ${JSON.stringify(actualEditForDoc[g].range)}. Actual range: ${JSON.stringify(expectedEditsForDoc[g].range)}`);
				assert.strictEqual(actualEditForDoc[g].newText, expectedEditsForDoc[g].newText, `Edit '${g}' of '${actual[0]}' has expected edits`);
			}
		}
	}
}

suite('markdown: rename', () => {

	setup(async () => {
		// the tests make the assumption that link providers are already registered
		await vscode.extensions.getExtension('vscode.markdown-language-features')!.activate();
	});

	test('Rename on header should not include leading #', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`# abc`
		));

		const info = await prepareRename(doc, new vscode.Position(0, 0), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertRangeEqual(info!.range, new vscode.Range(0, 2, 0, 5));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 0), "New Header", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 2, 0, 5), 'New Header')
			]
		});
	});

	test('Rename on header should include leading or trailing #s', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### abc ###`
		));

		const info = await prepareRename(doc, new vscode.Position(0, 0), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertRangeEqual(info!.range, new vscode.Range(0, 4, 0, 7));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 0), "New Header", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 7), 'New Header')
			]
		});
	});

	test('Rename on header should pick up links in doc', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`, // rename here
			`[text](#a-b-c)`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 0), "New Header", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
			]
		});
	});

	test('Rename on link should use slug for link', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`,
			`[text](#a-b-c)`, // rename here
		));

		const edit = await getRenameEdits(doc, new vscode.Position(1, 10), "New Header", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
			]
		});
	});

	test('Rename on link definition should work', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`,
			`[text](#a-b-c)`,
			`[ref]: #a-b-c`// rename here
		));

		const edit = await getRenameEdits(doc, new vscode.Position(2, 10), "New Header", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
				new vscode.TextEdit(new vscode.Range(2, 8, 2, 13), 'new-header'),
			]
		});
	});

	test('Rename on header should pick up links across files', async () => {
		const uri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`, // rename here
			`[text](#a-b-c)`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 0), "New Header", new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(otherUri, joinLines(
				`[text](#a-b-c)`, // Should not find this
				`[text](./doc.md#a-b-c)`, // But should find this
				`[text](./doc#a-b-c)`, // And this
			))
		]));
		assertEditsEqual(edit!, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
			]
		}, {
			uri: otherUri, edits: [
				new vscode.TextEdit(new vscode.Range(1, 16, 1, 21), 'new-header'),
				new vscode.TextEdit(new vscode.Range(2, 13, 2, 18), 'new-header'),
			]
		});
	});

	test('Rename on link should pick up links across files', async () => {
		const uri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`,
			`[text](#a-b-c)`,  // rename here
		));

		const edit = await getRenameEdits(doc, new vscode.Position(1, 10), "New Header", new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(otherUri, joinLines(
				`[text](#a-b-c)`, // Should not find this
				`[text](./doc.md#a-b-c)`, // But should find this
				`[text](./doc#a-b-c)`, // And this
			))
		]));
		assertEditsEqual(edit!, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
			]
		}, {
			uri: otherUri, edits: [
				new vscode.TextEdit(new vscode.Range(1, 16, 1, 21), 'new-header'),
				new vscode.TextEdit(new vscode.Range(2, 13, 2, 18), 'new-header'),
			]
		});
	});

	test('Rename on link in other file should pick up all refs', async () => {
		const uri = workspacePath('doc.md');
		const otherUri = workspacePath('other.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### A b C`,
			`[text](#a-b-c)`,
		));

		const otherDoc = new InMemoryDocument(otherUri, joinLines(
			`[text](#a-b-c)`,
			`[text](./doc.md#a-b-c)`,
			`[text](./doc#a-b-c)`
		));

		const expectedEdits = [
			{
				uri: uri, edits: [
					new vscode.TextEdit(new vscode.Range(0, 4, 0, 9), 'New Header'),
					new vscode.TextEdit(new vscode.Range(1, 8, 1, 13), 'new-header'),
				]
			}, {
				uri: otherUri, edits: [
					new vscode.TextEdit(new vscode.Range(1, 16, 1, 21), 'new-header'),
					new vscode.TextEdit(new vscode.Range(2, 13, 2, 18), 'new-header'),
				]
			}
		];

		{
			// Rename on header with file extension
			const edit = await getRenameEdits(otherDoc, new vscode.Position(1, 17), "New Header", new InMemoryWorkspaceMarkdownDocuments([
				doc,
				otherDoc
			]));
			assertEditsEqual(edit!, ...expectedEdits);
		}
		{
			// Rename on header without extension
			const edit = await getRenameEdits(otherDoc, new vscode.Position(2, 15), "New Header", new InMemoryWorkspaceMarkdownDocuments([
				doc,
				otherDoc
			]));
			assertEditsEqual(edit!, ...expectedEdits);
		}
	});

	test('Rename on reference should rename references and definition', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text][ref]`, // rename here
			`[other][ref]`,
			``,
			`[ref]: https://example.com`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 8), "new ref", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 10), 'new ref'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 11), 'new ref'),
				new vscode.TextEdit(new vscode.Range(3, 1, 3, 4), 'new ref'),
			]
		});
	});

	test('Rename on definition should rename references and definitions', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text][ref]`,
			`[other][ref]`,
			``,
			`[ref]: https://example.com`, // rename here
		));

		const edit = await getRenameEdits(doc, new vscode.Position(3, 3), "new ref", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 10), 'new ref'),
				new vscode.TextEdit(new vscode.Range(1, 8, 1, 11), 'new ref'),
				new vscode.TextEdit(new vscode.Range(3, 1, 3, 4), 'new ref'),
			]
		});
	});

	test('Rename on definition entry should rename header and references', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`# a B c`,
			`[ref text][ref]`,
			`[direct](#a-b-c)`,
			`[ref]: #a-b-c`, // rename here
		));

		const preparedInfo = await prepareRename(doc, new vscode.Position(3, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.strictEqual(preparedInfo!.placeholder, 'a B c');
		assertRangeEqual(preparedInfo!.range, new vscode.Range(3, 8, 3, 13));

		const edit = await getRenameEdits(doc, new vscode.Position(3, 10), "x Y z", new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 2, 0, 7), 'x Y z'),
				new vscode.TextEdit(new vscode.Range(2, 10, 2, 15), 'x-y-z'),
				new vscode.TextEdit(new vscode.Range(3, 8, 3, 13), 'x-y-z'),
			]
		});
	});

	test('Rename should not be supported on link text', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`# Header`,
			`[text](#header)`,
		));

		await assert.rejects(prepareRename(doc, new vscode.Position(1, 2), new InMemoryWorkspaceMarkdownDocuments([doc])));
	});

	test('Path rename should use file path as range', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](./doc.md)`,
			`[ref]: ./doc.md`,
		));

		const info = await prepareRename(doc, new vscode.Position(0, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.strictEqual(info!.placeholder, './doc.md');
		assertRangeEqual(info!.range, new vscode.Range(0, 7, 0, 15));
	});

	test('Path rename\'s range should excludes fragment', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](./doc.md#some-header)`,
			`[ref]: ./doc.md#some-header`,
		));

		const info = await prepareRename(doc, new vscode.Position(0, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.strictEqual(info!.placeholder, './doc.md');
		assertRangeEqual(info!.range, new vscode.Range(0, 7, 0, 15));
	});

	test('Path rename should update file and all refs', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](./doc.md)`,
			`[ref]: ./doc.md`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 10), './sub/newDoc.md', new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			originalUri: uri,
			newUri: workspacePath('sub', 'newDoc.md'),
		}, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 15), './sub/newDoc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 15), './sub/newDoc.md'),
			]
		});
	});

	test('Path rename using absolute file path should anchor to workspace root', async () => {
		const uri = workspacePath('sub', 'doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](/sub/doc.md)`,
			`[ref]: /sub/doc.md`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 10), '/newSub/newDoc.md', new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			originalUri: uri,
			newUri: workspacePath('newSub', 'newDoc.md'),
		}, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 18), '/newSub/newDoc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 18), '/newSub/newDoc.md'),
			]
		});
	});

	test('Path rename should use un-encoded paths as placeholder', async () => {
		const uri = workspacePath('sub', 'doc with spaces.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](/sub/doc%20with%20spaces.md)`,
		));

		const info = await prepareRename(doc, new vscode.Position(0, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.strictEqual(info!.placeholder, '/sub/doc with spaces.md');
	});

	test('Path rename should encode paths', async () => {
		const uri = workspacePath('sub', 'doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](/sub/doc.md)`,
			`[ref]: /sub/doc.md`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 10), '/NEW sub/new DOC.md', new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			originalUri: uri,
			newUri: workspacePath('NEW sub', 'new DOC.md'),
		}, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 18), '/NEW%20sub/new%20DOC.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 18), '/NEW%20sub/new%20DOC.md'),
			]
		});
	});

	test('Path rename should work with unknown files', async () => {
		const uri1 = workspacePath('doc1.md');
		const doc1 = new InMemoryDocument(uri1, joinLines(
			`![img](/images/more/image.png)`,
			``,
			`[ref]: /images/more/image.png`,
		));

		const uri2 = workspacePath('sub', 'doc2.md');
		const doc2 = new InMemoryDocument(uri2, joinLines(
			`![img](/images/more/image.png)`,
		));

		const edit = await getRenameEdits(doc1, new vscode.Position(0, 10), '/img/test/new.png', new InMemoryWorkspaceMarkdownDocuments([
			doc1,
			doc2
		]));
		assertEditsEqual(edit!,
			// Should not have file edits since the files don't exist here
			{
				uri: uri1, edits: [
					new vscode.TextEdit(new vscode.Range(0, 7, 0, 29), '/img/test/new.png'),
					new vscode.TextEdit(new vscode.Range(2, 7, 2, 29), '/img/test/new.png'),
				]
			},
			{
				uri: uri2, edits: [
					new vscode.TextEdit(new vscode.Range(0, 7, 0, 29), '/img/test/new.png'),
				]
			});
	});

	test('Path rename should use .md extension on extension-less link', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](/doc#header)`,
			`[ref]: /doc#other`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(0, 10), '/new File', new InMemoryWorkspaceMarkdownDocuments([doc]));
		assertEditsEqual(edit!, {
			originalUri: uri,
			newUri: workspacePath('new File.md'), // Rename on disk should use file extension
		}, {
			uri: uri, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 11), '/new%20File'), // Links should continue to use extension-less paths
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 11), '/new%20File'),
			]
		});
	});

	// TODO: fails on windows
	test.skip('Path rename should use correctly resolved paths across files', async () => {
		const uri1 = workspacePath('sub', 'doc.md');
		const doc1 = new InMemoryDocument(uri1, joinLines(
			`[text](./doc.md)`,
			`[ref]: ./doc.md`,
		));

		const uri2 = workspacePath('doc2.md');
		const doc2 = new InMemoryDocument(uri2, joinLines(
			`[text](./sub/doc.md)`,
			`[ref]: ./sub/doc.md`,
		));

		const uri3 = workspacePath('sub2', 'doc3.md');
		const doc3 = new InMemoryDocument(uri3, joinLines(
			`[text](../sub/doc.md)`,
			`[ref]: ../sub/doc.md`,
		));

		const uri4 = workspacePath('sub2', 'doc4.md');
		const doc4 = new InMemoryDocument(uri4, joinLines(
			`[text](/sub/doc.md)`,
			`[ref]: /sub/doc.md`,
		));

		const edit = await getRenameEdits(doc1, new vscode.Position(0, 10), './new/new-doc.md', new InMemoryWorkspaceMarkdownDocuments([
			doc1, doc2, doc3, doc4,
		]));
		assertEditsEqual(edit!, {
			originalUri: uri1,
			newUri: workspacePath('sub', 'new', 'new-doc.md'),
		}, {
			uri: uri1, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 15), './new/new-doc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 15), './new/new-doc.md'),
			]
		}, {
			uri: uri2, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 19), './sub/new/new-doc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 19), './sub/new/new-doc.md'),
			]
		}, {
			uri: uri3, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 20), '../sub/new/new-doc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 20), '../sub/new/new-doc.md'),
			]
		}, {
			uri: uri4, edits: [
				new vscode.TextEdit(new vscode.Range(0, 7, 0, 18), '/sub/new/new-doc.md'),
				new vscode.TextEdit(new vscode.Range(1, 7, 1, 18), '/sub/new/new-doc.md'),
			]
		});
	});

	test('Path rename should resolve on links without prefix', async () => {
		const uri1 = workspacePath('sub', 'doc.md');
		const doc1 = new InMemoryDocument(uri1, joinLines(
			`![text](sub2/doc3.md)`,
		));

		const uri2 = workspacePath('doc2.md');
		const doc2 = new InMemoryDocument(uri2, joinLines(
			`![text](sub/sub2/doc3.md)`,
		));

		const uri3 = workspacePath('sub', 'sub2', 'doc3.md');
		const doc3 = new InMemoryDocument(uri3, joinLines());

		const edit = await getRenameEdits(doc1, new vscode.Position(0, 10), 'sub2/cat.md', new InMemoryWorkspaceMarkdownDocuments([
			doc1, doc2, doc3
		]));
		assertEditsEqual(edit!, {
			originalUri: workspacePath('sub', 'sub2', 'doc3.md'),
			newUri: workspacePath('sub', 'sub2', 'cat.md'),
		}, {
			uri: uri1, edits: [new vscode.TextEdit(new vscode.Range(0, 8, 0, 20), 'sub2/cat.md')]
		}, {
			uri: uri2, edits: [new vscode.TextEdit(new vscode.Range(0, 8, 0, 24), 'sub/sub2/cat.md')]
		});
	});

	test('Rename on link should use header text as placeholder', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`### a B c ###`,
			`[text](#a-b-c)`,
		));

		const info = await prepareRename(doc, new vscode.Position(1, 10), new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.strictEqual(info!.placeholder, 'a B c');
		assertRangeEqual(info!.range, new vscode.Range(1, 8, 1, 13));
	});

	test('Rename on http uri should work', async () => {
		const uri1 = workspacePath('doc.md');
		const uri2 = workspacePath('doc2.md');
		const doc = new InMemoryDocument(uri1, joinLines(
			`[1](http://example.com)`,
			`[2]: http://example.com`,
			`<http://example.com>`,
		));

		const edit = await getRenameEdits(doc, new vscode.Position(1, 10), "https://example.com/sub", new InMemoryWorkspaceMarkdownDocuments([
			doc,
			new InMemoryDocument(uri2, joinLines(
				`[4](http://example.com)`,
			))
		]));
		assertEditsEqual(edit!, {
			uri: uri1, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 22), 'https://example.com/sub'),
				new vscode.TextEdit(new vscode.Range(1, 5, 1, 23), 'https://example.com/sub'),
				new vscode.TextEdit(new vscode.Range(2, 1, 2, 19), 'https://example.com/sub'),
			]
		}, {
			uri: uri2, edits: [
				new vscode.TextEdit(new vscode.Range(0, 4, 0, 22), 'https://example.com/sub'),
			]
		});
	});
});
