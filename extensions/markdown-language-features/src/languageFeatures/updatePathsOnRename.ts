/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as picomatch from 'picomatch';
import * as vscode from 'vscode';
import { BaseLanguageClient } from 'vscode-languageclient';
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
	externalFileGlobs: 'experimental.updateLinksOnFileMove.externalFileGlobs'
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

class UpdateImportsOnFileRenameHandler extends Disposable {

	private readonly _delayer = new Delayer(50);
	private readonly _pendingRenames = new Set<RenameAction>();

	public constructor(
		private readonly client: BaseLanguageClient,
	) {
		super();

		this._register(vscode.workspace.onDidRenameFiles(async (e) => {
			const [{ newUri, oldUri }] = e.files; // TODO: only handles first file

			const config = this.getConfiguration(newUri);

			const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
			if (setting === UpdateLinksOnFileMoveSetting.Never) {
				return;
			}

			if (!this.shouldParticipateInLinkUpdate(config, newUri)) {
				return;
			}

			this._pendingRenames.add({ oldUri, newUri });

			this._delayer.trigger(() => {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Window,
					title: localize('renameProgress.title', "Checking for Markdown links to update")
				}, () => this.flushRenames());
			});
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

		const config = this.getConfiguration(newResources[0]);
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

	private getConfiguration(resource: vscode.Uri) {
		return vscode.workspace.getConfiguration('markdown', resource);
	}

	private shouldParticipateInLinkUpdate(config: vscode.WorkspaceConfiguration, newUri: vscode.Uri) {
		if (looksLikeMarkdownPath(newUri)) {
			return true;
		}

		const externalGlob = config.get<string>(settingNames.externalFileGlobs);
		return !!externalGlob && picomatch.isMatch(newUri.fsPath, externalGlob);
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
				const config = this.getConfiguration(newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Always,
					vscode.ConfigurationTarget.Global);
				return true;
			}
			case Choice.Never: {
				const config = this.getConfiguration(newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Never,
					vscode.ConfigurationTarget.Global);
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
		if (!edit.changes) {
			return false;
		}

		for (const [path, edits] of Object.entries(edit.changes)) {
			const uri = vscode.Uri.parse(path);
			for (const edit of edits) {
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
}

export function registerUpdatePathsOnRename(client: BaseLanguageClient) {
	return new UpdateImportsOnFileRenameHandler(client);
}
