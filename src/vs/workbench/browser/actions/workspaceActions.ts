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
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { WORKSPACE_FILTER, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isLinux } from 'vs/base/common/platform';
import { dirname } from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { mnemonicButtonLabel, getPathLabel } from 'vs/base/common/labels';
import { isParent, FileKind } from 'vs/platform/files/common/files';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService, IFilePickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export class OpenFileAction extends Action {

	static ID = 'workbench.action.files.openFile';
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

	static ID = 'workbench.action.files.openFolder';
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

	static ID = 'workbench.action.files.openFileFolder';
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

export const openFileFolderInNewWindowCommand = (accessor: ServicesAccessor) => {
	const { windowService, historyService, contextService } = services(accessor);

	windowService.pickFileFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFilePath(contextService, historyService) } });
};

export const openFolderCommand = (accessor: ServicesAccessor, forceNewWindow: boolean) => {
	const { windowService, historyService, contextService } = services(accessor);

	windowService.pickFolderAndOpen({ forceNewWindow, dialogOptions: { defaultPath: defaultFolderPath(contextService, historyService) } });
};

export const openFolderInNewWindowCommand = (accessor: ServicesAccessor) => {
	const { windowService, historyService, contextService } = services(accessor);

	windowService.pickFolderAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFolderPath(contextService, historyService) } });
};

export const openFileInNewWindowCommand = (accessor: ServicesAccessor) => {
	const { windowService, historyService, contextService } = services(accessor);

	windowService.pickFileAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultFilePath(contextService, historyService) } });
};

export const openWorkspaceInNewWindowCommand = (accessor: ServicesAccessor) => {
	const { windowService, historyService, contextService, environmentService } = services(accessor);

	windowService.pickWorkspaceAndOpen({ forceNewWindow: true, dialogOptions: { defaultPath: defaultWorkspacePath(contextService, historyService, environmentService) } });
};

function services(accessor: ServicesAccessor): { windowService: IWindowService, historyService: IHistoryService, contextService: IWorkspaceContextService, environmentService: IEnvironmentService } {
	return {
		windowService: accessor.get(IWindowService),
		historyService: accessor.get(IHistoryService),
		contextService: accessor.get(IWorkspaceContextService),
		environmentService: accessor.get(IEnvironmentService)
	};
}

export abstract class BaseWorkspacesAction extends Action {

	constructor(
		id: string,
		label: string,
		protected windowService: IWindowService,
		protected environmentService: IEnvironmentService,
		protected contextService: IWorkspaceContextService,
		protected historyService: IHistoryService
	) {
		super(id, label);
	}

	protected pickFolders(buttonLabel: string, title: string): string[] {
		return this.windowService.showOpenDialog({
			buttonLabel,
			title,
			properties: ['multiSelections', 'openDirectory', 'createDirectory'],
			defaultPath: defaultFolderPath(this.contextService, this.historyService)
		});
	}
}

function defaultFilePath(contextService: IWorkspaceContextService, historyService: IHistoryService): string {
	let candidate: URI;

	// Check for last active file first...
	candidate = historyService.getLastActiveFile();

	// ...then for last active file root
	if (!candidate) {
		candidate = historyService.getLastActiveWorkspaceRoot('file');
	}

	return candidate ? dirname(candidate.fsPath) : void 0;
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

function defaultWorkspacePath(contextService: IWorkspaceContextService, historyService: IHistoryService, environmentService: IEnvironmentService): string {

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

export class AddRootFolderAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.addRootFolder';
	static LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		// @ts-ignore unused injected service
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, windowService, environmentService, contextService, historyService);
	}

	public run(): TPromise<any> {
		const folders = super.pickFolders(mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"));
		if (!folders || !folders.length) {
			return TPromise.as(null);
		}

		// Add and show Files Explorer viewlet
		return this.workspaceEditingService.addFolders(folders.map(folder => ({ uri: URI.file(folder) }))).then(() => this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true));
	}
}

export class GlobalRemoveRootFolderAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.removeRootFolder';
	static LABEL = nls.localize('globalRemoveFolderFromWorkspace', "Remove Folder from Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@ICommandService private commandService: ICommandService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, windowService, environmentService, contextService, historyService);
	}

	public run(): TPromise<any> {
		const state = this.contextService.getWorkbenchState();

		// Workspace / Folder
		if (state === WorkbenchState.WORKSPACE || state === WorkbenchState.FOLDER) {
			return this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND).then(folder => {
				if (folder) {
					return this.workspaceEditingService.removeFolders([folder.uri]).then(() => true);
				}

				return true;
			});
		}

		return TPromise.as(true);
	}
}

export class RemoveRootFolderAction extends Action {

	static ID = 'workbench.action.removeRootFolder';
	static LABEL = nls.localize('removeFolderFromWorkspace', "Remove Folder from Workspace");

	constructor(
		private rootUri: URI,
		id: string,
		label: string,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.workspaceEditingService.removeFolders([this.rootUri]);
	}
}

export class OpenFolderSettingsAction extends Action {

	static ID = 'workbench.action.openFolderSettings';
	static LABEL = nls.localize('openFolderSettings', "Open Folder Settings");

	constructor(
		private rootUri: URI,
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const workspaceFolder = this.contextService.getWorkspaceFolder(this.rootUri);

		return this.commandService.executeCommand('_workbench.action.openFolderSettings', workspaceFolder);
	}
}

export class SaveWorkspaceAsAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.saveWorkspaceAs';
	static LABEL = nls.localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, windowService, environmentService, contextService, historyService);
	}

	public run(): TPromise<any> {
		const configPath = this.getNewWorkspaceConfigPath();
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

		return TPromise.as(null);
	}

	private getNewWorkspaceConfigPath(): string {
		return this.windowService.showSaveDialog({
			buttonLabel: mnemonicButtonLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultPath: defaultWorkspacePath(this.contextService, this.historyService, this.environmentService)
		});
	}
}

export class OpenWorkspaceAction extends Action {

	static ID = 'workbench.action.openWorkspace';
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

	public static ID = 'workbench.action.openWorkspaceConfigFile';
	public static LABEL = nls.localize('openWorkspaceConfigFile', "Open Workspace Configuration File");

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

	public static ID = 'workbench.action.openFolderAsWorkspaceInNewWindow';
	public static LABEL = nls.localize('openFolderAsWorkspaceInNewWindow', "Open Folder as Workspace in New Window");

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
			folderPromise = this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND);
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

export const PICK_WORKSPACE_FOLDER_COMMAND = '_workbench.pickWorkspaceFolder';

CommandsRegistry.registerCommand(PICK_WORKSPACE_FOLDER_COMMAND, function (accessor: ServicesAccessor, args?: [IPickOptions, CancellationToken]) {
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