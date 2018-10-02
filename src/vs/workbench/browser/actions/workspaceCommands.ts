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
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { CancellationToken } from 'vs/base/common/cancellation';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileKind, isParent } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isLinux } from 'vs/base/common/platform';
import { ILabelService } from 'vs/platform/label/common/label';
import { IQuickInputService, IPickOptions, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Schemas } from 'vs/base/common/network';

export const ADD_ROOT_FOLDER_COMMAND_ID = 'addRootFolder';
export const ADD_ROOT_FOLDER_LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

export const PICK_WORKSPACE_FOLDER_COMMAND_ID = '_workbench.pickWorkspaceFolder';

function pickFolders(buttonLabel: string, title: string, windowService: IWindowService, contextService: IWorkspaceContextService, historyService: IHistoryService): TPromise<string[]> {
	const defaultPathURI = defaultFolderPath(contextService, historyService, Schemas.file);
	return windowService.showOpenDialog({
		buttonLabel,
		title,
		properties: ['multiSelections', 'openDirectory', 'createDirectory'],
		defaultPath: defaultPathURI && defaultPathURI.fsPath
	});
}

export function defaultFolderPath(contextService: IWorkspaceContextService, historyService: IHistoryService, schemeFilter: string): URI {
	let candidate: URI;

	// Check for last active file root first...
	candidate = historyService.getLastActiveWorkspaceRoot(schemeFilter);

	// ...then for last active file
	if (!candidate) {
		candidate = historyService.getLastActiveFile(schemeFilter);
	}

	return candidate ? resources.dirname(candidate) : void 0;
}


function services(accessor: ServicesAccessor): { windowService: IWindowService, historyService: IHistoryService, contextService: IWorkspaceContextService, environmentService: IEnvironmentService } {
	return {
		windowService: accessor.get(IWindowService),
		historyService: accessor.get(IHistoryService),
		contextService: accessor.get(IWorkspaceContextService),
		environmentService: accessor.get(IEnvironmentService)
	};
}

export function defaultFilePath(contextService: IWorkspaceContextService, historyService: IHistoryService, schemeFilter: string): URI {
	let candidate: URI;

	// Check for last active file first...
	candidate = historyService.getLastActiveFile(schemeFilter);

	// ...then for last active file root
	if (!candidate) {
		candidate = historyService.getLastActiveWorkspaceRoot(schemeFilter);
	}

	return candidate ? resources.dirname(candidate) : void 0;
}

export function defaultWorkspacePath(contextService: IWorkspaceContextService, historyService: IHistoryService, environmentService: IEnvironmentService, schemeFilter: string): URI {

	// Check for current workspace config file first...
	if (schemeFilter === Schemas.file && contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !isUntitledWorkspace(contextService.getWorkspace().configuration.fsPath, environmentService)) {
		return resources.dirname(contextService.getWorkspace().configuration);
	}

	// ...then fallback to default folder path
	return defaultFolderPath(contextService, historyService, schemeFilter);
}

function isUntitledWorkspace(path: string, environmentService: IEnvironmentService): boolean {
	return isParent(path, environmentService.workspacesHome, !isLinux /* ignore case */);
}

// Command registration

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);
		const defaultPathURI = defaultFilePath(contextService, historyService, Schemas.file);
		windowService.pickFileFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultPathURI && defaultPathURI.fsPath } });
	}
});

CommandsRegistry.registerCommand({
	id: '_files.pickFolderAndOpen',
	handler: (accessor: ServicesAccessor, forceNewWindow: boolean) => {
		const { windowService, historyService, contextService } = services(accessor);
		const defaultPathURI = defaultFolderPath(contextService, historyService, Schemas.file);
		windowService.pickFolderAndOpen({ forceNewWindow, dialogOptions: { defaultPath: defaultPathURI && defaultPathURI.fsPath } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);
		const defaultPathURI = defaultFolderPath(contextService, historyService, Schemas.file);
		windowService.pickFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultPathURI && defaultPathURI.fsPath } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService } = services(accessor);
		const defaultPathURI = defaultFilePath(contextService, historyService, Schemas.file);
		windowService.pickFileAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultPathURI && defaultPathURI.fsPath } });
	}
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.openWorkspaceInNewWindow',
	handler: (accessor: ServicesAccessor) => {
		const { windowService, historyService, contextService, environmentService } = services(accessor);
		const defaultPathURI = defaultWorkspacePath(contextService, historyService, environmentService, Schemas.file);
		windowService.pickWorkspaceAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultPathURI && defaultPathURI.fsPath } });
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

CommandsRegistry.registerCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, function (accessor, args?: [IPickOptions<IQuickPickItem>, CancellationToken]) {
	const quickInputService = accessor.get(IQuickInputService);
	const labelService = accessor.get(ILabelService);
	const contextService = accessor.get(IWorkspaceContextService);
	const modelService = accessor.get(IModelService);
	const modeService = accessor.get(IModeService);

	const folders = contextService.getWorkspace().folders;
	if (!folders.length) {
		return void 0;
	}

	const folderPicks = folders.map(folder => {
		return {
			label: folder.name,
			description: labelService.getUriLabel(resources.dirname(folder.uri), { relative: true }),
			folder,
			iconClasses: getIconClasses(modelService, modeService, folder.uri, FileKind.ROOT_FOLDER)
		} as IQuickPickItem;
	});

	let options: IPickOptions<IQuickPickItem>;
	if (args) {
		options = args[0];
	}

	if (!options) {
		options = Object.create(null);
	}

	if (!options.activeItem) {
		options.activeItem = folderPicks[0];
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

	return quickInputService.pick(folderPicks, options, token).then(pick => {
		if (!pick) {
			return void 0;
		}

		return folders[folderPicks.indexOf(pick)];
	});
});
