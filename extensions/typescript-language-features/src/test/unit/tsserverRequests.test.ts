/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { createRandomFile, deleteFile } from '../testUtils';

suite('TypeScript server requests', () => {
	suiteSetup(async () => {
		await vscode.extensions.getExtension('vscode.typescript-language-features')!.activate();
	});

	test('rejects a file URI that has no loaded document', async () => {
		const uri = await createRandomFile('const value = 1;', 'ts');
		try {
			assert.strictEqual(vscode.workspace.textDocuments.some(document => document.uri.toString() === uri.toString()), false);
			await assert.rejects(async () => vscode.commands.executeCommand(
				'typescript.tsserverRequest',
				'quickinfo',
				{ file: uri, line: 1, offset: 7 },
			), /Cannot send a TypeScript server request for an unloaded or unsupported document/);
		} finally {
			await deleteFile(uri);
		}
	});

	test('resolves a file URI after loading the document without showing an editor', async () => {
		const uri = await createRandomFile('const value = 1;', 'ts');
		try {
			await vscode.workspace.openTextDocument(uri);
			const response = await vscode.commands.executeCommand<{ body: { displayString: string } }>(
				'typescript.tsserverRequest',
				'quickinfo',
				{ file: uri, line: 1, offset: 7 },
			);
			assert.strictEqual(response?.body.displayString, 'const value: 1');
		} finally {
			await deleteFile(uri);
		}
	});
});
