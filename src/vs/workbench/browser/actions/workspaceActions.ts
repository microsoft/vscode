/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import { distinct } from 'vs/base/common/arrays';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { IWorkspacesService, WORKSPACE_FILTER } from "vs/platform/workspaces/common/workspaces";
import { IMessageService, Severity } from "vs/platform/message/common/message";
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { isLinux } from "vs/base/common/platform";
import { dirname } from "vs/base/common/paths";
import { mnemonicButtonLabel } from "vs/base/common/labels";
import { isParent } from "vs/platform/files/common/files";

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

	protected handleNotInMultiFolderWorkspaceCase(message: string, actionLabel: string): boolean {
		const newWorkspace = { label: mnemonicButtonLabel(actionLabel), canceled: false };
		const cancel = { label: nls.localize('cancel', "Cancel"), canceled: true };

		const buttons: { label: string; canceled: boolean; }[] = [];
		if (isLinux) {
			buttons.push(cancel, newWorkspace);
		} else {
			buttons.push(newWorkspace, cancel);
		}

		const opts: Electron.ShowMessageBoxOptions = {
			title: this.environmentService.appNameLong,
			message,
			noLink: true,
			type: 'question',
			buttons: buttons.map(button => button.label),
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			opts.defaultId = 1;
		}

		const res = this.windowService.showMessageBox(opts);
		return !buttons[res].canceled;
	}

	protected pickFolders(buttonLabel: string, title: string): string[] {
		return this.windowService.showOpenDialog({
			buttonLabel,
			title,
			properties: ['multiSelections', 'openDirectory', 'createDirectory'],
			defaultPath: this.contextService.hasWorkspace() ? dirname(this.contextService.getWorkspace().roots[0].fsPath) : void 0 // pick the parent of the first root by default
		});
	}
}

export class NewWorkspaceFromExistingAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.newWorkspaceFromExisting';
	static LABEL = nls.localize('newWorkspaceFormExisting', "New Workspace From Existing...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspacesService protected workspacesService: IWorkspacesService,
		@IWindowsService protected windowsService: IWindowsService,
	) {
		super(id, label, windowService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		let folders = this.pickFolders(mnemonicButtonLabel(nls.localize({ key: 'select', comment: ['&& denotes a mnemonic'] }, "&&Select")), nls.localize('selectWorkspace', "Select Folders for Workspace"));
		if (folders && folders.length) {
			if (this.contextService.hasWorkspace()) {
				return this.createWorkspace([this.contextService.getWorkspace().roots[0], ...folders.map(folder => URI.file(folder))]);
			}
		}

		return TPromise.as(null);
	}

	private createWorkspace(folders: URI[]): TPromise<void> {
		return this.workspacesService.createWorkspace(distinct(folders.map(folder => folder.toString(true /* encoding */))))
			.then(({ configPath }) => this.windowsService.openWindow([configPath]));
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
		if (!this.contextService.hasWorkspace()) {
			return this.instantiationService.createInstance(NewWorkspaceAction, NewWorkspaceAction.ID, NewWorkspaceAction.LABEL).run();
		}

		if (this.contextService.hasFolderWorkspace()) {
			if (this.handleNotInMultiFolderWorkspaceCase(nls.localize('addSupported', "Before we can add another folder we need to updgrade your workspace to support multiple folders and reload the window."), nls.localize({ key: 'upgradeAndAdd', comment: ['&& denotes a mnemonic'] }, "&&Upgrade and Add"))) {
				return this.instantiationService.createInstance(NewWorkspaceFromExistingAction, NewWorkspaceFromExistingAction.ID, NewWorkspaceFromExistingAction.LABEL).run();
			}
			return TPromise.as(null);
		}

		const folders = super.pickFolders(mnemonicButtonLabel(nls.localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"));
		if (!folders || !folders.length) {
			return TPromise.as(null);
		}

		return this.workspaceEditingService.addRoots(folders.map(folder => URI.file(folder))).then(() => {
			return this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
		});
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
		return this.workspaceEditingService.removeRoots([this.rootUri]);
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
		@IWorkspacesService protected workspacesService: IWorkspacesService,
		@IWindowsService private windowsService: IWindowsService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label, windowService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		if (this.contextService.hasFolderWorkspace()) {
			return this.saveFolderWorkspace();
		}

		if (this.contextService.hasMultiFolderWorkspace()) {
			return this.saveMultiFolderWorkspace();
		}

		this.messageService.show(Severity.Info, nls.localize('saveEmptyWorkspaceNotSupported', "Saving a workspace is not supported when the window is opened without a folder. Please open a folder first."));
		return TPromise.as(null);
	}

	private saveFolderWorkspace(): TPromise<void> {
		if (this.handleNotInMultiFolderWorkspaceCase(nls.localize('saveNotSupported', "Before we can save we need to upgrade your workspace to support multiple folders and reload the window."), nls.localize({ key: 'upgradeAndSave', comment: ['&& denotes a mnemonic'] }, "&&Upgrade and Save"))) {
			const configPath = this.getNewWorkspaceConfiPath();
			if (configPath) {
				// Create workspace first
				this.workspacesService.createWorkspace(this.contextService.getWorkspace().roots.map(root => root.toString(true /* skip encoding */)))
					.then(workspaceIdentifier => {
						// Save the workspace in new location
						return this.workspacesService.saveWorkspace(workspaceIdentifier, configPath)
							// Open the saved workspace
							.then(({ configPath }) => this.windowsService.openWindow([configPath]));
					});
			}
		}
		return TPromise.as(null);
	}

	private saveMultiFolderWorkspace(): TPromise<void> {
		const target = this.getNewWorkspaceConfiPath();

		if (target) {
			return this.contextService.saveWorkspace(URI.file(target));
		}

		return TPromise.as(null);
	}

	private getNewWorkspaceConfiPath(): string {
		const workspace = this.contextService.getWorkspace();
		let defaultPath: string;
		if (this.contextService.hasMultiFolderWorkspace() && !this.isUntitledWorkspace(workspace.configuration.fsPath)) {
			defaultPath = workspace.configuration.fsPath;
		} else {
			defaultPath = dirname(this.contextService.getWorkspace().roots[0].fsPath); // pick the parent of the first root by default
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
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.windowService.openWorkspace();
	}
}

export class NewWorkspaceAction extends Action {

	static ID = 'workbench.action.newWorkspace';
	static LABEL = nls.localize('newWorkspace', "New Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.windowService.newWorkspace();
	}
}