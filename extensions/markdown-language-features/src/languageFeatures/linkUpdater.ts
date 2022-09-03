/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as picomatch from 'picomatch';
import * as vscode from 'vscode';
import { BaseLanguageClient, TextDocumentEdit } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { getEditForFileRenames } from '../protocol';
import { Delayer } from '../util/async';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { looksLikeMarkdownPath } from '../util/file';
import { convertRange } from './fileReferences';

const localize = nls.loadMessageBundle();

const settingNames = Object.freeze({
	enabled: 'experimental.updateLinksOnFileMove.enabled',
	externalFileGlobs: 'experimental.updateLinksOnFileMove.externalFileGlobs',
	enableForDirectories: 'experimental.updateLinksOnFileMove.enableForDirectories',
});

const enum UpdateLinksOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

interface RenameAction {
	readonly oldUri: vscode.Uri;
	readonly newUri: vscode.Uri;
}

class UpdateLinksOnFileRenameHandler extends Disposable {

	private readonly _delayer = new Delayer(50);
	private readonly _pendingRenames = new Set<RenameAction>();

	public constructor(
		private readonly client: BaseLanguageClient,
	) {
		super();

		this._register(vscode.workspace.onDidRenameFiles(async (e) => {
			for (const { newUri, oldUri } of e.files) {
				const config = vscode.workspace.getConfiguration('markdown', newUri);
				if (!await this.shouldParticipateInLinkUpdate(config, newUri)) {
					continue;
				}

				this._pendingRenames.add({ newUri, oldUri });
			}

			if (this._pendingRenames.size) {
				this._delayer.trigger(() => {
					vscode.window.withProgress({
						location: vscode.ProgressLocation.Window,
						title: localize('renameProgress.title', "Checking for Markdown links to update")
					}, () => this.flushRenames());
				});
			}
		}));
	}

	private async flushRenames(): Promise<void> {
		const renames = Array.from(this._pendingRenames);
		this._pendingRenames.clear();

		const edit = new vscode.WorkspaceEdit();
		const resourcesBeingRenamed: vscode.Uri[] = [];

		for (const { oldUri, newUri } of renames) {
			if (await this.withEditsForFileRename(edit, oldUri, newUri, noopToken)) {
				resourcesBeingRenamed.push(newUri);
			}
		}

		if (edit.size) {
			if (await this.confirmActionWithUser(resourcesBeingRenamed)) {
				await vscode.workspace.applyEdit(edit);
			}
		}
	}

	private async confirmActionWithUser(newResources: readonly vscode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const config = vscode.workspace.getConfiguration('markdown', newResources[0]);
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		switch (setting) {
			case UpdateLinksOnFileMoveSetting.Prompt:
				return this.promptUser(newResources);
			case UpdateLinksOnFileMoveSetting.Always:
				return true;
			case UpdateLinksOnFileMoveSetting.Never:
			default:
				return false;
		}
	}
	private async shouldParticipateInLinkUpdate(config: vscode.WorkspaceConfiguration, newUri: vscode.Uri): Promise<boolean> {
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		if (setting === UpdateLinksOnFileMoveSetting.Never) {
			return false;
		}

		if (looksLikeMarkdownPath(newUri)) {
			return true;
		}

		const externalGlob = config.get<string>(settingNames.externalFileGlobs);
		if (!!externalGlob && picomatch.isMatch(newUri.fsPath, externalGlob)) {
			return true;
		}

		const stat = await vscode.workspace.fs.stat(newUri);
		if (stat.type === vscode.FileType.Directory) {
			return config.get<boolean>(settingNames.enableForDirectories, true);
		}

		return false;
	}

	private async promptUser(newResources: readonly vscode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const enum Choice {
			None = 0,
			Accept = 1,
			Reject = 2,
			Always = 3,
			Never = 4,
		}

		interface Item extends vscode.MessageItem {
			readonly choice: Choice;
		}

		const response = await vscode.window.showInformationMessage<Item>(
			newResources.length === 1
				? localize('prompt', "Update Markdown links for '{0}'?", path.basename(newResources[0].fsPath))
				: this.getConfirmMessage(localize('promptMoreThanOne', "Update Markdown link for the following {0} files?", newResources.length), newResources), {
			modal: true,
		}, {
			title: localize('reject.title', "No"),
			choice: Choice.Reject,
			isCloseAffordance: true,
		}, {
			title: localize('accept.title', "Yes"),
			choice: Choice.Accept,
		}, {
			title: localize('always.title', "Always automatically update Markdown Links"),
			choice: Choice.Always,
		}, {
			title: localize('never.title', "Never automatically update Markdown Links"),
			choice: Choice.Never,
		});

		if (!response) {
			return false;
		}

		switch (response.choice) {
			case Choice.Accept: {
				return true;
			}
			case Choice.Reject: {
				return false;
			}
			case Choice.Always: {
				const config = vscode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Always,
					this.getConfigTargetScope(config, settingNames.enabled));
				return true;
			}
			case Choice.Never: {
				const config = vscode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Never,
					this.getConfigTargetScope(config, settingNames.enabled));
				return false;
			}
		}

		return false;
	}

	private async withEditsForFileRename(
		workspaceEdit: vscode.WorkspaceEdit,
		oldUri: vscode.Uri,
		newUri: vscode.Uri,
		token: vscode.CancellationToken,
	): Promise<boolean> {
		const edit = await this.client.sendRequest(getEditForFileRenames, [{ oldUri: oldUri.toString(), newUri: newUri.toString() }], token);
		if (!edit.documentChanges?.length) {
			return false;
		}

		for (const change of edit.documentChanges as TextDocumentEdit[]) {
			const uri = vscode.Uri.parse(change.textDocument.uri);
			for (const edit of change.edits) {
				workspaceEdit.replace(uri, convertRange(edit.range), edit.newText);
			}
		}

		return true;
	}

	private getConfirmMessage(start: string, resourcesToConfirm: readonly vscode.Uri[]): string {
		const MAX_CONFIRM_FILES = 10;

		const paths = [start];
		paths.push('');
		paths.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => path.basename(r.fsPath)));

		if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
			if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
				paths.push(localize('moreFile', "...1 additional file not shown"));
			} else {
				paths.push(localize('moreFiles', "...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
			}
		}

		paths.push('');
		return paths.join('\n');
	}

	private getConfigTargetScope(config: vscode.WorkspaceConfiguration, settingsName: string): vscode.ConfigurationTarget {
		const inspected = config.inspect(settingsName);
		if (inspected?.workspaceFolderValue) {
			return vscode.ConfigurationTarget.WorkspaceFolder;
		}

		if (inspected?.workspaceValue) {
			return vscode.ConfigurationTarget.Workspace;
		}

		return vscode.ConfigurationTarget.Global;
	}
}

export function registerUpdateLinksOnRename(client: BaseLanguageClient) {
	return new UpdateLinksOnFileRenameHandler(client);
}
