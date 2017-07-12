/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IChoiceService, Severity } from "vs/platform/message/common/message";
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";

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
		@IChoiceService private choiceService: IChoiceService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService
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
