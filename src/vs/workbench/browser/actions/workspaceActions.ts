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
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { WORKSPACE_EXTENSION, IWorkspacesService } from "vs/platform/workspaces/common/workspaces";
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { isWindows, isLinux } from "vs/base/common/platform";
import { dirname } from "vs/base/common/paths";

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
		return this.windowService.pickFolderAndOpen(undefined, data);
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
		return this.windowService.pickFileFolderAndOpen(undefined, data);
	}
}

export abstract class BaseWorkspacesAction extends Action {

	constructor(
		id: string,
		label: string,
		protected windowService: IWindowService,
		protected instantiationService: IInstantiationService,
		protected environmentService: IEnvironmentService,
		protected contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	protected handleNotInMultiFolderWorkspaceCase(message: string): TPromise<any> {
		const newWorkspace = { label: this.mnemonicLabel(nls.localize({ key: 'create', comment: ['&& denotes a mnemonic'] }, "&&New Workspace")), canceled: false };
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
			detail: nls.localize('workspaceDetail', "Workspaces allow to open multiple folders at once."),
			noLink: true,
			type: 'info',
			buttons: buttons.map(button => button.label),
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			opts.defaultId = 1;
		}

		const res = this.windowService.showMessageBox(opts);
		if (!buttons[res].canceled) {
			return this.instantiationService.createInstance(NewWorkspaceAction, NewWorkspaceAction.ID, NewWorkspaceAction.LABEL).run();
		}

		return TPromise.as(null);
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
		}

		return label.replace(/&&/g, '&');
	}

	protected pickFolders(button: string, title: string): string[] {
		return this.windowService.showOpenDialog({
			buttonLabel: nls.localize('add', "Add"),
			title: nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"),
			properties: ['multiSelections', 'openDirectory', 'createDirectory'],
			defaultPath: this.contextService.hasWorkspace() ? dirname(this.contextService.getWorkspace().roots[0].fsPath) : void 0 // pick the parent of the first root by default
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(id, label, windowService, instantiationService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasMultiFolderWorkspace()) {
			return super.handleNotInMultiFolderWorkspaceCase(nls.localize('addSupported', "You can only add folders to workspaces. Do you want to create a new workspace?"));
		}

		const folders = super.pickFolders(nls.localize('add', "Add"), nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"));
		if (!folders || !folders.length) {
			return TPromise.as(null);
		}

		return this.workspaceEditingService.addRoots(folders.map(folder => URI.file(folder))).then(() => {
			return this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
		});
	}
}

export class NewWorkspaceAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.newWorkspace';
	static LABEL = nls.localize('newWorkspace', "New Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(id, label, windowService, instantiationService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		const folders = super.pickFolders(nls.localize('select', "Select"), nls.localize('selectWorkspace', "Select Folders for Workspace"));
		if (!folders || !folders.length) {
			return TPromise.as(null);
		}

		return this.workspaceEditingService.createAndOpenWorkspace(folders.map(folder => URI.file(folder)));
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

const codeWorkspaceFilter = [{ name: nls.localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];

export class SaveWorkspaceAction extends BaseWorkspacesAction {

	static ID = 'workbench.action.saveWorkspace';
	static LABEL = nls.localize('saveWorkspaceAction', "Save Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label, windowService, instantiationService, environmentService, contextService);
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasMultiFolderWorkspace()) {
			return super.handleNotInMultiFolderWorkspaceCase(nls.localize('saveNotSupported', "You need to open a workspace first to save it. Do you want to create a new workspace?"));
		}

		const target = this.windowService.showSaveDialog({
			buttonLabel: nls.localize('save', "Save"),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: codeWorkspaceFilter,
			defaultPath: dirname(this.contextService.getWorkspace().roots[0].fsPath) // pick the parent of the first root by default
		});

		if (target) {
			return this.contextService.saveWorkspace(URI.file(target));
		}

		return TPromise.as(false);
	}
}

export class OpenWorkspaceAction extends Action {

	static ID = 'workbench.action.openWorkspace';
	static LABEL = nls.localize('openWorkspaceAction', "Open Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const files = this.windowService.showOpenDialog({
			buttonLabel: nls.localize('open', "Open"),
			title: nls.localize('openWorkspace', "Open Workspace"),
			filters: codeWorkspaceFilter,
			properties: ['openFile'],
			defaultPath: this.contextService.hasWorkspace() ? dirname(this.contextService.getWorkspace().roots[0].fsPath) : void 0 // pick the parent of the first root by default
		});

		if (!files || !files.length) {
			return TPromise.as(null);
		}

		return this.windowsService.openWindow([files[0]]);
	}
}