/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import { distinct } from 'vs/base/common/arrays';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WORKSPACE_FILTER } from 'vs/platform/workspaces/common/workspaces';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isLinux } from 'vs/base/common/platform';
import { dirname } from 'vs/base/common/paths';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isParent } from 'vs/platform/files/common/files';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class OpenFolderAction extends Action {

	static ID = 'workbench.action.files.openFolder';
	static LABEL = nls.localize('openFolder', "Open Folder...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickFolderAndOpen({ telemetryExtraData: data });
	}
}

export class OpenFileFolderAction extends Action {

	static ID = 'workbench.action.files.openFileFolder';
	static LABEL = nls.localize('openFileFolder', "Open...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(event?: any, data?: ITelemetryData): TPromise<any> {
		return this.windowService.pickFileFolderAndOpen({ telemetryExtraData: data });
	}
}

export abstract class BaseWorkspacesAction extends Action {

	constructor(
		id: string,
		label: string,
		protected windowService: IWindowService,
		protected environmentService: IEnvironmentService,
		protected contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	protected pickFolders(buttonLabel: string, title: string): string[] {
		let defaultPath: string;
		const workspace = this.contextService.getWorkspace();
		if (workspace.folders.length > 0) {
			defaultPath = dirname(workspace.folders[0].uri.fsPath); // pick the parent of the first root by default
		}

		return this.windowService.showOpenDialog({
			buttonLabel,
			title,
			properties: ['multiSelections', 'openDirectory', 'createDirectory'],
			defaultPath
		});
	}
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
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, windowService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		let addFoldersPromise: TPromise<void>;

		// Workspace
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const folders = super.pickFolders(mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"));
			if (!folders || !folders.length) {
				return TPromise.as(null);
			}

			addFoldersPromise = this.workspaceEditingService.addFolders(folders.map(folder => URI.file(folder)));
		}

		// Empty or Folder
		else {
			addFoldersPromise = this.instantiationService.createInstance(NewWorkspaceAction, NewWorkspaceAction.ID, NewWorkspaceAction.LABEL, this.contextService.getWorkspace().folders.map(folder => folder.uri)).run();
		}

		// Add and show Files Explorer viewlet
		return addFoldersPromise.then(() => this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true));
	}
}

class NewWorkspaceAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.newWorkspace';
	static LABEL = nls.localize('newWorkspace', "New Workspace...");

	constructor(
		id: string,
		label: string,
		private presetRoots: URI[],
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		super(id, label, windowService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		const folders = super.pickFolders(mnemonicButtonLabel(nls.localize({ key: 'select', comment: ['&& denotes a mnemonic'] }, "&&Select")), nls.localize('selectWorkspace', "Select Folders for Workspace"));
		if (folders && folders.length) {
			return this.createWorkspace([...this.presetRoots, ...folders.map(folder => URI.file(folder))]);
		}

		return TPromise.as(null);
	}

	private createWorkspace(folders: URI[]): TPromise<void> {
		const workspaceFolders = distinct(folders.map(folder => folder.fsPath), folder => isLinux ? folder : folder.toLowerCase());

		return this.workspaceEditingService.createAndOpenWorkspace(workspaceFolders);
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

export class SaveWorkspaceAsAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.saveWorkspaceAs';
	static LABEL = nls.localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		super(id, label, windowService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		const workspaceState = this.contextService.getWorkbenchState();
		if (workspaceState === WorkbenchState.EMPTY) {
			this.messageService.show(Severity.Info, nls.localize('saveEmptyWorkspaceNotSupported', "Please open a workspace first to save."));

			return TPromise.as(null);
		}

		const configPath = this.getNewWorkspaceConfigPath();
		if (configPath) {
			switch (workspaceState) {

				case WorkbenchState.FOLDER:
					const workspaceFolders = this.contextService.getWorkspace().folders.map(root => root.uri.fsPath);
					return this.workspaceEditingService.createAndOpenWorkspace(workspaceFolders, configPath);

				case WorkbenchState.WORKSPACE:
					return this.workspaceEditingService.saveAndOpenWorkspace(configPath);
			}
		}

		return TPromise.as(null);
	}

	private getNewWorkspaceConfigPath(): string {
		const workspace = this.contextService.getWorkspace();
		let defaultPath: string;
		if (workspace.configuration && !this.isUntitledWorkspace(workspace.configuration.fsPath)) {
			defaultPath = workspace.configuration.fsPath;
		} else if (workspace.folders.length > 0) {
			defaultPath = dirname(workspace.folders[0].uri.fsPath); // pick the parent of the first root by default
		}

		return this.windowService.showSaveDialog({
			buttonLabel: mnemonicButtonLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultPath
		});
	}

	private isUntitledWorkspace(path: string): boolean {
		return isParent(path, this.environmentService.workspacesHome, !isLinux /* ignore case */);
	}
}

export class OpenWorkspaceAction extends Action {

	static ID = 'workbench.action.openWorkspace';
	static LABEL = nls.localize('openWorkspaceAction', "Open Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.windowService.openWorkspace();
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