/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { dirname } from 'vs/base/common/paths';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export const ADD_ROOT_FOLDER_COMMAND_ID = 'workbench.command.addRootFolder';
export const ADD_ROOT_FOLDER_LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

function pickFolders(buttonLabel: string, title: string, windowService: IWindowService, contextService: IWorkspaceContextService, historyService: IHistoryService): TPromise<string[]> {
	return windowService.showOpenDialog({
		buttonLabel,
		title,
		properties: ['multiSelections', 'openDirectory', 'createDirectory'],
		defaultPath: defaultFolderPath(contextService, historyService)
	});
}

function defaultFolderPath(contextService: IWorkspaceContextService, historyService: IHistoryService): string {
	let candidate: URI;

	// Check for last active file root first...
	candidate = historyService.getLastActiveWorkspaceRoot('file');

	// ...then for last active file
	if (!candidate) {
		candidate = historyService.getLastActiveFile();
	}

	return candidate ? dirname(candidate.fsPath) : void 0;
}

// Command registration

CommandsRegistry.registerCommand({
	id: ADD_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor) => {
		return pickFolders(mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"),
			accessor.get(IWindowService), accessor.get(IWorkspaceContextService), accessor.get(IHistoryService)).then(folders => {
				if (!folders || !folders.length) {
					return null;
				}
				const viewletService = accessor.get(IViewletService);
				const workspaceEditingService = accessor.get(IWorkspaceEditingService);

				// Add and show Files Explorer viewlet
				return workspaceEditingService.addFolders(folders.map(folder => ({ uri: URI.file(folder) }))).then(() => viewletService.openViewlet(viewletService.getDefaultViewletId(), true));
			});
	}
});
