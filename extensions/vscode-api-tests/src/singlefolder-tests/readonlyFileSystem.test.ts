/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFS } from '../memfs';
import { assertNoRpc, closeAllEditors } from '../utils';

suite('vscode API - file system', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('readonly file system - boolean', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = vscode.workspace.registerFileSystemProvider(fs.scheme, fs, { isReadonly: true });
		let error: any | undefined;
		try {
			await vscode.workspace.fs.writeFile(vscode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(vscode.workspace.fs.isWritableFileSystem('this-fs'), false);
		assert.strictEqual(error instanceof vscode.FileSystemError, true);
		const fileError: vscode.FileSystemError = error;
		assert.strictEqual(fileError.code, 'NoPermissions');
		reg.dispose();
	});

	test('readonly file system - markdown', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = vscode.workspace.registerFileSystemProvider(fs.scheme, fs, { isReadonly: new vscode.MarkdownString('This file is readonly.') });
		let error: any | undefined;
		try {
			await vscode.workspace.fs.writeFile(vscode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(vscode.workspace.fs.isWritableFileSystem('this-fs'), false);
		assert.strictEqual(error instanceof vscode.FileSystemError, true);
		const fileError: vscode.FileSystemError = error;
		assert.strictEqual(fileError.code, 'NoPermissions');
		reg.dispose();
	});

	test('writeable file system', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = vscode.workspace.registerFileSystemProvider(fs.scheme, fs);
		let error: any | undefined;
		try {
			await vscode.workspace.fs.writeFile(vscode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(vscode.workspace.fs.isWritableFileSystem('this-fs'), true);
		assert.strictEqual(error, undefined);
		reg.dispose();
	});
});
