/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { INewWorkspaceStoredData, NEW_WORKSPACE_STORAGE_KEY } from '../common/newWorkspaceContext';

export class NewWorkspaceInitializer extends Disposable {
	constructor(
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService
	) {
		super();
		this._updateWorkspace();
	}

	private async _updateWorkspace(): Promise<void> {
		const workspace = this.workspaceService.getWorkspaceFolders();
		if (!workspace || workspace.length === 0) {
			return;
		}

		const newWorkspaceContextsList = this._extensionContext.globalState.get<INewWorkspaceStoredData[]>(NEW_WORKSPACE_STORAGE_KEY, []);
		const exactIndex = newWorkspaceContextsList.findIndex(c => c.workspaceURI === workspace[0].toString());
		if (exactIndex === -1) {
			return;
		}

		const context = newWorkspaceContextsList[exactIndex];
		const confirm = l10n.t('Continue Setup');
		const message = l10n.t('Continue Workspace Setup?');
		const detail = l10n.t('Copilot will resume setting up the workspace by creating the necessary files.');

		if (!context.initialized) {
			context.initialized = true;
			newWorkspaceContextsList[exactIndex] = context;
			this._extensionContext.globalState.update(NEW_WORKSPACE_STORAGE_KEY, newWorkspaceContextsList);

			const result = await vscode.window.showInformationMessage(message, { modal: true, detail }, confirm);
			if (result === confirm) {
				vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'agent', query: `${l10n.t('Continue with #new workspace setup')}` });
			} else {
				newWorkspaceContextsList.splice(exactIndex, 1);
				this._extensionContext.globalState.update(NEW_WORKSPACE_STORAGE_KEY, newWorkspaceContextsList);
			}

			return;
		}

		if ((await this.fileSystemService.readDirectory(workspace[0])).length > 0) {
			// workspace is not empty and we've already initialized it
			newWorkspaceContextsList.splice(exactIndex, 1);
			this._extensionContext.globalState.update(NEW_WORKSPACE_STORAGE_KEY, newWorkspaceContextsList);
		} else {
			// workspace is still empty, so ask to setup again
			const result = await vscode.window.showInformationMessage(message, { modal: true, detail }, confirm);
			if (result === confirm) {
				vscode.commands.executeCommand('workbench.action.chat.open', { mode: 'agent', query: context.userPrompt });
			} else {
				newWorkspaceContextsList.splice(exactIndex, 1);
				this._extensionContext.globalState.update(NEW_WORKSPACE_STORAGE_KEY, newWorkspaceContextsList);
			}
		}
	}
}