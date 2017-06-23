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
import { IWorkspaceContextService } from "vs/platform/workspace/common/workspace";
import { IWorkspaceEditingService } from "vs/workbench/services/workspace/common/workspaceEditing";
import URI from "vs/base/common/uri";
import { IViewletService } from "vs/workbench/services/viewlet/browser/viewlet";

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
	static LABEL = nls.localize('addFolder', "Add Root Folder...");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasWorkspace()) {
			return this.windowService.pickFolderAndOpen(false /* prefer same window */);
		}

		return this.windowService.pickFolder({ buttonLabel: nls.localize('add', "Add"), title: nls.localize('addRootFolder', "Add Root Folder") }).then(folders => {
			return this.workspaceEditingService.addRoots(folders.map(folder => URI.file(folder))).then(() => {
				return this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
			});
		});
	}
}

export class RemoveRootFolderAction extends Action {

	static ID = 'workbench.action.removeRootFolder';
	static LABEL = nls.localize('removeRootFolder', "Remove Root Folder");

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
