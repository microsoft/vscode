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
import { nulToken } from '../utils/cancellation';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import { Disposable } from '../utils/dispose';
import * as fileSchemes from '../utils/fileSchemes';
import { isTypeScriptDocument } from '../utils/languageModeIds';
import { escapeRegExp } from '../utils/regexp';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();

const updateImportsOnFileMoveName = 'updateImportsOnFileMove.enabled';

enum UpdateImportsOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

class UpdateImportsOnFileRenameHandler extends Disposable {
	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly _handles: (uri: vscode.Uri) => Promise<boolean>,
	) {
		super();

		this._register(vscode.workspace.onDidRenameFile(e => {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				title: localize('renameProgress.title', "Checking for update of JS/TS imports")
			}, () => {
				return this.doRename(e.oldUri, e.newUri);
			});
		}));
	}

	private async doRename(
		oldResource: vscode.Uri,
		newResource: vscode.Uri,
	): Promise<void> {
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
		this.client.bufferSyncSupport.closeResource(oldResource);
		this.client.bufferSyncSupport.openTextDocument(document);

		if (this.client.apiVersion.lt(API.v300) && !fs.lstatSync(newResource.fsPath).isDirectory()) {
			// Workaround for https://github.com/Microsoft/vscode/issues/52967
			// Never attempt to update import paths if the file does not contain something the looks like an export
			try {
				const response = await this.client.execute('navtree', { file: newFile }, nulToken);
				if (response.type !== 'response' || !response.body) {
					return;
				}

				const hasExport = (node: Proto.NavigationTree): boolean => {
					return !!node.kindModifiers.match(/\bexports?\b/g) || !!(node.childItems && node.childItems.some(hasExport));
				};
				if (!hasExport(response.body)) {
					return;
				}
			} catch {
				// noop
			}
		}

		const edits = await this.getEditsForFileRename(targetFile, document, oldFile, newFile);
		if (!edits || !edits.size) {
			return;
		}

		if (await this.confirmActionWithUser(newResource, document)) {
			await vscode.workspace.applyEdit(edits);
		}
	}

	private async confirmActionWithUser(
		newResource: vscode.Uri,
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
				return this.promptUser(newResource, newDocument);
		}
	}

	private getConfiguration(newDocument: vscode.TextDocument) {
		return vscode.workspace.getConfiguration(isTypeScriptDocument(newDocument) ? 'typescript' : 'javascript', newDocument.uri);
	}

	private async promptUser(
		newResource: vscode.Uri,
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
			localize('prompt', "Update imports for moved file: '{0}'?", path.basename(newResource.fsPath)), {
				modal: true,
			}, {
				title: localize('reject.title', "No"),
				choice: Choice.Reject,
				isCloseAffordance: true,
			}, {
				title: localize('accept.title', "Yes"),
				choice: Choice.Accept,
			}, {
				title: localize('always.title', "Always automatically update imports"),
				choice: Choice.Always,
			}, {
				title: localize('never.title', "Never automatically update imports"),
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

		const isDirectory = fs.lstatSync(resource.fsPath).isDirectory();
		if (isDirectory && this.client.apiVersion.gte(API.v300)) {
			return resource;
		}

		if (isDirectory && this.client.apiVersion.gte(API.v292)) {
			const files = await vscode.workspace.findFiles({
				base: resource.fsPath,
				pattern: '**/*.{ts,tsx,js,jsx}',
			}, '**/node_modules/**', 1);
			return files[0];
		}

		return (await this._handles(resource)) ? resource : undefined;
	}

	private async getEditsForFileRename(
		targetResource: string,
		document: vscode.TextDocument,
		oldFile: string,
		newFile: string,
	): Promise<vscode.WorkspaceEdit | undefined> {
		const isDirectoryRename = fs.lstatSync(newFile).isDirectory();

		const response = await this.client.interuptGetErr(() => {
			this.fileConfigurationManager.setGlobalConfigurationFromDocument(document, nulToken);
			const args: Proto.GetEditsForFileRenameRequestArgs & { file: string } = {
				file: targetResource,
				oldFilePath: oldFile,
				newFilePath: newFile,
			};
			return this.client.execute('getEditsForFileRename', args, nulToken);
		});
		if (response.type !== 'response' || !response.body) {
			return;
		}

		const edits: Proto.FileCodeEdits[] = [];
		for (const edit of response.body) {
			// Workaround for https://github.com/Microsoft/vscode/issues/52675
			if (this.client.apiVersion.lt(API.v300)) {
				if (edit.fileName.match(/[\/\\]node_modules[\/\\]/gi)) {
					continue;
				}
				for (const change of edit.textChanges) {
					if (change.newText.match(/\/node_modules\//gi)) {
						continue;
					}
				}
			}

			edits.push(await this.fixEdit(edit, isDirectoryRename, oldFile, newFile));
		}
		return typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, edits);
	}

	private async fixEdit(
		edit: Proto.FileCodeEdits,
		isDirectoryRename: boolean,
		oldFile: string,
		newFile: string,
	): Promise<Proto.FileCodeEdits> {
		if (!isDirectoryRename || this.client.apiVersion.gte(API.v300)) {
			return edit;
		}

		const document = await vscode.workspace.openTextDocument(edit.fileName);
		const oldFileRe = new RegExp('/' + escapeRegExp(path.basename(oldFile)) + '/');

		// Workaround for https://github.com/Microsoft/TypeScript/issues/24968
		const textChanges = edit.textChanges.map((change): Proto.CodeEdit => {
			const existingText = document.getText(typeConverters.Range.fromTextSpan(change));
			const existingMatch = existingText.match(oldFileRe);
			if (!existingMatch) {
				return change;
			}

			const match = new RegExp('/' + escapeRegExp(path.basename(newFile)) + '/(.+)$', 'g').exec(change.newText);
			if (!match) {
				return change;
			}

			return {
				newText: change.newText.slice(0, -match[1].length),
				start: change.start,
				end: {
					line: change.end.line,
					offset: change.end.offset - match[1].length,
				},
			};
		});

		return {
			fileName: edit.fileName,
			textChanges,
		};
	}
}

export function register(
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	handles: (uri: vscode.Uri) => Promise<boolean>,
) {
	return new VersionDependentRegistration(client, API.v290, () =>
		new UpdateImportsOnFileRenameHandler(client, fileConfigurationManager, handles));
}