/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MenuRegistry, MenuId, SyncActionDescriptor, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { EmptyWorkspaceSupportContext, WorkbenchStateContext, WorkspaceFolderCountContext } from 'vs/workbench/browser/contextkeys';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspacesService, hasWorkspaceFileExtension } from 'vs/platform/workspaces/common/workspaces';
import { WORKSPACE_TRUST_ENABLED } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';

export class OpenFileAction extends Action {

	static readonly ID = 'workbench.action.files.openFile';
	static readonly LABEL = localize('openFile', "Open File...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	override run(event?: unknown, data?: ITelemetryData): Promise<void> {
		return this.dialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFolder';
	static readonly LABEL = localize('openFolder', "Open Folder...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	override run(event?: unknown, data?: ITelemetryData): Promise<void> {
		return this.dialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFileFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFileFolder';
	static readonly LABEL = localize('openFileFolder', "Open...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	override run(event?: unknown, data?: ITelemetryData): Promise<void> {
		return this.dialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.openWorkspace';
	static readonly LABEL = localize('openWorkspaceAction', "Open Workspace...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super(id, label);
	}

	override run(event?: unknown, data?: ITelemetryData): Promise<void> {
		return this.dialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
	}
}

export class CloseWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.closeFolder';
	static readonly LABEL = localize('closeWorkspace', "Close Workspace");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(localize('noWorkspaceOrFolderOpened', "There is currently no workspace or folder opened in this instance to close."));
			return;
		}

		return this.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: this.environmentService.remoteAuthority });
	}
}

export class OpenWorkspaceConfigFileAction extends Action {

	static readonly ID = 'workbench.action.openWorkspaceConfigFile';
	static readonly LABEL = localize('openWorkspaceConfigFile', "Open Workspace Configuration File");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);

		this.enabled = !!this.workspaceContextService.getWorkspace().configuration;
	}

	override async run(): Promise<void> {
		const configuration = this.workspaceContextService.getWorkspace().configuration;
		if (configuration) {
			await this.editorService.openEditor({ resource: configuration, options: { pinned: true } });
		}
	}
}

export class AddRootFolderAction extends Action {

	static readonly ID = 'workbench.action.addRootFolder';
	static readonly LABEL = ADD_ROOT_FOLDER_LABEL;

	constructor(
		id: string,
		label: string,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label);
	}

	override run(): Promise<void> {
		return this.commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
	}
}

export class GlobalRemoveRootFolderAction extends Action {

	static readonly ID = 'workbench.action.removeRootFolder';
	static readonly LABEL = localize('globalRemoveFolderFromWorkspace', "Remove Folder from Workspace...");

	constructor(
		id: string,
		label: string,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const state = this.contextService.getWorkbenchState();

		// Workspace / Folder
		if (state === WorkbenchState.WORKSPACE || state === WorkbenchState.FOLDER) {
			const folder = await this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
			if (folder) {
				await this.workspaceEditingService.removeFolders([folder.uri]);
			}
		}
	}
}

export class SaveWorkspaceAsAction extends Action {

	static readonly ID = 'workbench.action.saveWorkspaceAs';
	static readonly LABEL = localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService

	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const configPathUri = await this.workspaceEditingService.pickNewWorkspacePath();
		if (configPathUri && hasWorkspaceFileExtension(configPathUri)) {
			switch (this.contextService.getWorkbenchState()) {
				case WorkbenchState.EMPTY:
				case WorkbenchState.FOLDER:
					const folders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
					return this.workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
				case WorkbenchState.WORKSPACE:
					return this.workspaceEditingService.saveAndEnterWorkspace(configPathUri);
			}
		}
	}
}

export class DuplicateWorkspaceInNewWindowAction extends Action {

	static readonly ID = 'workbench.action.duplicateWorkspaceInNewWindow';
	static readonly LABEL = localize('duplicateWorkspaceInNewWindow', "Duplicate As Workspace in New Window");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		const remoteAuthority = this.environmentService.remoteAuthority;

		const newWorkspace = await this.workspacesService.createUntitledWorkspace(folders, remoteAuthority);
		await this.workspaceEditingService.copyWorkspaceSettings(newWorkspace);

		return this.hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true });
	}
}

class WorkspaceTrustManageAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.manageTrust',
			title: { value: localize('manageTrustAction', "Manage Workspace Trust"), original: 'Manage Workspace Trust' },
			precondition: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
			category: localize('workspacesCategory', "Workspaces"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor) {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.trust.manage');
	}
}

registerAction2(WorkspaceTrustManageAction);

// --- Actions Registration

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const workspacesCategory = localize('workspaces', "Workspaces");

registry.registerWorkbenchAction(SyncActionDescriptor.from(AddRootFolderAction), 'Workspaces: Add Folder to Workspace...', workspacesCategory);
registry.registerWorkbenchAction(SyncActionDescriptor.from(GlobalRemoveRootFolderAction), 'Workspaces: Remove Folder from Workspace...', workspacesCategory);
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseWorkspaceAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_F) }), 'Workspaces: Close Workspace', workspacesCategory, EmptyWorkspaceSupportContext);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SaveWorkspaceAsAction), 'Workspaces: Save Workspace As...', workspacesCategory, EmptyWorkspaceSupportContext);
registry.registerWorkbenchAction(SyncActionDescriptor.from(DuplicateWorkspaceInNewWindowAction), 'Workspaces: Duplicate As Workspace in New Window', workspacesCategory);

// --- Menu Registration

CommandsRegistry.registerCommand(OpenWorkspaceConfigFileAction.ID, serviceAccessor => {
	serviceAccessor.get(IInstantiationService).createInstance(OpenWorkspaceConfigFileAction, OpenWorkspaceConfigFileAction.ID, OpenWorkspaceConfigFileAction.LABEL).run();
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: ADD_ROOT_FOLDER_COMMAND_ID,
		title: localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '3_workspace',
	command: {
		id: SaveWorkspaceAsAction.ID,
		title: localize('miSaveWorkspaceAs', "Save Workspace As...")
	},
	order: 2,
	when: EmptyWorkspaceSupportContext
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OpenWorkspaceConfigFileAction.ID,
		title: { value: `${workspacesCategory}: ${OpenWorkspaceConfigFileAction.LABEL}`, original: 'Workspaces: Open Workspace Configuration File' },
	},
	when: WorkbenchStateContext.isEqualTo('workspace')
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: '6_close',
	command: {
		id: CloseWorkspaceAction.ID,
		title: localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder"),
		precondition: WorkspaceFolderCountContext.notEqualsTo('0')
	},
	order: 3,
	when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('workspace'), EmptyWorkspaceSupportContext)
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
