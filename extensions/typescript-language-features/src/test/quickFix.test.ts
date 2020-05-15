/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { join } from 'path';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';
import { createTestEditor, joinLines, wait } from './testUtils';

suite('TypeScript Quick Fix', () => {

	const _disposables: vscode.Disposable[] = [];

	teardown(async () => {
		disposeAll(_disposables);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Fix all should not be marked as preferred #97866', async () => {
		const testDocumentUri = vscode.Uri.parse('untitled:test.ts');

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

	test('Add import should be a preferred fix if there is only one possible import', async () => {
		await createTestEditor(workspaceFile('foo.ts'),
			`export const foo = 1;`);

		const editor = await createTestEditor(workspaceFile('index.ts'),
			`export const _ = 1;`,
			`foo$0;`
		);

		await wait(3000);

		await vscode.commands.executeCommand('editor.action.autoFix');

		await wait(500);

		assert.strictEqual(editor.document.getText(), joinLines(
			`import { foo } from "./foo";`,
			``,
			`export const _ = 1;`,
			`foo;`
		));
	});

	test('Add import should not be a preferred fix if are multiple possible imports', async () => {
		await createTestEditor(workspaceFile('foo.ts'),
			`export const foo = 1;`);

		await createTestEditor(workspaceFile('bar.ts'),
			`export const foo = 1;`);

		const editor = await createTestEditor(workspaceFile('index.ts'),
			`export const _ = 1;`,
			`foo$0;`
		);

		await wait(3000);

		await vscode.commands.executeCommand('editor.action.autoFix');

		await wait(500);

		assert.strictEqual(editor.document.getText(), joinLines(
			`export const _ = 1;`,
			`foo;`
		));
	});
});


function workspaceFile(fileName: string) {
	return vscode.Uri.file(join(vscode.workspace.rootPath!, fileName));
}

