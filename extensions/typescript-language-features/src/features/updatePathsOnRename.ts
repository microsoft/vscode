/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import BufferSyncSupport from './bufferSyncSupport';
import FileConfigurationManager from './fileConfigurationManager';

export class UpdatePathsOnFileRenameHandler {
	private readonly _onDidRenameSub: vscode.Disposable;

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly bufferSyncSupport: BufferSyncSupport,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly handles: (uri: vscode.Uri) => Promise<boolean>,
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
		if (!this.client.apiVersion.has290Features) {
			return;
		}
		if (!await this.handles(newResource)) {
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

		// Make sure TS knows about file
		const document = await vscode.workspace.openTextDocument(newResource);
		this.bufferSyncSupport.openTextDocument(document);

		const edits = await this.getEditsForFileRename(document, oldFile, newFile);
		if (edits) {
			await vscode.workspace.applyEdit(edits);
		}
	}

	private async getEditsForFileRename(
		document: vscode.TextDocument,
		oldFile: string,
		newFile: string,
	) {
		await this.fileConfigurationManager.ensureConfigurationForDocument(document, undefined);

		const args: Proto.GetEditsForFileRenameRequestArgs = {
			file: newFile,
			oldFilePath: oldFile,
			newFilePath: newFile,
		};
		const response = await this.client.execute('getEditsForFileRename', args);
		if (!response || !response.body) {
			return;
		}

		return typeConverters.WorkspaceEdit.fromFromFileCodeEdits(this.client, response.body);
	}
}
