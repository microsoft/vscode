/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { TabInputText, Uri, window, workspace } from 'vscode';
import { IIPCHandler, IIPCServer } from '../ipc/ipcServer';
import { EmptyDisposable, IDisposable, isWindows } from '../util';

interface GitEditorRequest {
	commitMessagePath?: string;
}

export class GitEditor implements IIPCHandler {

	private disposable: IDisposable = EmptyDisposable;

	constructor(private ipc?: IIPCServer) {
		if (ipc) {
			this.disposable = ipc.registerHandler('git-editor', this);
		}
	}

	async handle({ commitMessagePath }: GitEditorRequest): Promise<any> {
		if (commitMessagePath) {
			const id = uuid();
			const uri = Uri.parse(`gitcommit://${id}${isWindows ? '/' : ''}${commitMessagePath}`);
			const doc = await workspace.openTextDocument(uri);
			await window.showTextDocument(doc, { preview: false });

			return new Promise((c) => {
				const onDidClose = window.tabGroups.onDidChangeTabs(async (tabs) => {
					if (tabs.closed.some(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString())) {
						onDidClose.dispose();

						await workspace.fs.writeFile(Uri.file(commitMessagePath), await workspace.fs.readFile(uri));
						await workspace.fs.delete(uri);
						return c(true);
					}
				});
			});
		}
	}

	getEnv(): { [key: string]: string } {
		if (!this.ipc) {
			const fileType = process.platform === 'win32' ? 'bat' : 'sh';
			const gitEditor = path.join(__dirname, `scripts/git-editor-empty.${fileType}`);

			return {
				GIT_EDITOR: `'${gitEditor}'`
			};
		}

		const fileType = process.platform === 'win32' ? 'bat' : 'sh';
		const gitEditor = path.join(__dirname, `scripts/git-editor.${fileType}`);

		return {
			GIT_EDITOR: `'${gitEditor}'`,
			VSCODE_GIT_EDITOR_NODE: process.execPath,
			VSCODE_GIT_EDITOR_MAIN: path.join(__dirname, 'main.js')
		};
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
