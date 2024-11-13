/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';

suite('mapped edits provider', () => {

	test('mapped edits does not provide edits for unregistered langs', async function () {

		const uri = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', './myFile.ts'));

		const tsDocFilter = [{ language: 'json' }];

		const r1 = vscode.chat.registerMappedEditsProvider(tsDocFilter, {
			provideMappedEdits: (_doc: vscode.TextDocument, codeBlocks: string[], context: vscode.MappedEditsContext, _token: vscode.CancellationToken) => {

				assert((context as any).selections.length === 1); // context.selections is for backward compat
				assert(context.documents.length === 1);

				const edit = new vscode.WorkspaceEdit();
				const text = codeBlocks.join('\n//----\n');
				edit.replace(uri, context.documents[0][0].ranges[0], text);
				return edit;
			}
		});
		await vscode.workspace.openTextDocument(uri);
		const result = await vscode.commands.executeCommand<vscode.ProviderResult<vscode.WorkspaceEdit | null>>(
			'vscode.executeMappedEditsProvider',
			uri,
			[
				'// hello',
				`function foo() {\n\treturn 1;\n}`,
			],
			{
				documents: [
					[
						{
							uri,
							version: 1,
							ranges: [
								new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
							]
						}
					]
				]
			}
		);
		r1.dispose();

		assert(result === null, 'returned null');
	});

	test('mapped edits provides a single edit replacing the selection', async function () {

		const uri = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', './myFile.ts'));

		const tsDocFilter = [{ language: 'typescript' }];

		const r1 = vscode.chat.registerMappedEditsProvider(tsDocFilter, {
			provideMappedEdits: (_doc: vscode.TextDocument, codeBlocks: string[], context: vscode.MappedEditsContext, _token: vscode.CancellationToken) => {

				const edit = new vscode.WorkspaceEdit();
				const text = codeBlocks.join('\n//----\n');
				edit.replace(uri, context.documents[0][0].ranges[0], text);
				return edit;
			}
		});

		await vscode.workspace.openTextDocument(uri);
		const result = await vscode.commands.executeCommand<vscode.ProviderResult<vscode.WorkspaceEdit | null>>(
			'vscode.executeMappedEditsProvider',
			uri,
			[
				'// hello',
				`function foo() {\n\treturn 1;\n}`,
			],
			{
				documents: [
					[
						{
							uri,
							version: 1,
							ranges: [
								new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
							]
						}
					]
				]
			}
		);
		r1.dispose();

		assert(result, 'non null response');
		const edits = result.get(uri);
		assert(edits.length === 1);
		assert(edits[0].range.start.line === 0);
		assert(edits[0].range.start.character === 0);
		assert(edits[0].range.end.line === 1);
		assert(edits[0].range.end.character === 0);
	});
});
