/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { WORKSPACE_FILTER, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID, defaultWorkspacePath, defaultFilePath, defaultFolderPath } from 'vs/workbench/browser/actions/workspaceCommands';

export class OpenFileAction extends Action {

	static readonly ID = 'workbench.action.files.openFile';
	static LABEL = nls.localize('openFile', "Open File...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IHistoryService private historyService: IHistoryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickFileAndOpen({ telemetryExtraData: data, dialogOptions: { defaultPath: defaultFilePath(this.contextService, this.historyService) } });
	}
}

export class OpenFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFolder';
	static LABEL = nls.localize('openFolder', "Open Folder...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IHistoryService private historyService: IHistoryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickFolderAndOpen({ telemetryExtraData: data, dialogOptions: { defaultPath: defaultFolderPath(this.contextService, this.historyService) } });
	}
}

export class OpenFileFolderAction extends Action {

	static readonly ID = 'workbench.action.files.openFileFolder';
	static LABEL = nls.localize('openFileFolder', "Open...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IHistoryService private historyService: IHistoryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickFileFolderAndOpen({ telemetryExtraData: data, dialogOptions: { defaultPath: defaultFilePath(this.contextService, this.historyService) } });
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

	public run(): TPromise<any> {
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

	public run(): TPromise<any> {
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

		return TPromise.as(true);
	}
}

export class SaveWorkspaceAsAction extends Action {

	static readonly ID = 'workbench.action.saveWorkspaceAs';
	static LABEL = nls.localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.getNewWorkspaceConfigPath().then(configPath => {
			if (configPath) {
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

	private getNewWorkspaceConfigPath(): TPromise<string> {
		return this.windowService.showSaveDialog({
			buttonLabel: mnemonicButtonLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultPath: defaultWorkspacePath(this.contextService, this.historyService, this.environmentService)
		});
	}
}

export class OpenWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.openWorkspace';
	static LABEL = nls.localize('openWorkspaceAction', "Open Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IHistoryService private historyService: IHistoryService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label);
	}

	public run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickWorkspaceAndOpen({ telemetryExtraData: data, dialogOptions: { defaultPath: defaultWorkspacePath(this.contextService, this.historyService, this.environmentService) } });
	}
}

export class OpenWorkspaceConfigFileAction extends Action {

	public static readonly ID = 'workbench.action.openWorkspaceConfigFile';
	public static readonly LABEL = nls.localize('openWorkspaceConfigFile', "Open Workspace Configuration File");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);

		this.enabled = !!this.workspaceContextService.getWorkspace().configuration;
	}

	public run(): TPromise<any> {
		return this.editorService.openEditor({ resource: this.workspaceContextService.getWorkspace().configuration });
	}
}

export class OpenFolderAsWorkspaceInNewWindowAction extends Action {

	public static readonly ID = 'workbench.action.openFolderAsWorkspaceInNewWindow';
	public static readonly LABEL = nls.localize('openFolderAsWorkspaceInNewWindow', "Open Folder as Workspace in New Window");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IWindowsService private windowsService: IWindowsService,
		@ICommandService private commandService: ICommandService,
		@IWorkspacesService private workspacesService: IWorkspacesService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;

		let folderPromise: TPromise<IWorkspaceFolder>;
		if (folders.length === 0) {
			folderPromise = TPromise.as(null);
		} else if (folders.length === 1) {
			folderPromise = TPromise.as(folders[0]);
		} else {
			folderPromise = this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		}

		return folderPromise.then(folder => {
			if (!folder) {
				return void 0; // need at least one folder
			}

			return this.workspacesService.createWorkspace([{ uri: folder.uri }]).then(newWorkspace => {
				return this.workspaceEditingService.copyWorkspaceSettings(newWorkspace).then(() => {
					return this.windowsService.openWindow([newWorkspace.configPath], { forceNewWindow: true });
				});
			});
		});
	}
}