/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, TabInputText, Uri, window } from 'vscode';
import { GitEditor } from '../gitEditor';

suite('git editor', () => {
	let tmpDir: string;

	setup(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-editor-'));
		await commands.executeCommand('workbench.action.closeAllEditors');
	});

	teardown(async () => {
		await commands.executeCommand('workbench.action.closeAllEditors');
		await commands.executeCommand('workbench.action.editorLayoutSingle');
		// The workbench releases its watcher on the closed editors asynchronously,
		// which keeps the directory locked on Windows for a short while
		await fs.promises.rm(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	function isOpen(uri: Uri): boolean {
		return window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof TabInputText && tab.input.uri.toString() === uri.toString()));
	}

	test('keeps waiting for the commit message when its editor moves to another group', async () => {
		const otherPath = path.join(tmpDir, 'file.txt');
		fs.writeFileSync(otherPath, 'content');
		await window.showTextDocument(Uri.file(otherPath), { preview: false });

		const commitMessagePath = path.join(tmpDir, 'COMMIT_EDITMSG');
		fs.writeFileSync(commitMessagePath, '');

		const gitEditor = new GitEditor();
		let resolved = false;
		const result = gitEditor.handle({ commitMessagePath }).then(value => {
			resolved = true;
			return value;
		});

		const uri = Uri.file(commitMessagePath);
		while (!isOpen(uri)) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		await commands.executeCommand('workbench.action.moveEditorToRightGroup');
		await new Promise(resolve => setTimeout(resolve, 500));

		const state = { groups: window.tabGroups.all.length, open: isOpen(uri), resolved };

		await commands.executeCommand('workbench.action.closeAllEditors');
		const value = await result;

		assert.deepStrictEqual({ ...state, value }, { groups: 2, open: true, resolved: false, value: true });
		gitEditor.dispose();
	});
});
