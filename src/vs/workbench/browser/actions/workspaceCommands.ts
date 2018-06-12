/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { dirname } from 'vs/base/common/paths';
import { IQuickOpenService, IFilePickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';
import { mnemonicButtonLabel, getPathLabel } from 'vs/base/common/labels';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileKind, isParent } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isLinux } from 'vs/base/common/platform';

export const ADD_ROOT_FOLDER_COMMAND_ID = 'addRootFolder';
export const ADD_ROOT_FOLDER_LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

export const PICK_WORKSPACE_FOLDER_COMMAND_ID = '_workbench.pickWorkspaceFolder';

function pickFolders(buttonLabel: string, title: string, windowService: IWindowService, contextService: IWorkspaceContextService, historyService: IHistoryService): TPromise<string[]> {
	return windowService.showOpenDialog({
		buttonLabel,
		title,
		properties: ['multiSelections', 'openDirectory', 'createDirectory'],
		defaultPath: defaultFolderPath(contextService, historyService)
	});
}

export function defaultFolderPath(contextService: IWorkspaceContextService, historyService: IHistoryService): string {
	let candidate: URI;

	// Check for last active file root first...
	candidate = historyService.getLastActiveWorkspaceRoot('file');

	// ...then for last active file
	if (!candidate) {
		candidate = historyService.getLastActiveFile();
	}

	return candidate ? dirname(candidate.fsPath) : void 0;
}


function services(accessor: ServicesAccessor): { windowService: IWindowService, historyService: IHistoryService, contextService: IWorkspaceContextService, environmentService: IEnvironmentService } {
	return {
		windowService: accessor.get(IWindowService),
		historyService: accessor.get(IHistoryService),
		contextService: accessor.get(IWorkspaceContextService),
		environmentService: accessor.get(IEnvironmentService)
	};
}

export function defaultFilePath(contextService: IWorkspaceContextService, historyService: IHistoryService): string {
	let candidate: URI;

	// Check for last active file first...
	candidate = historyService.getLastActiveFile();

	// ...then for last active file root
	if (!candidate) {
		candidate = historyService.getLastActiveWorkspaceRoot('file');
	}

	return candidate ? dirname(candidate.fsPath) : void 0;
}

export function defaultWorkspacePath(contextService: IWorkspaceContextService, historyService: IHistoryService, environmentService: IEnvironmentService): string {

	// Check for current workspace config file first...
	if (contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !isUntitledWorkspace(contextService.getWorkspace().configuration.fsPath, environmentService)) {
		return dirname(contextService.getWorkspace().configuration.fsPath);
	}

	// ...then fallback to default folder path
	return defaultFolderPath(contextService, historyService);
}

function isUntitledWorkspace(path: string, environmentService: IEnvironmentService): boolean {
	return isParent(path, environmentService.workspacesHome, !isLinux /* ignore case */);
}

// Command registration

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);

		windowService.pickFileFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFilePath(contextService, historyService) } });
	}
});

CommandsRegistry.registerCommand({
	id: '_files.pickFolderAndOpen',
	handler: (accessor: ServicesAccessor, forceNewWindow: boolean) => {
		const { windowService, historyService, contextService } = services(accessor);

		windowService.pickFolderAndOpen({ forceNewWindow, dialogOptions: { defaultPath: defaultFolderPath(contextService, historyService) } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);

		windowService.pickFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFolderPath(contextService, historyService) } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);

		windowService.pickFileAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFilePath(contextService, historyService) } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.openWorkspaceInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService, environmentService } = services(accessor);

		windowService.pickWorkspaceAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultWorkspacePath(contextService, historyService, environmentService) } });
	}
});

CommandsRegistry.registerCommand({
	id: ADD_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor) => {
		const viewletService = accessor.get(IViewletService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		return pickFolders(mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"),
			accessor.get(IWindowService), accessor.get(IWorkspaceContextService), accessor.get(IHistoryService)).then(folders => {
				if (!folders || !folders.length) {
					return null;
				}

				// Add and show Files Explorer viewlet
				return workspaceEditingService.addFolders(folders.map(folder => ({ uri: URI.file(folder) })))
					.then(() => viewletService.openViewlet(viewletService.getDefaultViewletId(), true))
					.then(() => void 0);
			});
	}
});

CommandsRegistry.registerCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, function (accessor, args?: [IPickOptions, CancellationToken]) {
	const contextService = accessor.get(IWorkspaceContextService);
	const quickOpenService = accessor.get(IQuickOpenService);
	const environmentService = accessor.get(IEnvironmentService);

	const folders = contextService.getWorkspace().folders;
	if (!folders.length) {
		return void 0;
	}

	const folderPicks = folders.map(folder => {
		return {
			label: folder.name,
			description: getPathLabel(resources.dirname(folder.uri), void 0, environmentService),
			folder,
			resource: folder.uri,
			fileKind: FileKind.ROOT_FOLDER
		} as IFilePickOpenEntry;
	});

	let options: IPickOptions;
	if (args) {
		options = args[0];
	}

	if (!options) {
		options = Object.create(null);
	}

	if (!options.autoFocus) {
		options.autoFocus = { autoFocusFirstEntry: true };
	}

	if (!options.placeHolder) {
		options.placeHolder = nls.localize('workspaceFolderPickerPlaceholder', "Select workspace folder");
	}

	if (typeof options.matchOnDescription !== 'boolean') {
		options.matchOnDescription = true;
	}

	let token: CancellationToken;
	if (args) {
		token = args[1];
	}

	if (!token) {
		token = CancellationToken.None;
	}

	return quickOpenService.pick(folderPicks, options, token).then(pick => {
		if (!pick) {
			return void 0;
		}

		return folders[folderPicks.indexOf(pick)];
	});
});
