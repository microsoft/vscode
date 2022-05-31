/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { TabInputText, Uri, window, workspace } from 'vscode';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';
import { EmptyDisposable, IDisposable } from './util';

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
			const uri = Uri.file(commitMessagePath);
			const doc = await workspace.openTextDocument(uri);
			await window.showTextDocument(doc, { preview: false });

			return new Promise((c) => {
				const onDidClose = window.tabGroups.onDidChangeTabs(async (tabs) => {
					if (tabs.closed.some(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString())) {
						onDidClose.dispose();
						return c(true);
					}
				});
			});
		}
	}

	getEnv(): { [key: string]: string } {
		if (!this.ipc) {
			return {
				GIT_EDITOR: `"${path.join(__dirname, 'git-editor-empty.sh')}"`
			};
		}

		let env: { [key: string]: string } = {
			VSCODE_GIT_EDITOR_NODE: process.execPath,
			VSCODE_GIT_EDITOR_EXTRA_ARGS: (process.versions['electron'] && process.versions['microsoft-build']) ? '--ms-enable-electron-run-as-node' : '',
			VSCODE_GIT_EDITOR_MAIN: path.join(__dirname, 'git-editor-main.js')
		};

		const config = workspace.getConfiguration('git');
		if (config.get<boolean>('useEditorAsCommitInput')) {
			env.GIT_EDITOR = `"${path.join(__dirname, 'git-editor.sh')}"`;
		}

		return env;
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
