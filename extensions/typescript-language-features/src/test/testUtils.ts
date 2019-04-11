/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

function rndName() {
	return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
}

export function createRandomFile(contents = '', fileExtension = 'txt'): Thenable<vscode.Uri> {
	return new Promise((resolve, reject) => {
		const tmpFile = join(os.tmpdir(), rndName() + '.' + fileExtension);
		fs.writeFile(tmpFile, contents, (error) => {
			if (error) {
				return reject(error);
			}

			resolve(vscode.Uri.file(tmpFile));
		});
	});
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

export const CURSOR = '$$CURSOR$$';

export function withRandomFileEditor(
	contents: string,
	fileExtension: string,
	run: (editor: vscode.TextEditor, doc: vscode.TextDocument) => Thenable<void>
): Thenable<boolean> {
	const cursorIndex = contents.indexOf(CURSOR);
	return createRandomFile(contents.replace(CURSOR, ''), fileExtension).then(file => {
		return vscode.workspace.openTextDocument(file).then(doc => {
			return vscode.window.showTextDocument(doc).then((editor) => {
				if (cursorIndex >= 0) {
					const pos = doc.positionAt(cursorIndex);
					editor.selection = new vscode.Selection(pos, pos);
				}
				return run(editor, doc).then(_ => {
					if (doc.isDirty) {
						return doc.save().then(() => {
							return deleteFile(file);
						});
					} else {
						return deleteFile(file);
					}
				});
			});
		});
	});
}