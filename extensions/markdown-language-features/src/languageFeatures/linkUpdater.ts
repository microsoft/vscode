/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as picomatch from 'picomatch';
import * as vscode from 'vscode';
import { TextDocumentEdit } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { MdLanguageClient } from '../client/client';
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
		private readonly client: MdLanguageClient,
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

		const result = await this.getEditsForFileRename(renames, noopToken);

		if (result && result.edit.size) {
			if (await this.confirmActionWithUser(result.resourcesBeingRenamed)) {
				await vscode.workspace.applyEdit(result.edit);
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

		const rejectItem: vscode.MessageItem = {
			title: localize('reject.title', "No"),
			isCloseAffordance: true,
		};

		const acceptItem: vscode.MessageItem = {
			title: localize('accept.title', "Yes"),
		};

		const alwaysItem: vscode.MessageItem = {
			title: localize('always.title', "Always automatically update Markdown Links"),
		};

		const neverItem: vscode.MessageItem = {
			title: localize('never.title', "Never automatically update Markdown Links"),
		};

		const choice = await vscode.window.showInformationMessage(
			newResources.length === 1
				? localize('prompt', "Update Markdown links for '{0}'?", path.basename(newResources[0].fsPath))
				: this.getConfirmMessage(localize('promptMoreThanOne', "Update Markdown link for the following {0} files?", newResources.length), newResources), {
			modal: true,
		}, rejectItem, acceptItem, alwaysItem, neverItem);

		switch (choice) {
			case acceptItem: {
				return true;
			}
			case rejectItem: {
				return false;
			}
			case alwaysItem: {
				const config = vscode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Always,
					this.getConfigTargetScope(config, settingNames.enabled));
				return true;
			}
			case neverItem: {
				const config = vscode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Never,
					this.getConfigTargetScope(config, settingNames.enabled));
				return false;
			}
			default: {
				return false;
			}
		}
	}

	private async getEditsForFileRename(renames: readonly RenameAction[], token: vscode.CancellationToken): Promise<{ edit: vscode.WorkspaceEdit; resourcesBeingRenamed: vscode.Uri[] } | undefined> {
		const result = await this.client.getEditForFileRenames(renames.map(rename => ({ oldUri: rename.oldUri.toString(), newUri: rename.newUri.toString() })), token);
		if (!result?.edit.documentChanges?.length) {
			return undefined;
		}

		const workspaceEdit = new vscode.WorkspaceEdit();

		for (const change of result.edit.documentChanges as TextDocumentEdit[]) {
			const uri = vscode.Uri.parse(change.textDocument.uri);
			for (const edit of change.edits) {
				workspaceEdit.replace(uri, convertRange(edit.range), edit.newText);
			}
		}

		return {
			edit: workspaceEdit,
			resourcesBeingRenamed: result.participatingRenames.map(x => vscode.Uri.parse(x.newUri)),
		};
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

export function registerUpdateLinksOnRename(client: MdLanguageClient) {
	return new UpdateLinksOnFileRenameHandler(client);
}
