/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as languageIds from '../utils/languageModeIds';
import * as typeConverters from '../utils/typeConverters';
import BufferSyncSupport from './bufferSyncSupport';
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

		const document = await vscode.workspace.openTextDocument(newResource);

		const config = this.getConfiguration(document);
		const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
		if (setting === UpdateImportsOnFileMoveSetting.Never) {
			return;
		}

		// Make sure TS knows about file
		this.bufferSyncSupport.openTextDocument(document);

		const edits = await this.getEditsForFileRename(document, oldFile, newFile);
		if (!edits || !edits.size) {
			return;
		}

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

		interface Item extends vscode.QuickPickItem {
			choice: Choice;
		}

		const response = await vscode.window.showQuickPick<Item>([
			{
				label: localize('accept.label', "Yes"),
				description: localize('accept.description', "Update imports."),
				choice: Choice.Accept,
			},
			{
				label: localize('reject.label', "No"),
				description: localize('reject.description', "Do not update imports."),
				choice: Choice.Reject,
			},
			{
				label: localize('always.label', "Always"),
				description: localize('always.description', "Yes, and always automatically update imports."),
				choice: Choice.Always,
			},
			{
				label: localize('never.label', "Never"),
				description: localize('never.description', "No, and do not prompt me again."),
				choice: Choice.Never,
			},
		], {
				placeHolder: localize('prompt', "Update import paths?"),
				ignoreFocusOut: true,
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
