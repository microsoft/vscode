/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('mapped edits provider', () => {

	test('mapped edits does not provide edits for unregistered langs', async function () {

		const uri = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', './myFile.ts'));

		const tsDocFilter = [{ language: 'json' }];

		const r1 = vscode.chat.registerMappedEditsProvider(tsDocFilter, {
			provideMappedEdits: (_doc: vscode.TextDocument, codeBlocks: string[], context: vscode.MappedEditsContext, _token: vscode.CancellationToken) => {

				assert(context.selections.length === 1);
				assert(context.related.length === 1);
				assert('uri' in context.related[0] && 'range' in context.related[0]);

				const edit = new vscode.WorkspaceEdit();
				const text = codeBlocks.join('\n//----\n');
				edit.replace(uri, context.selections[0], text);
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
				selections: [new vscode.Selection(0, 0, 1, 0)],
				related: [
					{
						uri,
						range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
					}
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

				assert(context.selections.length === 1);
				assert(context.related.length === 1);
				assert('uri' in context.related[0] && 'range' in context.related[0]);

				const edit = new vscode.WorkspaceEdit();
				const text = codeBlocks.join('\n//----\n');
				edit.replace(uri, context.selections[0], text);
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
				selections: [new vscode.Selection(0, 0, 1, 0)],
				related: [
					{
						uri,
						range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
					}
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
