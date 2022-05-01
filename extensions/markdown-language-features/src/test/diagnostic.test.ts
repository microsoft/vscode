/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';
import { DiagnosticManager } from '../languageFeatures/diagnostics';
import { MdLinkProvider } from '../languageFeatures/documentLinkProvider';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdWorkspaceContents } from '../workspaceContents';
import { createNewMarkdownEngine } from './engine';
import { InMemoryWorkspaceMarkdownDocuments } from './inMemoryWorkspace';
import { assertRangeEqual, joinLines, noopToken, workspacePath } from './util';


function getDiagnostics(doc: InMemoryDocument, workspaceContents: MdWorkspaceContents) {
	const engine = createNewMarkdownEngine();
	const linkProvider = new MdLinkProvider(engine);
	const manager = new DiagnosticManager(engine, workspaceContents, linkProvider);
	return manager.getDiagnostics(doc, noopToken);
}


suite.only('markdown: Diagnostics', () => {
	test('Should not return any diagnostics for empty document', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`text`,
		));

		const diagnostics = await getDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics, []);
	});

	test('Should generate diagnostic for link to file that does not exist', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[bad](/no/such/file.md)`,
			`[good](/doc.md)`,
		));

		const diagnostics = await getDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics.length, 1);
		assertRangeEqual(new vscode.Range(0, 6, 0, 22), diagnostics[0].range);
	});

	test('Should generate diagnostics for links to header that does not exist in current file', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good](#good-header)`,
			`# Good Header`,
			`[bad](#no-such-header)`,
			`[good](#good-header)`,
		));

		const diagnostics = await getDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics.length, 1);
		assertRangeEqual(new vscode.Range(2, 6, 2, 21), diagnostics[0].range);
	});

	test('Should generate diagnostics for links to non-existent headers in other files', async () => {
		const doc1 = new InMemoryDocument(workspacePath('doc1.md'), joinLines(
			`# My header`,
			`[good](#my-header)`,
			`[good](/doc1.md#my-header)`,
			`[good](doc1.md#my-header)`,
			`[good](/doc2.md#other-header)`,
			`[bad](/doc2.md#no-such-other-header)`,
		));

		const doc2 = new InMemoryDocument(workspacePath('doc2.md'), joinLines(
			`# Other header`,
		));

		const diagnostics = await getDiagnostics(doc1, new InMemoryWorkspaceMarkdownDocuments([doc1, doc2]));
		assert.deepStrictEqual(diagnostics.length, 1);
		assertRangeEqual(new vscode.Range(5, 6, 5, 35), diagnostics[0].range);
	});

	test('Should support links both with and without .md file extension', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`# My header`,
			`[good](#my-header)`,
			`[good](/doc.md#my-header)`,
			`[good](doc.md#my-header)`,
			`[good](/doc#my-header)`,
			`[good](doc#my-header)`,
		));

		const diagnostics = await getDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics.length, 0);
	});

	test('Should generate diagnostics for non-existent link reference', async () => {
		const doc = new InMemoryDocument(workspacePath('doc.md'), joinLines(
			`[good link][good]`,
			`[bad link][no-such]`,
			``,
			`[good]: http://example.com`,
		));

		const diagnostics = await getDiagnostics(doc, new InMemoryWorkspaceMarkdownDocuments([doc]));
		assert.deepStrictEqual(diagnostics.length, 1);
		assertRangeEqual(new vscode.Range(1, 11, 1, 18), diagnostics[0].range);
	});
});
