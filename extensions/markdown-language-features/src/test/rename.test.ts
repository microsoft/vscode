/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { MdReferencesProvider } from '../languageFeatures/references';
import { MdRenameProvider } from '../languageFeatures/rename';
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
	const renameProvider = new MdRenameProvider(referencesProvider, githubSlugifier);
	return renameProvider.prepareRename(doc, pos, noopToken);
}

/**
 * Get all the edits for the rename.
 */
function getRenameEdits(doc: InMemoryDocument, pos: vscode.Position, newName: string, workspaceContents: MdWorkspaceContents) {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const referencesProvider = new MdReferencesProvider(linkProvider, workspaceContents, engine, githubSlugifier);
	const renameProvider = new MdRenameProvider(referencesProvider, githubSlugifier);
	return renameProvider.provideRenameEdits(doc, pos, newName, noopToken);
}

function assertEditsEqual(actualEdit: vscode.WorkspaceEdit, ...expectedEdits: { uri: vscode.Uri; edits: vscode.TextEdit[] }[]) {
	const actualEntries = actualEdit.entries();
	assert.strictEqual(actualEntries.length, expectedEdits.length, `Reference counts should match`);

	for (let i = 0; i < actualEntries.length; ++i) {
		const actual = actualEntries[i];
		const expected = expectedEdits[i];
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

	test('Rename should not be supported on bare file link', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](./doc.md)`,
			`[other](./doc.md)`,
		));

		await assert.rejects(prepareRename(doc, new vscode.Position(0, 10), new InMemoryWorkspaceMarkdownDocuments([doc])));
	});

	test('Rename should not be supported on bare file link in definition', async () => {
		const uri = workspacePath('doc.md');
		const doc = new InMemoryDocument(uri, joinLines(
			`[text](./doc.md)`,
			`[ref]: ./doc.md`,
		));

		await assert.rejects(prepareRename(doc, new vscode.Position(1, 10), new InMemoryWorkspaceMarkdownDocuments([doc])));
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
});
