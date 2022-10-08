/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as os from 'os';
import { join } from 'path';
import assert = require('assert');

export function rndName() {
	let name = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 10; i++) {
		name += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return name;
}

export async function createRandomFile(contents = '', fileExtension = 'txt'): Promise<vscode.Uri> {
	const tmpFile = join(os.tmpdir(), rndName() + '.' + fileExtension);
	const fileUri = vscode.Uri.file(tmpFile);
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(contents));
	return fileUri;
}

export function pathEquals(path1: string, path2: string): boolean {
	if (process.platform !== 'linux') {
		path1 = path1.toLowerCase();
		path2 = path2.toLowerCase();
	}

	return path1 === path2;
}

export function deleteFile(file: vscode.Uri): Thenable<boolean> {
	return vscode.workspace.fs.delete(file).then(() => {
		return true;
	}, (reason) => {
		return !reason; // assume deletion failed if there is a reason
	});
}

export function closeAllEditors(): Thenable<unknown> {
	return vscode.commands.executeCommand<unknown>('workbench.action.closeAllEditors');
}

export async function withRandomFileEditor(initialContents: string, fileExtension: string = 'txt', run: (editor: vscode.TextEditor, doc: vscode.TextDocument) => Thenable<void>): Promise<boolean> {
	const file = await createRandomFile(initialContents, fileExtension);
	const doc = await vscode.workspace.openTextDocument(file);
	const editor = await vscode.window.showTextDocument(doc);
	await run(editor, doc);
	if (doc.isDirty) {
		const saved = await doc.save();
		assert.ok(saved);
		assert.ok(!doc.isDirty);
		return deleteFile(file);
	} else {
		return deleteFile(file);
	}
}
