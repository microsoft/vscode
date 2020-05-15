/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';
import { createTestEditor, joinLines, wait } from './testUtils';

const testDocumentUri = vscode.Uri.parse('untitled:test.ts');


suite('TypeScript Quick Fix', () => {

	const _disposables: vscode.Disposable[] = [];

	teardown(async () => {
		disposeAll(_disposables);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Fix all should not be marked as preferred #97866', async () => {
		const editor = await createTestEditor(testDocumentUri,
			`export const _ = 1;`,
			`const a$0 = 1;`,
			`const b = 2;`,
		);

		await wait(2000);

		await vscode.commands.executeCommand('editor.action.autoFix');

		await wait(500);

		assert.strictEqual(editor.document.getText(), joinLines(
			`export const _ = 1;`,
			`const b = 2;`,
		));
	});
});
