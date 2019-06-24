/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { posix } from 'path';

suite('workspace-fs', () => {

	let root: vscode.Uri;

	suiteSetup(function () {
		root = vscode.workspace.workspaceFolders![0]!.uri;
	});

	test('fs.stat', async function () {
		const stat = await vscode.workspace.fs.stat(root);
		assert.equal(stat.type, vscode.FileType.Directory);

		assert.equal(typeof stat.size, 'number');
		assert.equal(typeof stat.mtime, 'number');
		assert.equal(typeof stat.ctime, 'number');


		const entries = await vscode.workspace.fs.readDirectory(root);
		assert.ok(entries.length > 0);

		// find far.js
		const tuple = entries.find(tuple => tuple[0] === 'far.js')!;
		assert.ok(tuple);
		assert.equal(tuple[0], 'far.js');
		assert.equal(tuple[1], vscode.FileType.File);
	});

	test('fs.stat - bad scheme', async function () {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.parse('foo:/bar/baz/test.txt'));
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('fs.stat - missing file', async function () {
		try {
			await vscode.workspace.fs.stat(root.with({ path: root.path + '.bad' }));
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
	});

	test('fs.write/stat/delete', async function () {

		const uri = root.with({ path: posix.join(root.path, 'new.file') });
		await vscode.workspace.fs.writeFile(uri, Buffer.from('HELLO'));

		const stat = await vscode.workspace.fs.stat(uri);
		assert.equal(stat.type, vscode.FileType.File);

		await vscode.workspace.fs.delete(uri);

		try {
			await vscode.workspace.fs.stat(uri);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('fs.delete folder', async function () {

		const folder = root.with({ path: posix.join(root.path, 'folder') });
		const file = root.with({ path: posix.join(root.path, 'folder/file') });

		await vscode.workspace.fs.createDirectory(folder);
		await vscode.workspace.fs.writeFile(file, Buffer.from('FOO'));

		await vscode.workspace.fs.stat(folder);
		await vscode.workspace.fs.stat(file);

		// ensure non empty folder cannot be deleted
		try {
			await vscode.workspace.fs.delete(folder, { recursive: false });
			assert.ok(false);
		} catch {
			await vscode.workspace.fs.stat(folder);
			await vscode.workspace.fs.stat(file);
		}

		// ensure non empty folder cannot be deleted is DEFAULT
		try {
			await vscode.workspace.fs.delete(folder); // recursive: false as default
			assert.ok(false);
		} catch {
			await vscode.workspace.fs.stat(folder);
			await vscode.workspace.fs.stat(file);
		}

		// delete non empty folder with recursive-flag
		await vscode.workspace.fs.delete(folder, { recursive: true });

		// esnure folder/file are gone
		try {
			await vscode.workspace.fs.stat(folder);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
		try {
			await vscode.workspace.fs.stat(file);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});
});
