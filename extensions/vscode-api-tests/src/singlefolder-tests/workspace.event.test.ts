/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { createRandomFile } from '../utils';

suite('workspace-event', () => {

	const disposables: vscode.Disposable[] = [];

	teardown(() => {
		for (const dispo of disposables) {
			dispo.dispose();
		}
		disposables.length = 0;
	});

	test('onWillCreate/onDidCreate', async function () {

		const base = await createRandomFile();
		const newUri = base.with({ path: base.path + '-foo' });

		let onWillCreate: vscode.FileWillCreateEvent | undefined;
		let onDidCreate: vscode.FileCreateEvent | undefined;

		disposables.push(vscode.workspace.onWillCreateFiles(e => onWillCreate = e));
		disposables.push(vscode.workspace.onDidCreateFiles(e => onDidCreate = e));

		const edit = new vscode.WorkspaceEdit();
		edit.createFile(newUri);

		const success = await vscode.workspace.applyEdit(edit);
		assert.ok(success);

		assert.ok(onWillCreate);
		assert.equal(onWillCreate?.files.length, 1);
		assert.equal(onWillCreate?.files[0].toString(), newUri.toString());

		assert.ok(onDidCreate);
		assert.equal(onDidCreate?.files.length, 1);
		assert.equal(onDidCreate?.files[0].toString(), newUri.toString());
	});

	test('onWillDelete/onDidDelete', async function () {

		const base = await createRandomFile();

		let onWilldelete: vscode.FileWillDeleteEvent | undefined;
		let onDiddelete: vscode.FileDeleteEvent | undefined;

		disposables.push(vscode.workspace.onWillDeleteFiles(e => onWilldelete = e));
		disposables.push(vscode.workspace.onDidDeleteFiles(e => onDiddelete = e));

		const edit = new vscode.WorkspaceEdit();
		edit.deleteFile(base);

		const success = await vscode.workspace.applyEdit(edit);
		assert.ok(success);

		assert.ok(onWilldelete);
		assert.equal(onWilldelete?.files.length, 1);
		assert.equal(onWilldelete?.files[0].toString(), base.toString());

		assert.ok(onDiddelete);
		assert.equal(onDiddelete?.files.length, 1);
		assert.equal(onDiddelete?.files[0].toString(), base.toString());
	});

	test('onWillRename/onDidRename', async function () {

		const oldUri = await createRandomFile();
		const newUri = oldUri.with({ path: oldUri.path + '-NEW' });

		let onWillRename: vscode.FileWillRenameEvent | undefined;
		let onDidRename: vscode.FileRenameEvent | undefined;

		disposables.push(vscode.workspace.onWillRenameFiles(e => onWillRename = e));
		disposables.push(vscode.workspace.onDidRenameFiles(e => onDidRename = e));

		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(oldUri, newUri);

		const success = await vscode.workspace.applyEdit(edit);
		assert.ok(success);

		assert.ok(onWillRename);
		assert.equal(onWillRename?.files.length, 1);
		assert.equal(onWillRename?.files[0].oldUri.toString(), oldUri.toString());
		assert.equal(onWillRename?.files[0].newUri.toString(), newUri.toString());

		assert.ok(onDidRename);
		assert.equal(onDidRename?.files.length, 1);
		assert.equal(onDidRename?.files[0].oldUri.toString(), oldUri.toString());
		assert.equal(onDidRename?.files[0].newUri.toString(), newUri.toString());
	});

	test('onWillRename - make changes', async function () {

		const oldUri = await createRandomFile('BAR');
		const newUri = oldUri.with({ path: oldUri.path + '-NEW' });

		const anotherFile = await createRandomFile('BAR');

		let onWillRename: vscode.FileWillRenameEvent | undefined;

		disposables.push(vscode.workspace.onWillRenameFiles(e => {
			onWillRename = e;
			const edit = new vscode.WorkspaceEdit();
			edit.insert(e.files[0].oldUri, new vscode.Position(0, 0), 'FOO');
			edit.replace(anotherFile, new vscode.Range(0, 0, 0, 3), 'FARBOO');
			e.waitUntil(Promise.resolve(edit));
		}));

		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(oldUri, newUri);

		const success = await vscode.workspace.applyEdit(edit);
		assert.ok(success);

		assert.ok(onWillRename);
		assert.equal(onWillRename?.files.length, 1);
		assert.equal(onWillRename?.files[0].oldUri.toString(), oldUri.toString());
		assert.equal(onWillRename?.files[0].newUri.toString(), newUri.toString());

		assert.equal((await vscode.workspace.openTextDocument(newUri)).getText(), 'FOOBAR');
		assert.equal((await vscode.workspace.openTextDocument(anotherFile)).getText(), 'FARBOO');
	});
});
