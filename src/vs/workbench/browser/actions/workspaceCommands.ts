/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import * as resources from 'vs/base/common/resources';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { CancellationToken } from 'vs/base/common/cancellation';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { FileKind } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IQuickInputService, IPickOptions, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Schemas } from 'vs/base/common/network';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';

export const ADD_ROOT_FOLDER_COMMAND_ID = 'addRootFolder';
export const ADD_ROOT_FOLDER_LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

export const PICK_WORKSPACE_FOLDER_COMMAND_ID = '_workbench.pickWorkspaceFolder';

// Command registration

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => accessor.get(IFileDialogService).pickFileFolderAndOpen({ forceNewWindow: true })
});

CommandsRegistry.registerCommand({
	id: '_files.pickFolderAndOpen',
	handler: (accessor: ServicesAccessor, forceNewWindow: boolean) => accessor.get(IFileDialogService).pickFolderAndOpen({ forceNewWindow })
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFolderInNewWindow',
	handler: (accessor: ServicesAccessor) => accessor.get(IFileDialogService).pickFolderAndOpen({ forceNewWindow: true })
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.files.openFileInNewWindow',
	handler: (accessor: ServicesAccessor) => accessor.get(IFileDialogService).pickFileAndOpen({ forceNewWindow: true })
});

CommandsRegistry.registerCommand({
	id: 'workbench.action.openWorkspaceInNewWindow',
	handler: (accessor: ServicesAccessor) => accessor.get(IFileDialogService).pickWorkspaceAndOpen({ forceNewWindow: true })
});

CommandsRegistry.registerCommand({
	id: ADD_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor) => {
		const viewletService = accessor.get(IViewletService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const dialogsService = accessor.get(IFileDialogService);
		return dialogsService.showOpenDialog({
			openLabel: mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")),
			title: nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"),
			canSelectFolders: true,
			canSelectMany: true,
			defaultUri: dialogsService.defaultFolderPath(Schemas.file)
		}).then((folders): Promise<any> | null => {
			if (!folders || !folders.length) {
				return null;
			}

			// Add and show Files Explorer viewlet
			return workspaceEditingService.addFolders(folders.map(folder => ({ uri: folder })))
				.then(() => viewletService.openViewlet(viewletService.getDefaultViewletId(), true))
				.then(() => undefined);
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
		return undefined;
	}

	const folderPicks = folders.map(folder => {
		return {
			label: folder.name,
			description: labelService.getUriLabel(resources.dirname(folder.uri)!, { relative: true }),
			folder,
			iconClasses: getIconClasses(modelService, modeService, folder.uri, FileKind.ROOT_FOLDER)
		} as IQuickPickItem;
	});

	const options: IPickOptions<IQuickPickItem> = (args ? args[0] : undefined) || Object.create(null);

	if (!options.activeItem) {
		options.activeItem = folderPicks[0];
	}

	if (!options.placeHolder) {
		options.placeHolder = nls.localize('workspaceFolderPickerPlaceholder', "Select workspace folder");
	}

	if (typeof options.matchOnDescription !== 'boolean') {
		options.matchOnDescription = true;
	}

	const token: CancellationToken = (args ? args[1] : undefined) || CancellationToken.None;

	return quickInputService.pick(folderPicks, options, token).then(pick => {
		if (!pick) {
			return undefined;
		}

		return folders[folderPicks.indexOf(pick)];
	});
});
