/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

export class UpdatePathsOnFileRenameHandler {
	private readonly _onDidRenameSub: vscode.Disposable;

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly handles: (uri: vscode.Uri) => boolean,
	) {
		this._onDidRenameSub = vscode.workspace.onDidRenameResource(e => {
			this.doRename(e.oldResource, e.newResource);
		});
	}

	public dispose() {
		this._onDidRenameSub.dispose();
	}

	private async doRename(
		oldResource: vscode.Uri,
		newResource: vscode.Uri,
	): Promise<void> {
		if (!this.handles(newResource)) {
			return;
		}

		if (!this.client.apiVersion.has290Features) {
			return;
		}

		const newFile = this.client.normalizePath(newResource);
		if (!newFile) {
			return;
		}

		const oldFile = this.client.normalizePath(oldResource);
		if (!oldFile) {
			return;
		}

		const args: Proto.GetEditsForFileRenameRequestArgs = {
			file: newFile,
			oldFilePath: oldFile,
			newFilePath: newFile,
		};

		await new Promise(resolve => setTimeout(resolve, 1000));

		const response = await this.client.execute('getEditsForFileRename', args);
		if (!response || !response.body) {
			return;
		}

		const edit = typeConverters.WorkspaceEdit.fromFromFileCodeEdits(this.client, response.body);
		await vscode.workspace.applyEdit(edit);
	}
}
