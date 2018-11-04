/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { WORKSPACE_FILTER, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';

export class OpenFileAction extends Action {

	static readonly ID = 'workbench.action.files.openFile';
	static LABEL = nls.localize('openFile', "Open File...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Thenable<any> {
		return this.dialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFolder';
	static LABEL = nls.localize('openFolder', "Open Folder...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Thenable<any> {
		return this.dialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class OpenFileFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFileFolder';
	static LABEL = nls.localize('openFileFolder', "Open...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Thenable<any> {
		return this.dialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
	}
}

export class AddRootFolderAction extends Action {

	static readonly ID = 'workbench.action.addRootFolder';
	static LABEL = ADD_ROOT_FOLDER_LABEL;

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	run(): Thenable<any> {
		return this.commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
	}
}

export class GlobalRemoveRootFolderAction extends Action {

	static readonly ID = 'workbench.action.removeRootFolder';
	static LABEL = nls.localize('globalRemoveFolderFromWorkspace', "Remove Folder from Workspace...");

	constructor(
		id: string,
		label: string,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	run(): Thenable<any> {
		const state = this.contextService.getWorkbenchState();

		// Workspace / Folder
		if (state === WorkbenchState.WORKSPACE || state === WorkbenchState.FOLDER) {
			return this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID).then(folder => {
				if (folder) {
					return this.workspaceEditingService.removeFolders([folder.uri]).then(() => true);
				}

				return true;
			});
		}

		return Promise.resolve(true);
	}
}

export class SaveWorkspaceAsAction extends Action {

	static readonly ID = 'workbench.action.saveWorkspaceAs';
	static LABEL = nls.localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IFileDialogService private dialogService: IFileDialogService

	) {
		super(id, label);
	}

	run(): Thenable<any> {
		return this.getNewWorkspaceConfigPath().then(configPathUri => {
			if (configPathUri) {
				const configPath = configPathUri.fsPath;
				switch (this.contextService.getWorkbenchState()) {
					case WorkbenchState.EMPTY:
					case WorkbenchState.FOLDER:
						const folders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
						return this.workspaceEditingService.createAndEnterWorkspace(folders, configPath);

					case WorkbenchState.WORKSPACE:
						return this.workspaceEditingService.saveAndEnterWorkspace(configPath);
				}
			}

			return null;
		});
	}

	private getNewWorkspaceConfigPath(): Thenable<URI> {
		return this.dialogService.showSaveDialog({
			saveLabel: mnemonicButtonLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultUri: this.dialogService.defaultWorkspacePath(Schemas.file)
		});
	}
}

export class OpenWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.openWorkspace';
	static LABEL = nls.localize('openWorkspaceAction', "Open Workspace...");

	constructor(
		id: string,
		label: string,
		@IFileDialogService private dialogService: IFileDialogService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): Thenable<any> {
		return this.dialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
	}
}

export class OpenWorkspaceConfigFileAction extends Action {

	static readonly ID = 'workbench.action.openWorkspaceConfigFile';
	static readonly LABEL = nls.localize('openWorkspaceConfigFile', "Open Workspace Configuration File");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IEditorService private editorService: IEditorService
	) {
		super(id, label);

		this.enabled = !!this.workspaceContextService.getWorkspace().configuration;
	}

	run(): Thenable<any> {
		return this.editorService.openEditor({ resource: this.workspaceContextService.getWorkspace().configuration });
	}
}

export class DuplicateWorkspaceInNewWindowAction extends Action {

	static readonly ID = 'workbench.action.duplicateWorkspaceInNewWindow';
	static readonly LABEL = nls.localize('duplicateWorkspaceInNewWindow', "Duplicate Workspace in New Window");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IWindowService private windowService: IWindowService,
		@IWorkspacesService private workspacesService: IWorkspacesService
	) {
		super(id, label);
	}

	run(): Thenable<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;

		return this.workspacesService.createWorkspace(folders).then(newWorkspace => {
			return this.workspaceEditingService.copyWorkspaceSettings(newWorkspace).then(() => {
				return this.windowService.openWindow([URI.file(newWorkspace.configPath)], { forceNewWindow: true });
			});
		});
	}
}
