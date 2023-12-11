/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as fileSchemes from '../configuration/fileSchemes';
import { doesResourceLookLikeATypeScriptFile } from '../configuration/languageDescription';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { Delayer } from '../utils/async';
import { nulToken } from '../utils/cancellation';
import { Disposable } from '../utils/dispose';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';


const updateImportsOnFileMoveName = 'updateImportsOnFileMove.enabled';

async function isDirectory(resource: vscode.Uri): Promise<boolean> {
	try {
		return (await vscode.workspace.fs.stat(resource)).type === vscode.FileType.Directory;
	} catch {
		return false;
	}
}

const enum UpdateImportsOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

interface RenameAction {
	readonly oldUri: vscode.Uri;
	readonly newUri: vscode.Uri;
	readonly newFilePath: string;
	readonly oldFilePath: string;
	readonly jsTsFileThatIsBeingMoved: vscode.Uri;
}

class UpdateImportsOnFileRenameHandler extends Disposable {
	public static readonly minVersion = API.v300;

	private readonly _delayer = new Delayer(50);
	private readonly _pendingRenames = new Set<RenameAction>();

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly _handles: (uri: vscode.Uri) => Promise<boolean>,
	) {
		super();

		this._register(vscode.workspace.onDidRenameFiles(async (e) => {
			for (const { newUri, oldUri } of e.files) {
				const newFilePath = this.client.toTsFilePath(newUri);
				if (!newFilePath) {
					continue;
				}

				const oldFilePath = this.client.toTsFilePath(oldUri);
				if (!oldFilePath) {
					continue;
				}

				const config = this.getConfiguration(newUri);
				const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
				if (setting === UpdateImportsOnFileMoveSetting.Never) {
					continue;
				}

				// Try to get a js/ts file that is being moved
				// For directory moves, this returns a js/ts file under the directory.
				const jsTsFileThatIsBeingMoved = await this.getJsTsFileBeingMoved(newUri);
				if (!jsTsFileThatIsBeingMoved || !this.client.toTsFilePath(jsTsFileThatIsBeingMoved)) {
					continue;
				}

				this._pendingRenames.add({ oldUri, newUri, newFilePath, oldFilePath, jsTsFileThatIsBeingMoved });

				this._delayer.trigger(() => {
					vscode.window.withProgress({
						location: vscode.ProgressLocation.Window,
						title: vscode.l10n.t("Checking for update of JS/TS imports")
					}, () => this.flushRenames());
				});
			}
		}));
	}

	private async flushRenames(): Promise<void> {
		const renames = Array.from(this._pendingRenames);
		this._pendingRenames.clear();
		for (const group of this.groupRenames(renames)) {
			const edits = new vscode.WorkspaceEdit();
			const resourcesBeingRenamed: vscode.Uri[] = [];

			for (const { oldUri, newUri, newFilePath, oldFilePath, jsTsFileThatIsBeingMoved } of group) {
				const document = await vscode.workspace.openTextDocument(jsTsFileThatIsBeingMoved);

				// Make sure TS knows about file
				this.client.bufferSyncSupport.closeResource(oldUri);
				this.client.bufferSyncSupport.openTextDocument(document);

				if (await this.withEditsForFileRename(edits, document, oldFilePath, newFilePath)) {
					resourcesBeingRenamed.push(newUri);
				}
			}

			if (edits.size) {
				if (await this.confirmActionWithUser(resourcesBeingRenamed)) {
					await vscode.workspace.applyEdit(edits, { isRefactoring: true });
				}
			}
		}
	}

	private async confirmActionWithUser(newResources: readonly vscode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const config = this.getConfiguration(newResources[0]);
		const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName);
		switch (setting) {
			case UpdateImportsOnFileMoveSetting.Always:
				return true;
			case UpdateImportsOnFileMoveSetting.Never:
				return false;
			case UpdateImportsOnFileMoveSetting.Prompt:
			default:
				return this.promptUser(newResources);
		}
	}

	private getConfiguration(resource: vscode.Uri) {
		return vscode.workspace.getConfiguration(doesResourceLookLikeATypeScriptFile(resource) ? 'typescript' : 'javascript', resource);
	}

	private async promptUser(newResources: readonly vscode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const rejectItem: vscode.MessageItem = {
			title: vscode.l10n.t("No"),
			isCloseAffordance: true,
		};

		const acceptItem: vscode.MessageItem = {
			title: vscode.l10n.t("Yes"),
		};

		const alwaysItem: vscode.MessageItem = {
			title: vscode.l10n.t("Always"),
		};

		const neverItem: vscode.MessageItem = {
			title: vscode.l10n.t("Never"),
		};

		const response = await vscode.window.showInformationMessage(
			newResources.length === 1
				? vscode.l10n.t("Update imports for '{0}'?", path.basename(newResources[0].fsPath))
				: this.getConfirmMessage(vscode.l10n.t("Update imports for the following {0} files?", newResources.length), newResources), {
			modal: true,
		}, rejectItem, acceptItem, alwaysItem, neverItem);


		switch (response) {
			case acceptItem: {
				return true;
			}
			case rejectItem: {
				return false;
			}
			case alwaysItem: {
				const config = this.getConfiguration(newResources[0]);
				config.update(
					updateImportsOnFileMoveName,
					UpdateImportsOnFileMoveSetting.Always,
					this.getConfigTargetScope(config, updateImportsOnFileMoveName));
				return true;
			}
			case neverItem: {
				const config = this.getConfiguration(newResources[0]);
				config.update(
					updateImportsOnFileMoveName,
					UpdateImportsOnFileMoveSetting.Never,
					this.getConfigTargetScope(config, updateImportsOnFileMoveName));
				return false;
			}
			default: {
				return false;
			}
		}
	}

	private async getJsTsFileBeingMoved(resource: vscode.Uri): Promise<vscode.Uri | undefined> {
		if (resource.scheme !== fileSchemes.file) {
			return undefined;
		}

		if (await isDirectory(resource)) {
			const files = await vscode.workspace.findFiles(new vscode.RelativePattern(resource, '**/*.{ts,tsx,js,jsx}'), '**/node_modules/**', 1);
			return files[0];
		}

		return (await this._handles(resource)) ? resource : undefined;
	}

	private async withEditsForFileRename(
		edits: vscode.WorkspaceEdit,
		document: vscode.TextDocument,
		oldFilePath: string,
		newFilePath: string,
	): Promise<boolean> {
		const response = await this.client.interruptGetErr(() => {
			this.fileConfigurationManager.setGlobalConfigurationFromDocument(document, nulToken);
			const args: Proto.GetEditsForFileRenameRequestArgs = {
				oldFilePath,
				newFilePath,
			};
			return this.client.execute('getEditsForFileRename', args, nulToken);
		});
		if (response.type !== 'response' || !response.body.length) {
			return false;
		}

		typeConverters.WorkspaceEdit.withFileCodeEdits(edits, this.client, response.body);
		return true;
	}

	private groupRenames(renames: Iterable<RenameAction>): Iterable<Iterable<RenameAction>> {
		const groups = new Map<string, Set<RenameAction>>();

		for (const rename of renames) {
			// Group renames by type (js/ts) and by workspace.
			const key = `${this.client.getWorkspaceRootForResource(rename.jsTsFileThatIsBeingMoved)?.fsPath}@@@${doesResourceLookLikeATypeScriptFile(rename.jsTsFileThatIsBeingMoved)}`;
			if (!groups.has(key)) {
				groups.set(key, new Set());
			}
			groups.get(key)!.add(rename);
		}

		return groups.values();
	}

	private getConfirmMessage(start: string, resourcesToConfirm: readonly vscode.Uri[]): string {
		const MAX_CONFIRM_FILES = 10;

		const paths = [start];
		paths.push('');
		paths.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => path.basename(r.fsPath)));

		if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
			if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
				paths.push(vscode.l10n.t("...1 additional file not shown"));
			} else {
				paths.push(vscode.l10n.t("...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
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

export function register(
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	handles: (uri: vscode.Uri) => Promise<boolean>,
) {
	return conditionalRegistration([
		requireMinVersion(client, UpdateImportsOnFileRenameHandler.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return new UpdateImportsOnFileRenameHandler(client, fileConfigurationManager, handles);
	});
}
