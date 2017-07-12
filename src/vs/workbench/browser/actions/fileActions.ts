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
import { IChoiceService, Severity } from "vs/platform/message/common/message";
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { WORKSPACE_EXTENSION, IWorkspacesService } from "vs/platform/workspaces/common/workspaces";

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

export class AddRootFolderAction extends Action {

	static ID = 'workbench.action.addRootFolder';
	static LABEL = nls.localize('addFolderToWorkspace', "Add Folder to Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IChoiceService private choiceService: IChoiceService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasMultiFolderWorkspace()) {
			return this.choiceService.choose(Severity.Info, nls.localize('notSupported', "Adding folder to this workspace is not supported."), [CreateWorkspaceAction.LABEL, nls.localize('cancel', "Cancel")], 1)
				.then(option => {
					if (option === 0) {
						return this.instantiationService.createInstance(CreateWorkspaceAction, CreateWorkspaceAction.ID, CreateWorkspaceAction.LABEL).run();
					}
					return null;
				});
		}

		return this.windowService.pickFolder({ buttonLabel: nls.localize('add', "Add"), title: nls.localize('addFolderToWorkspaceTitle', "Add Folder to Workspace") }).then(folders => {
			if (!folders.length) {
				return TPromise.as(null);
			}

			return this.workspaceEditingService.addRoots(folders.map(folder => URI.file(folder))).then(() => {
				return this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
			});
		});
	}
}

export class CreateWorkspaceAction extends Action {

	static ID = 'workbench.action.createWorkspace';
	static LABEL = nls.localize('createWorkspace', "Create Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.windowService.pickFolder({ buttonLabel: nls.localize('select', "Select"), title: nls.localize('selectWorkspace', "Select Folders") }).then(folders => {
			if (!folders.length) {
				return TPromise.as(null);
			}
			return this.workspaceEditingService.createAndOpenWorkspace(folders.map(folder => URI.file(folder)));
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

const codeWorkspaceFilter = [{ name: nls.localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];

export class SaveWorkspaceAction extends Action {

	static ID = 'workbench.action.saveWorkspace';
	static LABEL = nls.localize('saveWorkspaceAction', "Save Workspace...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IChoiceService private choiceService: IChoiceService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasMultiFolderWorkspace()) {
			return this.choiceService.choose(Severity.Info, nls.localize('notSupported2', "Saving a workspace is only possible when a workspace is opened."), [CreateWorkspaceAction.LABEL, nls.localize('cancel', "Cancel")], 1)
				.then(option => {
					if (option === 0) {
						return this.instantiationService.createInstance(CreateWorkspaceAction, CreateWorkspaceAction.ID, CreateWorkspaceAction.LABEL).run();
					}
					return null;
				});
		}

		const target = this.windowService.showSaveDialog({
			buttonLabel: nls.localize('save', "Save"),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: codeWorkspaceFilter
		});

		if (target) {
			const workspace = this.contextService.getWorkspace();
			return this.workspacesService.saveWorkspace({ id: workspace.id, configPath: workspace.configuration.fsPath }, target).then(workspace => {
				return this.windowsService.openWindow([workspace.configPath]);
			});
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
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const files = this.windowService.showOpenDialog({
			buttonLabel: nls.localize('open', "Open"),
			title: nls.localize('openWorkspace', "Open Workspace"),
			filters: codeWorkspaceFilter,
			properties: ['openFile']
		});

		if (!files || !files.length) {
			return TPromise.as(null);
		}

		return this.windowsService.openWindow([files[0]]);
	}
}