/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { NotebookProvider } from './notebookProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log(context.extensionPath);

	context.subscriptions.push(vscode.window.registerNotebookProvider('jupyter', new NotebookProvider(context.extensionPath, true)));
	context.subscriptions.push(vscode.window.registerNotebookProvider('jupyterTest', new NotebookProvider(context.extensionPath, false)));

	vscode.commands.registerCommand('notebook.saveToMarkdown', () => {
		if (vscode.window.activeNotebookDocument) {
			let document = vscode.window.activeNotebookDocument;
			let uri = document.uri;
			let fsPath = uri.fsPath;
			let baseName = path.basename(fsPath, path.extname(fsPath));
			let newFSPath = path.join(path.dirname(fsPath), baseName + '.md');

			let content = '';

			for (let i = 0; i < document.cells.length; i++) {
				let cell = document.cells[i];
				let language = cell.language ?? '';
				if (cell.cell_type === 'markdown') {
					content += cell.getContent() + '\n';
				} else {
					content += '```' + language + '\n' + cell.getContent() + '```\n\n';
				}
			}

			fs.writeFileSync(newFSPath, content);
		}
	});
}

