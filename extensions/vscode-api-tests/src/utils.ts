/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

function rndName() {
	return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
}

export function createRandomFile(contents = ''): Thenable<vscode.Uri> {
	return new Promise((resolve, reject) => {
		const tmpFile = join(os.tmpdir(), rndName());
		fs.writeFile(tmpFile, contents, (error) => {
			if (error) {
				return reject(error);
			}

			resolve(vscode.Uri.file(tmpFile));
		});
	});
}

export function pathEquals(path1: string, path2: string): boolean {
	if (process.platform !== 'linux') {
		path1 = path1.toLowerCase();
		path2 = path2.toLowerCase();
	}

	return path1 === path2;
}

export function deleteFile(file: vscode.Uri): Thenable<boolean> {
	return new Promise((resolve, reject) => {
		fs.unlink(file.fsPath, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve(true);
			}
		});
	});
}

export function cleanUp(): Thenable<any> {
	return new Promise((resolve, reject) => {
		if (vscode.window.visibleTextEditors.length === 0) {
			return resolve();
		}

		const reg = vscode.window.onDidChangeVisibleTextEditors(editors => {
			if (editors.length === 0) {
				resolve();
				reg.dispose();
			}
		});

		vscode.commands.executeCommand('workbench.action.closeAllEditors').then(undefined, reject);

	}).then(() => {
		assert.equal(vscode.window.visibleTextEditors.length, 0);
		assert(!vscode.window.activeTextEditor);

		// TODO: we can't yet make this assertion because when
		// the phost creates a document and makes no changes to it,
		// the main side doesn't know about it and the phost side
		// assumes it exists. Calling closeAllFiles will not
		// remove it from textDocuments array. :(

		// assert.equal(vscode.workspace.textDocuments.length, 0);
	});
}
