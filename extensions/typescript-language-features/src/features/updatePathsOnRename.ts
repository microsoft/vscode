/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import * as languageIds from '../utils/languageModeIds';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();

const updateImportsOnFileMoveName = 'updateImportsOnFileMove.enabled';

enum UpdateImportsOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

export class UpdateImportsOnFileRenameHandler {
	private readonly _onDidRenameSub: vscode.Disposable;

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly handles: (uri: vscode.Uri) => Promise<boolean>,
	) {
		this._onDidRenameSub = vscode.workspace.onDidRenameResource(e => {
			console.log(e.newResource);
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
		if (!this.client.apiVersion.gte(API.v290)) {
			return;
		}

		const handles = await this.handles(newResource);
		console.log(handles);
		if (!handles) {
			return;
		}


		const newFile = this.client.toPath(newResource);
		if (!newFile) {
			return;
		}

		const oldFile = this.client.toPath(oldResource);
		if (!oldFile) {
			return;
		}

		const document = await vscode.workspace.openTextDocument(newResource);

		const config = this.getConfiguration(document);
		const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
		if (setting === UpdateImportsOnFileMoveSetting.Never) {
			return;
		}

		// Make sure TS knows about file
		this.client.bufferSyncSupport.closeResource(oldResource);
		this.client.bufferSyncSupport.openTextDocument(document);

		const edits = await this.getEditsForFileRename(document, oldFile, newFile);
		if (!edits || !edits.size) {
			return;
		}

		console.log('x');
		if (await this.confirmActionWithUser(document)) {
			await vscode.workspace.applyEdit(edits);
		}
	}

	private async confirmActionWithUser(
		newDocument: vscode.TextDocument
	): Promise<boolean> {
		const config = this.getConfiguration(newDocument);
		const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
		switch (setting) {
			case UpdateImportsOnFileMoveSetting.Always:
				return true;
			case UpdateImportsOnFileMoveSetting.Never:
				return false;
			case UpdateImportsOnFileMoveSetting.Prompt:
			default:
				return this.promptUser(newDocument);
		}
	}

	private getConfiguration(newDocument: vscode.TextDocument) {
		return vscode.workspace.getConfiguration(isTypeScriptDocument(newDocument) ? 'typescript' : 'javascript', newDocument.uri);
	}

	private async promptUser(
		newDocument: vscode.TextDocument
	): Promise<boolean> {
		enum Choice {
			None = 0,
			Accept = 1,
			Reject = 2,
			Always = 3,
			Never = 4,
		}

		interface Item extends vscode.MessageItem {
			choice: Choice;
		}

		const response = await vscode.window.showInformationMessage<Item>(
			localize('prompt', "Automatically update imports for moved file: '{0}'?", path.basename(newDocument.fileName)), {
				modal: true,
			},
			{
				title: localize('reject.title', "No"),
				choice: Choice.Reject,
				isCloseAffordance: true,
			},
			{
				title: localize('accept.title', "Yes"),
				choice: Choice.Accept,
			},
			{
				title: localize('always.title', "Yes, always update imports"),
				choice: Choice.Always,
			},
			{
				title: localize('never.title', "No, never update imports"),
				choice: Choice.Never,
			});

		if (!response) {
			return false;
		}

		switch (response.choice) {
			case Choice.Accept:
				{
					return true;
				}
			case Choice.Reject:
				{
					return false;
				}
			case Choice.Always:
				{
					const config = this.getConfiguration(newDocument);
					config.update(
						updateImportsOnFileMoveName,
						UpdateImportsOnFileMoveSetting.Always,
						vscode.ConfigurationTarget.Global);
					return true;
				}
			case Choice.Never:
				{
					const config = this.getConfiguration(newDocument);
					config.update(
						updateImportsOnFileMoveName,
						UpdateImportsOnFileMoveSetting.Never,
						vscode.ConfigurationTarget.Global);
					return false;
				}
		}

		return false;
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

function isTypeScriptDocument(document: vscode.TextDocument) {
	return document.languageId === languageIds.typescript || document.languageId === languageIds.typescriptreact;
}
