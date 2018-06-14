/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import * as languageIds from '../utils/languageModeIds';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';
import * as fileSchemes from '../utils/fileSchemes';

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
		private readonly _handles: (uri: vscode.Uri) => Promise<boolean>,
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
		if (!this.client.apiVersion.gte(API.v290)) {
			return;
		}

		const targetResource = await this.getTargetResource(newResource);
		if (!targetResource) {
			return;
		}

		const targetFile = this.client.toPath(targetResource);
		if (!targetFile) {
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

		const document = await vscode.workspace.openTextDocument(targetResource);

		const config = this.getConfiguration(document);
		const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
		if (setting === UpdateImportsOnFileMoveSetting.Never) {
			return;
		}

		// Make sure TS knows about file
		this.client.bufferSyncSupport.closeResource(targetResource);
		this.client.bufferSyncSupport.openTextDocument(document);

		const edits = await this.getEditsForFileRename(targetFile, document, oldFile, newFile);
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

	private async getTargetResource(resource: vscode.Uri): Promise<vscode.Uri | undefined> {
		if (resource.scheme !== fileSchemes.file) {
			return undefined;
		}

		if (this.client.apiVersion.gte(API.v292) && fs.lstatSync(resource.fsPath).isDirectory()) {
			const files = await vscode.workspace.findFiles({
				base: resource.fsPath,
				pattern: '**/*.{ts,tsx,js,jsx}',
			}, '**/node_modules/**', 1);
			return files[0];
		}

		return this._handles(resource) ? resource : undefined;
	}

	private async getEditsForFileRename(
		targetResource: string,
		document: vscode.TextDocument,
		oldFile: string,
		newFile: string,
	) {
		await this.fileConfigurationManager.ensureConfigurationForDocument(document, undefined);

		const args: Proto.GetEditsForFileRenameRequestArgs = {
			file: targetResource,
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
