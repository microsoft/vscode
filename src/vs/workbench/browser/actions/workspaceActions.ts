/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MenuRegistry, MenuId, Action2, registerAction2, ILocalizedString } from 'vs/platform/actions/common/actions';
import { EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, OpenFolderWorkspaceSupportContext, WorkbenchStateContext, WorkspaceFolderCountContext } from 'vs/workbench/browser/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspacesService, hasWorkspaceFileExtension } from 'vs/platform/workspaces/common/workspaces';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IsMacNativeContext } from 'vs/platform/contextkey/common/contextkeys';

const workspacesCategory: ILocalizedString = { value: localize('workspaces', "Workspaces"), original: 'Workspaces' };
const fileCategory = { value: localize('filesCategory', "File"), original: 'File' };

export class OpenFileAction extends Action2 {

	static readonly ID = 'workbench.action.files.openFile';

	constructor() {
		super({
			id: OpenFileAction.ID,
			title: { value: localize('openFile', "Open File..."), original: 'Open File...' },
			category: fileCategory,
			f1: true,
			precondition: IsMacNativeContext.toNegated(),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_O
			}
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);

		return fileDialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFolderAction extends Action2 {

	static readonly ID = 'workbench.action.files.openFolder';

	constructor() {
		super({
			id: OpenFolderAction.ID,
			title: { value: localize('openFolder', "Open Folder..."), original: 'Open Folder...' },
			category: fileCategory,
			f1: true,
			precondition: ContextKeyExpr.and(IsMacNativeContext.toNegated(), OpenFolderWorkspaceSupportContext),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_O)
			}
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);

		return fileDialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFileFolderAction extends Action2 {

	static readonly ID = 'workbench.action.files.openFileFolder';
	static readonly LABEL: ILocalizedString = { value: localize('openFileFolder', "Open..."), original: 'Open...' };

	constructor() {
		super({
			id: OpenFileFolderAction.ID,
			title: OpenFileFolderAction.LABEL,
			category: fileCategory,
			f1: true,
			precondition: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_O
			}
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);

		return fileDialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

class OpenWorkspaceAction extends Action2 {

	static readonly ID = 'workbench.action.openWorkspace';

	constructor() {
		super({
			id: OpenWorkspaceAction.ID,
			title: { value: localize('openWorkspaceAction', "Open Workspace..."), original: 'Open Workspace...' },
			category: fileCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);

		return fileDialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
	}
}

class CloseWorkspaceAction extends Action2 {

	static readonly ID = 'workbench.action.closeFolder';

	constructor() {
		super({
			id: CloseWorkspaceAction.ID,
			title: { value: localize('closeWorkspace', "Close Workspace"), original: 'Close Workspace' },
			category: workspacesCategory,
			f1: true,
			precondition: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), EmptyWorkspaceSupportContext),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const hostService = accessor.get(IHostService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);

		return hostService.openWindow({ forceReuseWindow: true, remoteAuthority: environmentService.remoteAuthority });
	}
}

class OpenWorkspaceConfigFileAction extends Action2 {

	static readonly ID = 'workbench.action.openWorkspaceConfigFile';

	constructor() {
		super({
			id: OpenWorkspaceConfigFileAction.ID,
			title: { value: localize('openWorkspaceConfigFile', "Open Workspace Configuration File"), original: 'Open Workspace Configuration File' },
			category: workspacesCategory,
			f1: true,
			precondition: WorkbenchStateContext.isEqualTo('workspace')
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const contextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);

		const configuration = contextService.getWorkspace().configuration;
		if (configuration) {
			await editorService.openEditor({ resource: configuration, options: { pinned: true } });
		}
	}
}

export class AddRootFolderAction extends Action2 {

	static readonly ID = 'workbench.action.addRootFolder';

	constructor() {
		super({
			id: AddRootFolderAction.ID,
			title: ADD_ROOT_FOLDER_LABEL,
			category: workspacesCategory,
			f1: true,
			precondition: ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace'))
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);

		return commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
	}
}

class RemoveRootFolderAction extends Action2 {

	static readonly ID = 'workbench.action.removeRootFolder';

	constructor() {
		super({
			id: RemoveRootFolderAction.ID,
			title: { value: localize('globalRemoveFolderFromWorkspace', "Remove Folder from Workspace..."), original: 'Remove Folder from Workspace...' },
			category: workspacesCategory,
			f1: true,
			precondition: ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo('0'), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')))
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);

		const folder = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		if (folder) {
			await workspaceEditingService.removeFolders([folder.uri]);
		}
	}
}

class SaveWorkspaceAsAction extends Action2 {

	static readonly ID = 'workbench.action.saveWorkspaceAs';

	constructor() {
		super({
			id: SaveWorkspaceAsAction.ID,
			title: { value: localize('saveWorkspaceAsAction', "Save Workspace As..."), original: 'Save Workspace As...' },
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const contextService = accessor.get(IWorkspaceContextService);

		const configPathUri = await workspaceEditingService.pickNewWorkspacePath();
		if (configPathUri && hasWorkspaceFileExtension(configPathUri)) {
			switch (contextService.getWorkbenchState()) {
				case WorkbenchState.EMPTY:
				case WorkbenchState.FOLDER:
					const folders = contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
					return workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
				case WorkbenchState.WORKSPACE:
					return workspaceEditingService.saveAndEnterWorkspace(configPathUri);
			}
		}
	}
}

class DuplicateWorkspaceInNewWindowAction extends Action2 {

	static readonly ID = 'workbench.action.duplicateWorkspaceInNewWindow';

	constructor() {
		super({
			id: DuplicateWorkspaceInNewWindowAction.ID,
			title: { value: localize('duplicateWorkspaceInNewWindow', "Duplicate As Workspace in New Window"), original: 'Duplicate As Workspace in New Window' },
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const hostService = accessor.get(IHostService);
		const workspacesService = accessor.get(IWorkspacesService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);

		const folders = workspaceContextService.getWorkspace().folders;
		const remoteAuthority = environmentService.remoteAuthority;

		const newWorkspace = await workspacesService.createUntitledWorkspace(folders, remoteAuthority);
		await workspaceEditingService.copyWorkspaceSettings(newWorkspace);

		return hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true });
	}
}

// --- Actions Registration

registerAction2(AddRootFolderAction);
registerAction2(RemoveRootFolderAction);
registerAction2(OpenFileAction);
registerAction2(OpenFolderAction);
registerAction2(OpenFileFolderAction);
registerAction2(OpenWorkspaceAction);
registerAction2(OpenWorkspaceConfigFileAction);
registerAction2(CloseWorkspaceAction);
registerAction2(SaveWorkspaceAsAction);
registerAction2(DuplicateWorkspaceInNewWindowAction);

// --- Menu Registration

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFileAction.ID,
		title: localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")
	},
	order: 1,
	when: IsMacNativeContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFolderAction.ID,
		title: localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")
	},
	order: 2,
	when: ContextKeyExpr.and(IsMacNativeContext.toNegated(), OpenFolderWorkspaceSupportContext)
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenFileFolderAction.ID,
		title: localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")
	},
	order: 1,
	when: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext)
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '2_open',
	command: {
		id: OpenWorkspaceAction.ID,
		title: localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace...")
	},
	order: 3,
	when: EnterMultiRootWorkspaceSupportContext
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: ADD_ROOT_FOLDER_COMMAND_ID,
		title: localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
	},
	when: ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')),
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: SaveWorkspaceAsAction.ID,
		title: localize('miSaveWorkspaceAs', "Save Workspace As...")
	},
	order: 2,
	when: EnterMultiRootWorkspaceSupportContext
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: DuplicateWorkspaceInNewWindowAction.ID,
		title: localize('duplicateWorkspace', "Duplicate Workspace")
	},
	order: 3,
	when: EnterMultiRootWorkspaceSupportContext
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseWorkspaceAction.ID,
		title: localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder")
	},
	order: 3,
	when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('folder'), EmptyWorkspaceSupportContext)
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseWorkspaceAction.ID,
		title: localize({ key: 'miCloseWorkspace', comment: ['&& denotes a mnemonic'] }, "Close &&Workspace")
	},
	order: 3,
	when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), EmptyWorkspaceSupportContext)
});
